# Contributing to Codex HUD

Issues and pull requests are welcome.

## Development workflow

After changing HUD output, run `npm test` and the Codex plugin validator. After
changing the manifest version or cutting a release, refresh the local plugin
cache for manual testing with `codex plugin add brandonwie@codex-hud`, then start
a new Codex thread so the refreshed skill metadata is loaded.

The Rust renderer (`rust/src/*`) and the site playground (`site/app.js`) must
stay in parity — Rust output is golden-tested and the site is
visible-output/control parity. After any rendering change, run `npm test` and
`npm run test:rust`.

When you touch `README.md`, mirror any heading or fenced-code change into the
localized `README.*.md` files and run `npm run check:i18n` — the checker enforces
matching heading and code-block skeletons across every translation.

## Checks before a push

`scripts/ci-local.sh` is the one list of CI checks: Rust format, clippy,
`npm test` and `npm run test:rust`. It runs every check and lists each one that
failed. It caps Cargo at 4 build jobs unless `CARGO_BUILD_JOBS` is set.

- GitHub runs it on Linux for each pull request, fork pull requests included,
  and for a manual run (`.github/workflows/ci.yml`). No workflow uses a
  GitHub-hosted macOS runner.
- The macOS leg runs only on a Mac, in two steps:
  - Early feedback: after `npm install` (run it in each clone or worktree, since
    it installs the hooks), `.husky/pre-push` runs the script at low priority
    (`nice -n 10`). The hook stops the push when `git status` fails, the working
    tree is dirty or the pushed ref is not `HEAD`.
  - Merge gate: after the push, `sh scripts/ci-mac-gate.sh <pr>` checks
    GitHub's merge commit for the pull request in a clean temporary checkout
    (`npm ci`, then the script). It requires the Node major that `ci.yml` uses
    and the current Rust stable with rustfmt and clippy. `npm ci` and the
    checks together get the old hosted job's deadline, 360 minutes; a timeout
    is a failure. It posts the commit status `ci-local / macOS` on the PR head:
    pending while it runs, then success or failure with the record
    `merge <sha> base <sha> ref <base-branch>`, or error when the base, the
    target branch or the merge commit changed during the run.
  - Fork pull requests: the gate runs the PR's code with your account's access,
    so it refuses a fork PR until a maintainer has read the PR's code. Then run
    `sh scripts/ci-mac-gate.sh --fork-reviewed <head-sha> <pr>` with the head
    SHA you read; the gate refuses when the PR head differs. Until then the
    fork PR has only the Linux CI result.
- Before a merge, `sh scripts/ci-mac-gate.sh verify <pr>` must exit 0, for fork
  and branch PRs alike. It needs a green `ci-local / macOS` status whose record
  matches the PR's current merge commit, base tip and base branch.

## Maintainer scripts

| Command | Purpose |
| ------- | ------- |
| `npm test` | Build `codex-hud` and run config, installer, version, pre-push hook, Mac gate, golden, README, and site checks. |
| `npm run test:rust` | Build `codex-hud` and run Rust golden, parsing, and CLI tests. |
| `sh scripts/ci-local.sh` | Run every CI check (Rust format, clippy, `npm test`, `npm run test:rust`) and list each failure. |
| `sh scripts/ci-mac-gate.sh [verify \| --fork-reviewed <sha>] <pr>` | Check a pull request's merge commit on macOS and post the `ci-local / macOS` status, or verify that status before a merge. |
| `npm run check:i18n` | Check localized README heading and code-block skeletons against `README.md`. |
| `npm run hud` | Run the built Rust HUD renderer directly. |
| `npm run build:rust` | Build the release Rust renderer. |
| `npm run measure:rust` | Report the real release-binary size (~574 KB) and `--line` latency, and compare the Rust renderer against the recovered legacy Node renderer. The Rust binary's own startup/render is effectively instant; end-to-end `--line` latency is bounded by the git subprocesses it shells out to, not Rust execution. |
| `npm run golden:update` | Refresh golden fixtures after an intentional output grammar change. |
| `npm run sync:version` | Fan out `package.json` version changes to lockfile, plugin manifest, Rust, and site metadata. |
| `npm run install:launcher` | Install the stock-delegating HUD launcher. |
| `npm run patch:codex` | Build and install the experimental patched Codex footer payload. |
| `npm run patch:codex:dry-run` | Preview the patched Codex build/install flow. |
| `npm run codex:check` | Print focused stock-vs-patched Codex drift state. |
| `npm run codex:sync` | Check patched drift and repair it with a metadata refresh or staged rebuild. |
| `npm run doctor` | Print launch-chain diagnostics. |
| `npm run release:dry-run` | Preview semantic-release output. |
| `npm run release` | Run semantic-release in CI. |
