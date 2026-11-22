#!/bin/sh
# macOS gate for a pull request. GitHub CI runs the Linux leg; this script runs
# the same checks on a Mac and records the result on the pull request.
#
#   sh scripts/ci-mac-gate.sh <pr>         check the PR on this Mac, post the status
#   sh scripts/ci-mac-gate.sh verify <pr>  exit 0 only when the PR's current merge
#                                          candidate has a green macOS result
#
# Trust boundary: the run mode executes the PR's code (npm lifecycle scripts and
# tests) with this account's access. It only checks PRs whose branch lives in
# the base repository, which only people with push access can write. Fork PRs
# get the hosted macOS job in .github/workflows/ci.yml instead.
#
# One macOS result name: the gate posts its commit status under the name of the
# hosted macOS job, "Test (macos-latest)". A required check with that name is met
# by the gate for same-repository PRs and by the hosted job for fork PRs.
#
# The run mode checks GitHub's merge commit for the PR (refs/pull/<pr>/merge,
# the commit the hosted job checked out) in a clean temporary checkout. It
# matches the old hosted job: the Node major set in ci.yml, the current Rust
# stable with rustfmt and clippy, `npm ci`, then scripts/ci-local.sh, at nice 10.
# It posts pending while it runs, then success or failure with the full merge
# and base SHAs. If the candidate changed during the run (new head, retarget,
# base moved), it posts error or nothing, so the run must repeat.
set -u

context="Test (macos-latest)"
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

post() {
  gh api -X POST "repos/{owner}/{repo}/statuses/$head" \
    -f state="$1" -f context="$context" -f description="$2" >/dev/null
}

# Sets head, base_name, head_repo, base_repo, merge (GitHub's current merge
# commit for the PR) and base (the current tip of the PR's current base branch).
read_candidate() {
  pr_line=$(gh api "repos/{owner}/{repo}/pulls/$pr" \
    --jq '"\(.head.sha) \(.base.ref) \(.head.repo.full_name) \(.base.repo.full_name) \(.merge_commit_sha)"') ||
    return 1
  read -r head base_name head_repo base_repo merge <<EOF
$pr_line
EOF
  base=$(gh api "repos/{owner}/{repo}/git/ref/heads/$base_name" --jq .object.sha)
}

read_candidate || die "cannot read PR $pr"
case $merge in
  '' | null) die "PR $pr has no merge commit; resolve its merge conflict first" ;;
esac

if [ "$mode" = verify ]; then
  if [ "$head_repo" != "$base_repo" ]; then
    conclusion=$(gh api "repos/{owner}/{repo}/commits/$head/check-runs" \
      --jq "[.check_runs[] | select(.name == \"$context\")][0].conclusion") ||
      die "cannot read checks for $head"
    [ "$conclusion" = success ] ||
      die "fork PR $pr head $(short "$head"): hosted \"$context\" is ${conclusion:-missing}"
    echo "ci-mac-gate: fork PR $pr head $(short "$head") is green on the hosted macOS job"
    exit 0
  fi
  latest=$(gh api "repos/{owner}/{repo}/commits/$head/statuses" \
    --jq "[.[] | select(.context == \"$context\")][0] | \"\(.state) \(.description)\"") ||
    die "cannot read statuses for $head"
  case $latest in
    "success merge $merge base $base node "*)
      echo "ci-mac-gate: PR $pr is green on macOS for merge $(short "$merge") ($base_name $(short "$base"))"
      exit 0
      ;;
    success*) die "PR $pr: the macOS status is for another merge candidate; run: sh scripts/ci-mac-gate.sh $pr" ;;
    '' | null*) die "PR $pr head $(short "$head") has no macOS status; run: sh scripts/ci-mac-gate.sh $pr" ;;
    *) die "PR $pr head $(short "$head") macOS status: $latest" ;;
  esac
fi

[ "$head_repo" = "$base_repo" ] ||
  die "PR $pr comes from $head_repo, not $base_repo; the gate runs only branches of $base_repo (fork PRs use the hosted macOS job)"
[ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"
candidate="$head $base_name $base $merge"

tmp=$(mktemp -d) || die "mktemp failed"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM
src="$tmp/src"

remote=$(git remote get-url origin) || die "no origin remote"
git init -q "$src" || die "git init failed"
git -C "$src" fetch -q --depth=1 "$remote" "refs/pull/$pr/merge" ||
  die "cannot fetch refs/pull/$pr/merge; the PR may have a merge conflict"
git -C "$src" checkout -q --detach FETCH_HEAD || die "checkout failed"
fetched=$(git -C "$src" rev-parse HEAD) || die "rev-parse failed"
parents=$(git -C "$src" cat-file -p HEAD | sed -n 's/^parent //p' | tr '\n' ' ')
[ "$fetched" = "$merge" ] && [ "$parents" = "$base $head " ] ||
  die "GitHub's merge commit is not $base_name + PR head yet (fetched $fetched, parents: $parents); retry in a minute"

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

tested_head=$head
read_candidate || die "cannot read PR $pr after the run; status left pending"
[ "$head" = "$tested_head" ] || die "PR $pr head moved during the run; rerun for the new head"
if [ "$head $base_name $base $merge" != "$candidate" ]; then
  post error "stale: base, target or merge commit changed during the run; rerun the gate" || true
  die "PR $pr candidate changed during the run (was: $candidate; now: $head $base_name $base $merge); posted error, rerun"
fi

description="merge $merge base $base node $node_version rustc $rustc_version ${elapsed}s"
post "$state" "$description" || die "checks finished ($state) but posting the status failed"
echo "ci-mac-gate: posted \"$context\" = $state on $(short "$head"): $description"
[ "$state" = success ]
