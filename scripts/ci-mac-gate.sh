#!/bin/sh
# macOS gate for a pull request. GitHub CI runs the Linux leg; this script runs
# the same checks on a Mac and records the result on the pull request.
#
#   sh scripts/ci-mac-gate.sh <pr>         check the PR on this Mac, post the status
#   sh scripts/ci-mac-gate.sh verify <pr>  exit 0 only when that status is green
#                                          for the PR's current head and base
#
# The run mode checks GitHub's merge commit for the PR (refs/pull/<pr>/merge,
# the commit the hosted job checked out) in a clean temporary checkout: npm ci,
# then scripts/ci-local.sh at nice 10. It needs the Node major that
# .github/workflows/ci.yml sets. It posts the commit status "ci-local / macOS"
# on the PR head with the merge, base, Node and rustc versions it used.
set -u

context="ci-local / macOS"

die() {
  echo "ci-mac-gate: $*" >&2
  exit 1
}

short() {
  printf '%.12s' "$1"
}

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

pr_head() {
  gh api "repos/{owner}/{repo}/pulls/$pr" --jq .head.sha
}

head=$(pr_head) || die "cannot read PR $pr"
base_name=$(gh api "repos/{owner}/{repo}/pulls/$pr" --jq .base.ref) || die "cannot read PR $pr"
base=$(gh api "repos/{owner}/{repo}/git/ref/heads/$base_name" --jq .object.sha) ||
  die "cannot read branch $base_name"

if [ "$mode" = verify ]; then
  latest=$(gh api "repos/{owner}/{repo}/commits/$head/statuses" \
    --jq "[.[] | select(.context == \"$context\")][0] | \"\(.state) \(.description)\"") ||
    die "cannot read statuses for $head"
  case $latest in
    "success "*" base $(short "$base") "*)
      echo "ci-mac-gate: PR $pr head $(short "$head") is green on macOS: ${latest#success }"
      exit 0
      ;;
    success*) die "PR $pr: the macOS status is for an older base; run: sh scripts/ci-mac-gate.sh $pr" ;;
    '' | null*) die "PR $pr head $(short "$head") has no macOS status; run: sh scripts/ci-mac-gate.sh $pr" ;;
    *) die "PR $pr head $(short "$head") macOS status: $latest" ;;
  esac
fi

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
merge=$(git -C "$src" rev-parse HEAD)
parents=$(git -C "$src" cat-file -p HEAD | sed -n 's/^parent //p' | tr '\n' ' ')
[ "$parents" = "$base $head " ] ||
  die "GitHub's merge commit is not $base_name + PR head yet (parents: $parents); retry in a minute"

want_node=$(sed -n 's/^ *node-version: *\([0-9][0-9]*\).*/\1/p' "$src/.github/workflows/ci.yml" | head -n 1)
node_version=$(cd "$src" && node -p process.versions.node) || die "node not found"
[ -n "$want_node" ] || die "no node-version in .github/workflows/ci.yml"
[ "${node_version%%.*}" = "$want_node" ] ||
  die "CI uses Node $want_node, this shell has Node $node_version; select Node $want_node (asdf: ASDF_NODEJS_VERSION=<$want_node.x.y>) and rerun"
rustc_version=$(cd "$src" && rustc -V | cut -d' ' -f2) || die "rustc not found"

echo "ci-mac-gate: PR $pr merge $(short "$merge") = $base_name $(short "$base") + head $(short "$head")"
echo "ci-mac-gate: Node $node_version, rustc $rustc_version, $(uname -sm)"

start=$(date +%s)
state=success
(cd "$src" && nice -n 10 npm ci --no-audit --no-fund) || state=failure
if [ "$state" = success ]; then
  nice -n 10 sh "$src/scripts/ci-local.sh" || state=failure
fi
elapsed=$(($(date +%s) - start))

now_head=$(pr_head) || die "cannot read PR $pr"
[ "$now_head" = "$head" ] || die "PR $pr head moved during the run; status not posted, rerun"

description="merge $(short "$merge") base $(short "$base") node $node_version rustc $rustc_version ${elapsed}s"
gh api -X POST "repos/{owner}/{repo}/statuses/$head" \
  -f state="$state" -f context="$context" -f description="$description" >/dev/null ||
  die "checks finished ($state) but posting the status failed"
echo "ci-mac-gate: posted \"$context\" = $state on $(short "$head"): $description"
[ "$state" = success ]
