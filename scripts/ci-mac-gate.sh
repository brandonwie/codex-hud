#!/bin/sh
# macOS gate for a pull request. GitHub CI runs the Linux leg; this script runs
# the same checks on a Mac and records the result on the pull request.
#
#   sh scripts/ci-mac-gate.sh <pr>         check the PR on this Mac, post the status
#   sh scripts/ci-mac-gate.sh verify <pr>  exit 0 only when that status is green
#                                          for the PR's current head and base
#
# Trust boundary: the run mode executes the PR's code (npm lifecycle scripts and
# tests) with this account's access. It only checks PRs whose branch lives in
# the base repository, which only people with push access can write. Fork PRs
# get the hosted macOS job in .github/workflows/ci.yml instead.
#
# The run mode checks GitHub's merge commit for the PR (refs/pull/<pr>/merge,
# the commit the hosted job checked out) in a clean temporary checkout. It
# matches the old hosted job: the Node major set in ci.yml, the current Rust
# stable with rustfmt and clippy, `npm ci`, then scripts/ci-local.sh, at nice 10.
# It posts the commit status "ci-local / macOS" on the PR head: pending while it
# runs, then success or failure with the full merge and base SHAs. If the base
# branch moves during the run, it posts error instead, so the run must repeat.
set -u

context="ci-local / macOS"
rust_channel_url="https://static.rust-lang.org/dist/channel-rust-stable.toml"

die() {
  echo "ci-mac-gate: $*" >&2
  exit 1
}

short() {
  printf '%.12s' "$1"
}

# Git variables set by a calling hook would point git at another repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_PREFIX GIT_NAMESPACE

cd "$(dirname "$0")/.." || exit 1

mode=run
if [ "${1:-}" = verify ]; then
  mode=verify
  shift
fi
pr=${1:-}
case $pr in
  '' | *[!0-9]*) die "usage: sh scripts/ci-mac-gate.sh [verify] <pr-number>" ;;
esac
command -v gh >/dev/null 2>&1 || die "gh is required"

read_pr() {
  gh api "repos/{owner}/{repo}/pulls/$pr" \
    --jq '"\(.head.sha) \(.base.ref) \(.head.repo.full_name) \(.base.repo.full_name)"'
}

base_tip() {
  gh api "repos/{owner}/{repo}/git/ref/heads/$base_name" --jq .object.sha
}

post() {
  gh api -X POST "repos/{owner}/{repo}/statuses/$head" \
    -f state="$1" -f context="$context" -f description="$2" >/dev/null
}

pr_line=$(read_pr) || die "cannot read PR $pr"
read -r head base_name head_repo base_repo <<EOF
$pr_line
EOF
base=$(base_tip) || die "cannot read branch $base_name"

if [ "$mode" = verify ]; then
  latest=$(gh api "repos/{owner}/{repo}/commits/$head/statuses" \
    --jq "[.[] | select(.context == \"$context\")][0] | \"\(.state) \(.description)\"") ||
    die "cannot read statuses for $head"
  case $latest in
    "success merge "*" base $base node "*)
      echo "ci-mac-gate: PR $pr head $(short "$head") is green on macOS for base $(short "$base")"
      exit 0
      ;;
    success*) die "PR $pr: the macOS status is for another base; run: sh scripts/ci-mac-gate.sh $pr" ;;
    '' | null*) die "PR $pr head $(short "$head") has no macOS status; run: sh scripts/ci-mac-gate.sh $pr" ;;
    *) die "PR $pr head $(short "$head") macOS status: $latest" ;;
  esac
fi

[ "$head_repo" = "$base_repo" ] ||
  die "PR $pr comes from $head_repo, not $base_repo; the gate runs only branches of $base_repo (fork PRs use the hosted macOS job)"
[ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"

tmp=$(mktemp -d) || die "mktemp failed"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM
src="$tmp/src"

remote=$(git remote get-url origin) || die "no origin remote"
git init -q "$src" || die "git init failed"
git -C "$src" fetch -q --depth=1 "$remote" "refs/pull/$pr/merge" ||
  die "cannot fetch refs/pull/$pr/merge; the PR may have a merge conflict"
git -C "$src" checkout -q --detach FETCH_HEAD || die "checkout failed"
merge=$(git -C "$src" rev-parse HEAD) || die "rev-parse failed"
parents=$(git -C "$src" cat-file -p HEAD | sed -n 's/^parent //p' | tr '\n' ' ')
[ "$parents" = "$base $head " ] ||
  die "GitHub's merge commit is not $base_name + PR head yet (parents: $parents); retry in a minute"

want_node=$(sed -n 's/^ *node-version: *["'\'']\{0,1\}\([0-9][0-9]*\).*/\1/p' "$src/.github/workflows/ci.yml" | head -n 1)
[ -n "$want_node" ] || die "no node-version in .github/workflows/ci.yml"
node_version=$(cd "$src" && node -p process.versions.node) || die "node not found"
[ "${node_version%%.*}" = "$want_node" ] ||
  die "CI uses Node $want_node, this shell has Node $node_version; select Node $want_node (asdf: ASDF_NODEJS_VERSION=<$want_node.x.y>) and rerun"

curl -fsSL -o "$tmp/channel.toml" "$rust_channel_url" || die "cannot read the current Rust stable version"
stable=$(sed -n '/^\[pkg\.rustc\]$/,/^\[/s/^version = "\([0-9.]*\) .*/\1/p' "$tmp/channel.toml")
[ -n "$stable" ] || die "no rustc version in $rust_channel_url"
rustc_line=$(cd "$src" && rustc -V) || die "rustc not found"
rustc_version=${rustc_line#rustc }
rustc_version=${rustc_version%% *}
[ "$rustc_version" = "$stable" ] ||
  die "CI uses Rust stable $stable, this shell has rustc $rustc_version; select Rust $stable and rerun"
(cd "$src" && cargo fmt --version >/dev/null) || die "rustfmt is missing for Rust $rustc_version"
(cd "$src" && cargo clippy --version >/dev/null) || die "clippy is missing for Rust $rustc_version"

echo "ci-mac-gate: PR $pr merge $merge = $base_name $base + head $head"
echo "ci-mac-gate: Node $node_version, Rust $rustc_version (stable), $(uname -sm)"
post pending "running on merge $(short "$merge") base $(short "$base")" || die "cannot post the pending status"

start=$(date +%s)
state=success
(cd "$src" && nice -n 10 npm ci) || state=failure
if [ "$state" = success ]; then
  nice -n 10 sh "$src/scripts/ci-local.sh" || state=failure
fi
elapsed=$(($(date +%s) - start))

pr_line=$(read_pr) || die "cannot read PR $pr after the run; status left pending"
read -r now_head _ <<EOF
$pr_line
EOF
[ "$now_head" = "$head" ] || die "PR $pr head moved during the run; rerun for the new head"
now_base=$(base_tip) || die "cannot read branch $base_name after the run; status left pending"
if [ "$now_base" != "$base" ]; then
  post error "stale: $base_name moved during the run; rerun the gate" || true
  die "$base_name moved during the run; posted error, rerun"
fi

description="merge $merge base $base node $node_version rustc $rustc_version ${elapsed}s"
post "$state" "$description" || die "checks finished ($state) but posting the status failed"
echo "ci-mac-gate: posted \"$context\" = $state on $(short "$head"): $description"
[ "$state" = success ]
