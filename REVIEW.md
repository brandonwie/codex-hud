---
tags: [personal, reference]
created: 2026-10-09
updated: 2026-10-09
status: active
---

# Review guide

The single review standard for this repository. Every reviewer applies it:
people, Claude (`@claude review`, wired in `.github/workflows/claude.yml`
through the shared workflow `brandonwie/claude-review`), Codex and any other
agent. Where a general best practice disagrees with this file, this file wins.

## What to report

Report problems a maintainer would act on:

- **Bugs**: wrong HUD output, crashes, bad config precedence or TOML
  validation, rendering that breaks on null or missing data.
- **Security**: workflow permissions, shell injection, unsafe path handling,
  secret exposure.
- **Drift and invariant breaks**: anything in [Review areas](#review-areas).
- **Missing tests**: a behavior change with no matching update to the
  `scripts/test-*.js` suites or the goldens in `scripts/golden/`.

Skip formatting and pure style, personal preference, speculative refactors,
anything in [Do not flag](#do-not-flag), and restating what the diff does.

For each finding give `path:line`, the failure (input or state, then the wrong
result) and a suggested fix. Tag a severity:

| Severity | Meaning                                                                 |
| -------- | ----------------------------------------------------------------------- |
| P0       | Breaks a user's Codex install, leaks a secret, or opens a security hole |
| P1       | Wrong output or behavior a user will hit, or Rust/site drift            |
| P2       | Edge case, or a risk to the next change                                 |

If nothing meets the bar, say so in one line rather than padding the review.

## Context

codex-hud renders a compact, colored Codex status line and footer (segments
`model`, `project`, `branch`, `runtime`, `ctx`, `5h`, `7d`, `tkn`; see
`spec/config-schema.md`). Two rendering surfaces must agree for the same
config and inputs:

- `rust/src/*`: the `codex-hud` binary, the default renderer and the source of
  truth for defaults, segment order, colors and formatting.
- `site/app.js`: the GitHub Pages playground, a browser reimplementation that
  renders DOM spans. It must match the Rust renderer's visible output, styling
  and control set, and generated config TOML (checked on text and controls,
  not ANSI bytes).

Around them sit the Codex plugin manifest
(`plugins/codex-hud/.codex-plugin/plugin.json`, listed by
`.agents/plugins/marketplace.json`), the stock and patched-Codex installer and
launcher (`scripts/install-patched-codex.js`), the config schema
(`spec/config-schema.md`) and `README.md` with its localized `README.*.md`
translations.

The central risk is **cross-surface drift**: a change to output, color
resolution, segment order, thresholds, labels or token and percent formatting
in one surface that the other does not mirror. Byte-level changes to ANSI
colors, separators, labels, segment order, token or rate formatting, or config
merge semantics are product changes; review them across both surfaces.

## Review areas

1. **Cross-surface parity (primary).** Rendering, config defaults, color
   resolution, segment registry and order, pace and percent thresholds,
   effort, token and percent formatting, and separators change in lockstep in
   `rust/src/*` and `site/app.js`. Flag a one-sided change as a drift bug.
   Scrutinize any change to the `#rrggbb` to xterm-256 mapping
   (`nearest_xterm256` in `rust/src/colors.rs`). The frozen rules in
   `spec/config-schema.md` § Parity-critical invariants (JS `Math.round`,
   `k` rounding, color gate, empty-segment suppression and others) must not be
   "cleaned up".
2. **Parity coverage.** New rendering behavior needs matching golden or
   fixture updates on every surface it touches. The golden and CLI harnesses
   that drive the Rust binary pin the clock with `CODEX_HUD_NOW_MS` (read by
   `now_ms` in `rust/src/util.rs`); `scripts/test-parity.js` runs a shared
   input table through both engines; `scripts/check-site.js` covers site smoke
   and control parity.
3. **Correctness.** HUD output, config precedence, TOML validation, null-safe
   rendering.
4. **Installer safety.** No writes to stock Codex paths; the managed shim stays
   safe and removable (`--uninstall-shim`); patched installs stage before they
   activate and keep the previous payload under
   `~/.local/bin/codex-hud-codex.d/` for rollback; generated launchers keep
   `exec -a codex`; `npm run doctor` reports accurately.
5. **Plugin packaging and site.** The plugin manifest stays valid and the
   marketplace path (`./plugins/codex-hud`) resolves; no unnecessary runtime
   dependencies (`package.json` has none today). The site stays
   dependency-free static files with no external scripts or stylesheets. The
   version stays synced across `package.json`,
   `package-lock.json`, the plugin manifest, `rust/Cargo.toml`,
   `rust/Cargo.lock` and `site/index.html` (`scripts/sync-release-version.js`).
6. **Security.** Workflow permissions, shell injection, unsafe path handling,
   secret exposure, no external or CDN scripts in the site. Playground input
   stays in the browser: it reaches the page as text (`textContent`), never as
   HTML or evaluated code, and is never sent over the network.
7. **Maintainability.** Small CommonJS scripts, focused helpers, low
   abstraction overhead.
8. **Documentation.** `README.md` and the localized READMEs stay accurate on
   install, rollback, updates and limitations, and keep matching heading and
   code-block skeletons (`npm run check:i18n`). `spec/config-schema.md` tracks
   any config or rendering change.

## Do not flag

- CommonJS scripts are intentional (`"type": "commonjs"`); do not ask for ESM
  or TypeScript rewrites.
- The Rust renderer and the site playground duplicate rendering semantics on
  purpose; there is no shared module across runtimes. Do not ask for
  deduplication or a shared package. Do flag duplicated logic that has
  drifted.
- Golden fixtures may show escaped ANSI as `\x1b` text for readable diffs.
- The patched Codex footer path is optional, advanced and coupled to upstream
  Codex.
- `exec -a codex` in generated launchers is required so Herdr recognizes the
  process.
- Do not suggest modifying `/opt/homebrew/bin/codex` or other stock Codex
  install paths.
- Prefer focused additions to the existing `scripts/test-*.js` suites and
  goldens over new test frameworks.

## Verification

CI (`.github/workflows/ci.yml`, every pull request, Ubuntu and macOS) runs
`cargo fmt --manifest-path rust/Cargo.toml -- --check`,
`cargo clippy --manifest-path rust/Cargo.toml -- -D warnings`, `npm test` and
`npm run test:rust`; `release.yml` repeats them before a release, and the Husky
pre-commit hook runs `npm test`. Name the gates the change needs:

| Area changed                                  | Gate                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rust/src/*`                                  | `cargo fmt --manifest-path rust/Cargo.toml -- --check`, `cargo clippy --manifest-path rust/Cargo.toml -- -D warnings`, `npm test`, `npm run test:rust` |
| Rendering in either surface                   | `npm test` and `npm run test:rust` (goldens, parity)                                                                                                   |
| Intentional output grammar change             | `npm run golden:update`, then review the golden diff                                                                                                   |
| `site/*`                                      | `npm run site:check` (also run by the Pages workflow)                                                                                                  |
| `scripts/install-patched-codex.js`, launchers | `npm test` (installer suite); `npm run patch:codex:dry-run`                                                                                            |
| `README.md` or `README.*.md`                  | `npm run check:i18n`                                                                                                                                   |
| Version fields                                | `npm run sync:version`; `npm test` runs its `--check`                                                                                                  |
