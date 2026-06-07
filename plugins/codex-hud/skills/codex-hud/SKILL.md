---
name: codex-hud
description: Show a multiline Codex workspace HUD with local config, git state, hooks, and project hints. Use when the user says "codex-hud", "show Codex HUD", "status HUD", "multiline status", or asks for richer Codex context.
---

# Codex HUD

Use this skill to show the local Codex HUD.

## Steps

1. Resolve `../../scripts/codex-hud.js` relative to this `SKILL.md`.
2. Run it from the user's current workspace:

```bash
node <plugin-root>/scripts/codex-hud.js
```

3. If the user asks for machine-readable output, run:

```bash
node <plugin-root>/scripts/codex-hud.js --json
```

4. Explain that live token and rate-limit values remain in Codex's native
   `[tui].status_line` until Codex exposes a custom status renderer surface.

Keep the response concise. Do not paste unrelated config files.
