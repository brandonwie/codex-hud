#!/bin/sh
# macOS gate for a pull request. GitHub CI runs the Linux leg; this script runs
# the same checks on a Mac and records the result on the pull request.
#
#   sh scripts/ci-mac-gate.sh <pr>         check the PR on this Mac, post the status
#   sh scripts/ci-mac-gate.sh --trust-head <head-sha> <pr>
#                                          same, for a PR whose commits fail the
#                                          provenance check, after you reviewed
#                                          its diff at exactly <head-sha>
#   sh scripts/ci-mac-gate.sh --trust-candidate <head-sha> <base-sha> <pr>
#                                          same, for a PR that targets another
#                                          branch than the default one, after you
#                                          reviewed the whole merge candidate:
#                                          the target at <base-sha> and the PR
#                                          at <head-sha>
#   sh scripts/ci-mac-gate.sh verify <pr>  exit 0 only when the PR's current merge
#                                          candidate has a green macOS result
#
# This gate is the only macOS check: no workflow uses a GitHub-hosted macOS
# runner (Brandon, 2026-11-22).
#
# Trust boundary: the run mode executes the PR's code (npm lifecycle scripts and
# tests) with this account's access: files, credentials, Keychain, SSH agent and
# the token that posts the status. The trusted repository is fixed below
# (trusted_host, trusted_repo): every GitHub call names it, GH_REPO, GH_HOST and
# the clone's defaults are ignored, and the merge ref is fetched from its URL.
# Before any fetch it requires:
#   0. The PR's base and head repositories and this clone's origin are the
#      trusted repository.
#   1. The PR branch lives in the base repository. Fork PRs are always refused:
#      their macOS leg stays unchecked (verify fails) until a maintainer
#      recreates the change on a branch of this repository.
#   2. Provenance: every PR commit has a verified signature, and its committer is
#      listed in scripts/ci-mac-gate-maintainers.txt (or is GitHub's web-flow
#      with a listed author). Code copied from a fork onto a branch keeps the
#      fork's commits and fails this check. --trust-head <sha> overrides it for
#      that exact head only, after a maintainer reviewed the diff.
#   3. A trusted target: the merge commit holds the target branch's contents
#      too, and the gate trusts only the repository's default branch. For any
#      other target it needs --trust-candidate <head> <base-tip>, naming the
#      exact merge candidate a maintainer reviewed (the target against the
#      default branch, and the PR's diff). That flag also covers provenance.
#
# The run mode checks GitHub's merge commit for the PR (refs/pull/<pr>/merge,
# the commit the old hosted job checked out) in a clean temporary checkout. It
# matches the old hosted job: the Node major set in ci.yml, the current Rust
# stable with rustfmt and clippy, `npm ci`, then scripts/ci-local.sh, at nice 10.
# The whole run, from the first GitHub read to the final status, has the old
# hosted job's deadline (GitHub's default 360 minutes): the public command
# always restarts itself as an internal worker under that deadline, and a
# timeout posts failure. It posts pending while it runs, then success or failure
# with a record of the candidate. If the candidate changed during the run (new
# head, retarget, base moved), it posts error or nothing, so the run must
# repeat. verify compares the record with the PR's current one.
set -u

context="ci-local / macOS"
trusted_host=github.com
trusted_repo=brandonwie/codex-hud
trusted_url="https://$trusted_host/$trusted_repo.git"
deadline_seconds=21600
status_post_seconds=120
maintainers_file=scripts/ci-mac-gate-maintainers.txt
rust_channel_url="https://static.rust-lang.org/dist/channel-rust-stable.toml"

die() {
  echo "ci-mac-gate: $*" >&2
  exit 1
}

short() {
  printf '%.12s' "$1"
}

full_sha() {
  case $1 in
    *[!0-9a-f]*) return 1 ;;
  esac
  [ ${#1} -eq 40 ]
}

# Git variables set by a calling hook would point git at another repository.
# GH_REPO and GH_HOST would point gh at another repository; every call below
# names the trusted one explicitly anyway.
unset GH_REPO GH_HOST
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_PREFIX GIT_NAMESPACE

cd "$(dirname "$0")/.." || exit 1
self="$(pwd)/scripts/ci-mac-gate.sh"

usage="usage: sh scripts/ci-mac-gate.sh [verify | --trust-head <head-sha> | --trust-candidate <head-sha> <base-sha>] <pr-number>"
mode=run
trust_head=
trust_base=
run_dir=
case ${1:-} in
  verify)
    mode=verify
    shift
    ;;
  --trust-head)
    [ $# -ge 3 ] || die "$usage"
    trust_head=$2
    shift 2
    full_sha "$trust_head" || die "--trust-head needs the full 40-character head SHA"
    ;;
  --trust-candidate)
    [ $# -ge 4 ] || die "$usage"
    trust_head=$2
    trust_base=$3
    shift 3
    if ! full_sha "$trust_head" || ! full_sha "$trust_base"; then
      die "--trust-candidate needs the full 40-character head and base SHAs"
    fi
    ;;
  __worker)
    # Internal: only the public run below starts this, under the deadline.
    [ $# -ge 5 ] || die "$usage"
    mode=worker
    run_dir=$2
    trust_head=$3
    trust_base=$4
    shift 4
    ;;
esac
pr=${1:-}
case $pr in
  '' | *[!0-9]*) die "$usage" ;;
