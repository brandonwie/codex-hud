#!/bin/sh
# macOS gate for a pull request. GitHub CI runs the Linux leg; this script runs
# the same checks on a Mac and records the result on the pull request.
#
#   sh scripts/ci-mac-gate.sh <pr>         check the PR on this Mac, post the status
#   sh scripts/ci-mac-gate.sh verify <pr>  exit 0 only when the PR's current merge
#                                          candidate has a green macOS result
#
# This gate is the only macOS check: no workflow uses a GitHub-hosted macOS
# runner (Brandon, 2026-11-22).
#
# Trust boundary: the run mode executes the PR's code (npm lifecycle scripts and
# tests) with this account's access: files, credentials, Keychain, SSH agent and
# the token that posts the status. It only checks PRs whose branch lives in the
# base repository, which only people with push access can write. It never runs
# fork code. A fork PR gets the Linux CI job only; its macOS leg stays unchecked
# (verify fails) until a maintainer recreates the change on a branch of this
# repository and runs the gate on that PR.
#
# The run mode checks GitHub's merge commit for the PR (refs/pull/<pr>/merge,
# the commit the old hosted job checked out) in a clean temporary checkout. It
# matches the old hosted job: the Node major set in ci.yml, the current Rust
# stable with rustfmt and clippy, `npm ci`, then scripts/ci-local.sh, at nice 10.
# The whole run, from the first GitHub read to the final status, has the old
# hosted job's deadline (GitHub's default 360 minutes); a timeout posts failure.
# It posts pending while it runs, then success or failure with a record of the
# candidate. If the candidate changed during the run (new head, retarget, base
# moved), it posts error or nothing, so the run must repeat. verify compares the
# record with the PR's current one.
set -u

context="ci-local / macOS"
deadline_seconds=21600
status_post_seconds=120
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
self="$(pwd)/scripts/ci-mac-gate.sh"

usage="usage: sh scripts/ci-mac-gate.sh [verify] <pr-number>"
mode=run
if [ "${1:-}" = verify ]; then
  mode=verify
  shift
fi
pr=${1:-}
case $pr in
  '' | *[!0-9]*) die "$usage" ;;
esac
command -v gh >/dev/null 2>&1 || die "gh is required"

# Run mode: restart this script under one deadline for the whole run. On a
# timeout, post failure on the head the run recorded, with its own short limit.
if [ "$mode" = run ] && [ -z "${CI_MAC_GATE_RUN_DIR:-}" ]; then
  [ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"
  run_dir=$(mktemp -d) || die "mktemp failed"
  CI_MAC_GATE_RUN_DIR=$run_dir node scripts/run-with-deadline.js "$deadline_seconds" sh "$self" "$pr"
  rc=$?
  if [ "$rc" -eq 124 ] && [ -s "$run_dir/head" ]; then
    timed_head=$(cat "$run_dir/head")
    node scripts/run-with-deadline.js "$status_post_seconds" \
      gh api -X POST "repos/{owner}/{repo}/statuses/$timed_head" -f state=failure -f context="$context" \
      -f description="timeout: the gate passed its $((deadline_seconds / 60))-minute deadline; rerun" >/dev/null ||
      echo "ci-mac-gate: timed out, and posting the failure status failed" >&2
    echo "ci-mac-gate: timed out after $((deadline_seconds / 60)) minutes" >&2
  fi
  rm -rf "$run_dir"
  exit "$rc"
fi

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

# The candidate record: full merge and base SHAs, and the base branch. A branch
# name that would push the record past GitHub's 140-character description limit
# is stored as "refid" + the first 24 hex digits of its Git blob hash instead.
candidate_record() {
  record="merge $merge base $base ref $base_name"
  if [ ${#record} -gt 140 ]; then
    ref_id=$(printf '%s' "$base_name" | git hash-object --stdin) || return 1
    record="merge $merge base $base refid $(printf '%.24s' "$ref_id")"
  fi
}

read_candidate || die "cannot read PR $pr"
case $merge in
  '' | null) die "PR $pr has no merge commit; resolve its merge conflict first" ;;
esac
candidate_record || die "cannot build the candidate record"
fork_note="PR $pr comes from $head_repo, not $base_repo. The gate never runs fork code on the Mac, so macOS stays unchecked: recreate the change on a branch of $base_repo and run the gate on that PR"

if [ "$mode" = verify ]; then
  [ "$head_repo" = "$base_repo" ] || die "$fork_note"
  latest=$(gh api "repos/{owner}/{repo}/commits/$head/statuses" \
    --jq "[.[] | select(.context == \"$context\")][0] | \"\(.state) \(.description)\"") ||
    die "cannot read statuses for $head"
  case $latest in
    "success $record" | "success $record "*)
      echo "ci-mac-gate: PR $pr is green on macOS for merge $(short "$merge") ($base_name $(short "$base"))"
      exit 0
      ;;
    success*) die "PR $pr: the macOS status is for another merge candidate; run: sh scripts/ci-mac-gate.sh $pr" ;;
    '' | null*) die "PR $pr head $(short "$head") has no macOS status; run: sh scripts/ci-mac-gate.sh $pr" ;;
    *) die "PR $pr head $(short "$head") macOS status: $latest" ;;
  esac
fi

[ "$head_repo" = "$base_repo" ] || die "$fork_note"
[ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"
printf '%s\n' "$head" >"$CI_MAC_GATE_RUN_DIR/head" || die "cannot write the run state"
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
echo "ci-mac-gate: checks $state in ${elapsed}s"

tested_head=$head
read_candidate || die "cannot read PR $pr after the run; status left pending"
[ "$head" = "$tested_head" ] || die "PR $pr head moved during the run; rerun for the new head"
if [ "$head $base_name $base $merge" != "$candidate" ]; then
  post error "stale: base, target or merge commit changed during the run; rerun the gate" || true
  die "PR $pr candidate changed during the run (was: $candidate; now: $head $base_name $base $merge); posted error, rerun"
fi

# The record comes first and stays whole; extras are added only while the
# description fits GitHub's 140 characters.
description=$record
for extra in "node $node_version" "rustc $rustc_version" "${elapsed}s"; do
  [ $((${#description} + 1 + ${#extra})) -le 140 ] && description="$description $extra"
done
post "$state" "$description" || die "checks finished ($state) but posting the status failed"
echo "ci-mac-gate: posted \"$context\" = $state on $(short "$head"): $description"
[ "$state" = success ]
