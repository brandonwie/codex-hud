# Contributing to Codex HUD

Issues and pull requests are welcome.

## Development workflow

Run `npm ci` in each new clone or Git worktree before the first commit there.
It installs the Husky hooks: `core.hooksPath` is `.husky/_`, a path inside each
checkout, and in a checkout without it Git runs no pre-commit hook and gives no
warning.

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
  and for a manual run (`.github/workflows/ci.yml`), and again before a release
  (`.github/workflows/release.yml`, on pushes to `main`). A newer push to
  `main` can replace a Release run that has not started yet; the newer run then
  checks the newer commit. No workflow uses a GitHub-hosted macOS runner.
- The macOS leg runs only on a Mac:
  - Merge gate: after the push, `sh -p scripts/ci-mac-gate.sh <pr>` checks
    GitHub's merge commit for the pull request in a clean temporary checkout
    (`npm ci`, then the script). It requires the Node major that `ci.yml` uses
    and the current Rust stable with rustfmt and clippy. The whole run, from
    the first GitHub read to the final status, gets the old hosted job's
    deadline, 360 minutes. A timeout after the trust checks (below) posts
    failure; a timeout before them, while the gate still reads GitHub, posts
    nothing, and the gate needs a rerun. The gate's own state and the checkout
    sit in one temporary directory. The gate removes it when the run ends, also
    after the deadline stops the worker; if the gate command itself is
    interrupted or killed, the directory can stay behind. Temporary files that
    the checks make elsewhere (under `TMPDIR`) are theirs to clean. It posts
    the commit status
    `ci-local / macOS` on the PR head: pending while it runs, then success or
    failure with the record `merge <sha> base <sha> ref <base-branch>` (a base
    branch name too long for GitHub's 140-character description is stored as a
    fixed-length `refid`), or error when the base, the target branch or the
    merge commit changed during the run.
  - Start it with `sh -p`: macOS `/bin/sh` is bash, which without `-p` reads
    `SHELLOPTS`, `BASH_ENV` and exported functions from the environment
    before the gate's first line, so an inherited `SHELLOPTS=xtrace` would
    trace that line with `PS4` expanded. Under bash the gate refuses to start
    without `-p` and starts its worker with `-p`. It first reads the
    environment with `env`, `tr` and `sed` in the C locale and, if it finds
    exported bash functions, restarts itself once through `env` without them
    (version-manager shims such as asdf's are bash scripts, and a function
    named `exec` would run in place of the builtin). Then, before it starts
    any other program, it unsets `BASH_ENV`, `ENV` and `PS4` and stops
    exporting `SHELLOPTS` and `BASHOPTS`. dash reads none of these and drops
    exported functions itself.
  - Trust: the gate runs the PR's code with your account's access (files,
    credentials, Keychain, SSH agent, the status token). It works only on
    `brandonwie/codex-hud` on github.com: every GitHub call names that
    repository (`GH_REPO`, `GH_HOST` and the clone's defaults are ignored), the
    merge ref is fetched from its URL (refused when your Git config rewrites
    that URL with `url.<base>.insteadOf`; redirects limited to the first
    request for that exact URL, and refused when Git's effective
    `http.followRedirects` for it is not `initial`), and the fetched merge
    commit and both parents are checked before checkout. Refusals never print
    a rejected origin or rewritten URL, since either can hold a token, and the
    gate turns off shell tracing (`set +xv`), Git tracing (`GIT_TRACE*`,
    trace2 targets) and gh debug output, and discards the error output of every
    git and gh call (Git prints a malformed config key, URL included, in its
    own errors), printing a fixed message for each failed step instead. The
    gate uses no proxy: it removes every environment variable whose name
    contains `proxy` (`http_proxy`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`,
    `CARGO_HTTP_PROXY`, `GIT_PROXY_COMMAND`, ...) before any tool runs and
    fetches with Git's `http.proxy` set to empty for the trusted URL, so it
    needs a direct network connection. Without one, the merge-ref fetch and
    the Rust channel download fail with a fixed message, and `npm ci` or Cargo
    prints its own error for a package registry it cannot reach. That error
    holds no proxy setting and nothing from your configuration or
    environment, since none of it reaches the checks (below). A network that
    needs an extra CA certificate (`NODE_EXTRA_CA_CERTS`) is not supported
    either. The gate prints no curl error for the Rust channel download and
    unsets every `NODE_*` variable before Node starts (`NODE_DEBUG` prints a
    child's environment, `GH_TOKEN` included). It reads the variable names
    byte by byte in the C locale, so a value that is not UTF-8 cannot hide a
    variable from these removals, and it stops if it cannot read the whole
    environment. Its toolchain checks and the
    pull request's checks run through `scripts/run-isolated.sh`, like the
    hosted runner, in a new environment that holds only `PATH`, an empty
    `HOME` and `CARGO_HOME`, empty npm and global Git config files, no system
    Git config, and, when set, `CARGO_BUILD_JOBS`, `TMPDIR`, the locale,
    `TERM`, `USER` and `LOGNAME`. A value in your Cargo, npm, Git, rustfmt or
    Clippy config, or in any other variable (`CARGO_*`, `RUSTFMT`,
    `CLIPPY_CONF_DIR`, `npm_config_*`, `GIT_CONFIG_COUNT`, a proxy variable),
    cannot reach them. It stops when a Cargo, rustfmt or Clippy config file
    (`.cargo/config.toml`, `rustfmt.toml`, `clippy.toml`, or another name
    those tools read) sits above the temporary checkout. Your Git
    setup cannot add or change files in the checkout: the temporary repository
    starts from an empty template, every git call into it runs with hooks and
    fsmonitor off (`core.hooksPath=/dev/null`, `core.fsmonitor=false`), the
    `git init`, the reads of the fetched commit, checkout and status read no
    Git config or attributes of yours (empty global config, no system config
    or attributes, an empty `XDG_CONFIG_HOME`, no inherited `GIT_*` variable
    such as `GIT_CONFIG_COUNT`, `GIT_TEMPLATE_DIR` or `GIT_DEFAULT_HASH`), so
    settings such as `core.autocrlf` cannot change the checked-out bytes, and
    after checkout `git status --ignored` must list no file. Only the URL
    checks and the fetch read your Git config. The fetch makes up to three
    attempts, 10 and 20 seconds apart, like `actions/checkout`. Any rewrite of the fetch
    URL is refused, even to the same repository's bare URL. Before any fetch it refuses a clone
    whose origin is another repository, a pull request of another repository,
    and a fork PR. It also refuses a branch PR unless every commit has a
    verified signature from a committer listed in
    `scripts/ci-mac-gate-maintainers.txt` (or GitHub's `web-flow` with a listed
    author). Fork code copied onto a branch keeps its commits and is refused
    too. After reviewing such a PR's diff, run
    `sh -p scripts/ci-mac-gate.sh --trust-head <head-sha> <pr>`; the flag covers
    that exact head only.
  - Target branch: the merge commit also holds the target branch's contents,
    and the gate trusts only the repository's default branch (`main`). For a
    pull request into any other branch it refuses before checkout. Review the
    whole merge candidate without checking it out: the target against `main`
    (`gh api repos/{owner}/{repo}/compare/main...<base-sha>`) and the pull
    request's diff (`gh pr diff <pr>`). Then run
    `sh -p scripts/ci-mac-gate.sh --trust-candidate <head-sha> <base-sha> <pr>`;
    the flag covers that exact head and target tip only, and also covers
    provenance.
  - Fork pull requests get the Linux CI job only, and their macOS leg stays
    unchecked: `verify` fails for them. To check macOS, a maintainer recreates
    the change on a branch of this repository and runs the gate on that pull
    request.
- Imported code and local hooks: checking out or committing code from someone
  else runs the Husky hooks under your account (`pre-commit` runs `npm test`),
  and so does `npm install`. Review an
  imported change by its diff (`gh pr diff <pr>`) before you check it out or
  commit it. Do not skip or weaken the hooks to get around this.
- Before a merge, `sh -p scripts/ci-mac-gate.sh verify <pr>` must exit 0. It needs
  a green `ci-local / macOS` status whose record matches the PR's current merge
  commit, base tip and base branch.

## Maintainer scripts

| Command | Purpose |
| ------- | ------- |
| `npm test` | Build `codex-hud` and run config, installer, version, Mac gate, golden, README, and site checks. Needs Rust with rustfmt and Clippy: some Mac gate cases run them offline on a one-file crate. |
| `npm run test:rust` | Build `codex-hud` and run Rust golden, parsing, and CLI tests. |
| `sh scripts/ci-local.sh` | Run every CI check (Rust format, clippy, `npm test`, `npm run test:rust`) and list each failure. |
| `sh -p scripts/ci-mac-gate.sh [verify \| --trust-head <sha> \| --trust-candidate <head> <base>] <pr>` | Check a pull request's merge commit on macOS and post the `ci-local / macOS` status, or verify that status before a merge. |
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