esac
command -v gh >/dev/null 2>&1 || die "gh is required"

# Public run: restart as the worker under one deadline for the whole run. On a
# timeout, post failure on the head the worker recorded, with a short limit.
if [ "$mode" = run ]; then
  [ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"
  run_dir=$(mktemp -d) || die "mktemp failed"
  echo "ci-mac-gate: running PR $pr under a $((deadline_seconds / 60))-minute deadline"
  node scripts/run-with-deadline.js "$deadline_seconds" sh "$self" __worker "$run_dir" "$trust_head" "$trust_base" "$pr"
  rc=$?
  if [ "$rc" -eq 124 ] && [ -s "$run_dir/head" ]; then
    timed_head=$(cat "$run_dir/head")
    node scripts/run-with-deadline.js "$status_post_seconds" \
      gh api --hostname "$trusted_host" -X POST "repos/$trusted_repo/statuses/$timed_head" -f state=failure -f context="$context" \
      -f description="timeout: the gate passed its $((deadline_seconds / 60))-minute deadline; rerun" >/dev/null ||
      echo "ci-mac-gate: timed out, and posting the failure status failed" >&2
    echo "ci-mac-gate: timed out after $((deadline_seconds / 60)) minutes" >&2
  fi
  rm -rf "$run_dir"
  exit "$rc"
fi

# Every GitHub call goes to the trusted host and names the trusted repository.
ghapi() {
  gh api --hostname "$trusted_host" "$@"
}

post() {
  ghapi -X POST "repos/$trusted_repo/statuses/$head" \
    -f state="$1" -f context="$context" -f description="$2" >/dev/null
}

# Sets head, base_name, head_repo, base_repo, merge (GitHub's current merge
# commit for the PR), commit_count, default_branch (the repository's) and base
# (the current tip of the PR's current base branch).
read_candidate() {
  pr_line=$(ghapi "repos/$trusted_repo/pulls/$pr" \
    --jq '"\(.head.sha) \(.base.ref) \(.head.repo.full_name) \(.base.repo.full_name) \(.merge_commit_sha) \(.commits) \(.base.repo.default_branch)"') ||
    return 1
  read -r head base_name head_repo base_repo merge commit_count default_branch <<EOF
$pr_line
EOF
  base=$(ghapi "repos/$trusted_repo/git/ref/heads/$base_name" --jq .object.sha)
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

is_maintainer() {
  sed -e 's/#.*//' -e 's/[[:space:]]//g' -e '/^$/d' "$maintainers_file" | grep -Fqx -- "$1"
}

# Prints each PR commit that fails the provenance rule; returns 1 when the
# commit list cannot be read or does not match the PR.
untrusted_commits() {
  [ -s "$maintainers_file" ] || {
    echo "no maintainer list in $maintainers_file" >&2
    return 1
  }
  case $commit_count in
    '' | *[!0-9]*)
      echo "cannot read the PR's commit count" >&2
      return 1
      ;;
  esac
  [ "$commit_count" -le 250 ] || {
    echo "the PR has $commit_count commits; GitHub lists at most 250" >&2
    return 1
  }
  commits=$(ghapi --paginate "repos/$trusted_repo/pulls/$pr/commits?per_page=100" \
    --jq '.[] | "\(.sha) \(.commit.verification.verified) \(.committer.login) \(.author.login)"') || return 1
  listed=$(printf '%s\n' "$commits" | grep -c .)
  last=$(printf '%s\n' "$commits" | tail -n 1 | cut -d' ' -f1)
  [ "$listed" = "$commit_count" ] && [ "$last" = "$head" ] || {
    echo "the PR's commit list ($listed commits, last $last) does not match the PR ($commit_count commits, head $head)" >&2
    return 1
  }
  printf '%s\n' "$commits" | while read -r sha verified committer author; do
    if [ "$verified" = true ]; then
      is_maintainer "$committer" && continue
      [ "$committer" = web-flow ] && is_maintainer "$author" && continue
    fi
    echo "$sha (verified: $verified, committer: $committer, author: $author)"
  done
}

read_candidate || die "cannot read PR $pr"
[ "$base_repo" = "$trusted_repo" ] ||
  die "PR $pr belongs to $base_repo, not $trusted_repo; the gate checks only $trusted_repo"
case $merge in
  '' | null) die "PR $pr has no merge commit; resolve its merge conflict first" ;;
