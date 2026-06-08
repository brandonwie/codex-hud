# Codex HUD

Codex HUD is a local Codex plugin that shows a multiline workspace HUD for
Codex CLI sessions.

By default it is a companion to Codex's native `[tui].status_line`, because stock
Codex exposes a configurable built-in status item array but not a plugin-owned
renderer. This repo also ships a maintained patch path for users who want the
HUD script to render in the real Codex footer.

## What It Shows

- Codex version, model, reasoning effort, sandbox, and approval mode
- Native Codex status-line item count and color setting
- Compact usage parsed from Codex rollout logs, for example
  `5.5 xhigh | codex-hud main* node v24.16.0 | Ctx: 26% | 5h: 0%(4.4h,12%) | 7d: 6%(6.4d,9%) | Tkn: 36.1M(I:399k,O:583k,C:35.1M)`
- Current working directory, git branch, dirty counts, and repo root
- Project hints such as package name, nearby `AGENTS.md`, and 3B
  `ACTIVE-STATUS.md` priority when present
- Codex hook event counts from `hooks.json`
- A clear note that Codex's native status line remains authoritative for live
  token and rate-limit values

## Layout

```text
codex-hud/
├─ .agents/plugins/marketplace.json
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js
│     └─ skills/codex-hud/SKILL.md
└─ scripts/test-codex-hud.js
```

## Local Development

```bash
node plugins/codex-hud/scripts/codex-hud.js
node plugins/codex-hud/scripts/codex-hud.js --line
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json
node plugins/codex-hud/scripts/codex-hud.js --watch 5
npm test
```

## Patched Codex Footer

Stock Codex cannot render arbitrary plugin output under the input area. To get a
Claude-HUD-style footer, build a separate patched Codex command:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and
installs it as `~/.local/bin/codex-hud-codex`. It also writes
`~/.local/bin/codex-hud-tui`, a launcher that passes the colored HUD command through
Codex's `-c tui.status_line_command=...` override without changing
`~/.codex/config.toml`. The launcher runs the patched binary with `argv[0]` set
to `codex`, so terminal integrations such as Herdr can still recognize the pane
as a Codex session.

Safe launcher mode leaves your normal `codex` command alone:

```bash
codex-hud-tui
```

To make a fresh `codex` launch use the HUD-enabled TUI, opt in to the managed
shim:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` should resolve to `~/.local/bin/codex`. The installer refuses to
replace an existing `~/.local/bin/codex` unless you pass `--force-shim`, and it
still refuses to install the patched binary itself as `codex` unless you pass
`--replace-codex`.

Rollback removes only the managed `codex` shim:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

If you prefer a persistent config, add the printed line under your existing
`[tui]` table, but note that stock Codex versions may reject unknown fields:

```toml
status_line_command = "node /Users/brandonwie/dev/personal/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Run `codex-hud-tui` to see the compact footer. Homebrew or Codex updates will
not update this separate command; rerun `npm run patch:codex` after updating
Codex.

## Local Codex Install

```bash
codex plugin marketplace add /Users/brandonwie/dev/personal/codex-hud
codex plugin add codex-hud@codex-hud
```

Start a new Codex thread after installing or reinstalling so the skill list is
refreshed.

## Roadmap

- Add richer session transcript summaries if Codex exposes a stable local
  session-state API for plugins.
- Track upstream Codex status-line changes so the patch can be retired if a
  supported custom renderer lands.
- Add screenshots once the Codex plugin directory card is ready for publishing.
