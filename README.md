# Codex HUD

Codex HUD is a local Codex plugin that shows a multiline workspace HUD for
Codex CLI sessions.

It is intentionally a companion to Codex's native `[tui].status_line`, not a
replacement. Codex CLI 0.137 exposes a configurable single-line status item
array; it does not currently expose a Claude-style `statusLine.command` renderer
that a plugin can replace with arbitrary multiline output.

## What It Shows

- Codex version, model, reasoning effort, sandbox, and approval mode
- Native Codex status-line item count and color setting
- Compact usage parsed from Codex rollout logs, for example
  `CTX 34% | Sesh 33%(3.3h) | Week 47%(3.7d)`
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
- Add a true TUI renderer if Codex adds a custom status-line or panel extension
  surface.
- Add screenshots once the Codex plugin directory card is ready for publishing.