esac
candidate_record || die "cannot build the candidate record"
fork_note="PR $pr comes from $head_repo, not $base_repo. The gate never runs fork code on the Mac, so macOS stays unchecked: recreate the change on a branch of $base_repo and run the gate on that PR"

if [ "$mode" = verify ]; then
  [ "$head_repo" = "$base_repo" ] || die "$fork_note"
  latest=$(ghapi "repos/$trusted_repo/commits/$head/statuses" \
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

# Worker: trust checks first, before any state write, fetch or install.
origin_url=$(git remote get-url origin) || die "no origin remote"
case $origin_url in
  "git@$trusted_host:$trusted_repo" | "git@$trusted_host:$trusted_repo.git" | \
    "ssh://git@$trusted_host/$trusted_repo" | "ssh://git@$trusted_host/$trusted_repo.git" | \
    "https://$trusted_host/$trusted_repo" | "$trusted_url") ;;
  *) die "this clone's origin is $origin_url, not $trusted_repo on $trusted_host; run the gate from a clone of $trusted_url" ;;
esac
[ "$head_repo" = "$base_repo" ] || die "$fork_note"
if [ -n "$trust_head" ] && [ "$trust_head" != "$head" ]; then
  die "PR $pr head is $head, not the trusted $trust_head; review the new commits first"
fi
if [ -n "$trust_base" ] && [ "$trust_base" != "$base" ]; then
  die "PR $pr target $base_name is at $base, not the trusted $trust_base; review the target's new commits first"
fi
case $default_branch in
  '' | null) die "cannot read the default branch of $base_repo" ;;
esac
if [ "$base_name" != "$default_branch" ]; then
  [ -n "$trust_base" ] ||
    die "PR $pr targets $base_name, not the default branch $default_branch. The merge commit holds the target's contents, and the gate trusts only $default_branch.
Review the whole merge candidate without checking it out: the target against $default_branch (gh api repos/$trusted_repo/compare/$default_branch...$base) and the PR's diff (gh pr diff $pr --repo $trusted_repo). Then rerun with: sh scripts/ci-mac-gate.sh --trust-candidate $head $base $pr"
  echo "ci-mac-gate: --trust-candidate given; running target $base_name at $base, not the default branch"
fi
untrusted=$(untrusted_commits) || die "cannot check the provenance of PR $pr"
if [ -n "$untrusted" ]; then
  [ "$trust_head" = "$head" ] ||
    die "PR $pr has commits outside the maintainer provenance rule (signed and verified, committer in $maintainers_file):
$untrusted
Review the PR's diff without checking it out (gh pr diff $pr --repo $trusted_repo), then rerun with: sh scripts/ci-mac-gate.sh --trust-head $head $pr"
  echo "ci-mac-gate: --trust-head $head given; running commits outside the provenance rule:"
  echo "$untrusted"
fi
[ "$(uname -s)" = Darwin ] || die "run this on macOS; GitHub CI runs the Linux leg"
printf '%s\n' "$head" >"$run_dir/head" || die "cannot write the run state"
candidate="$head $base_name $base $merge"

tmp=$(mktemp -d) || die "mktemp failed"
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT TERM
src="$tmp/src"

# Fetch from the trusted URL, then check the fetched commit and both parents
# before anything is checked out.
git init -q "$src" || die "git init failed"
git -C "$src" fetch -q --depth=1 "$trusted_url" "refs/pull/$pr/merge" ||
  die "cannot fetch refs/pull/$pr/merge; the PR may have a merge conflict"
fetched=$(git -C "$src" rev-parse --verify -q 'FETCH_HEAD^{commit}') || die "cannot resolve the fetched merge commit"
parents=$(git -C "$src" cat-file -p "$fetched" | sed -n 's/^parent //p' | tr '\n' ' ')
[ "$fetched" = "$merge" ] && [ "$parents" = "$base $head " ] ||
  die "GitHub's merge commit is not $base_name + PR head yet (fetched $fetched, parents: $parents); retry in a minute"
git -C "$src" checkout -q --detach "$fetched" || die "checkout failed"

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
