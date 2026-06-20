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

## Maintainer scripts

| Command | Purpose |
| ------- | ------- |
| `npm test` | Build `codex-hud` and run config, installer, version, golden, README, and site checks. |
| `npm run test:rust` | Build `codex-hud` and run Rust golden, parsing, and CLI tests. |
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
