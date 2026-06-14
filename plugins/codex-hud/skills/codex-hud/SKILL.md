---
name: codex-hud
description: Show Codex workspace context with local config, git state, hooks, and project hints. Standalone mode can show an expanded snapshot; patched Codex TUI footer mode is single-line. Use when the user says "codex-hud", "show Codex HUD", "status HUD", "workspace snapshot", or asks for richer Codex context.
---

# Codex HUD

Use this skill to show the local Codex HUD.

## Steps

1. Run the installed `codex-hud` command from the user's current workspace:

```bash
codex-hud
```

2. If the user asks for machine-readable output, run:

```bash
codex-hud --json
```

3. If `codex-hud` is missing, tell the user to build/install the Rust renderer
   from the repo with `npm run build:rust` and `npm run install:launcher`.

4. Explain that live token and rate-limit values remain in Codex's native
   `[tui].status_line` until Codex exposes a custom status renderer surface.

Keep the response concise. Do not paste unrelated config files.
