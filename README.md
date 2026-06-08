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
  `gpt-5.5 xHigh · 3b git:(main*) · CTX:34% | 5H:33%(3.3H) | 7D:47%(3.7D)`
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
`~/.local/bin/codex-hud-tui`, a launcher that passes the HUD command through
Codex's `-c tui.status_line_command=...` override without changing
`~/.codex/config.toml`. It refuses to overwrite `codex` unless you explicitly
pass `--replace-codex`.

Launch a HUD-enabled session with:

```bash
codex-hud-tui
```

If you prefer a persistent config, add the printed line under your existing
`[tui]` table, but note that stock Codex versions may reject unknown fields:

```toml
status_line_command = "node /Users/brandonwie/dev/personal/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line"
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
