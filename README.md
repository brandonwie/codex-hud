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
  `5.5 xhigh | codex-hud main* | Ctx: 26% | 5h: 0%(4.4h,12%) | 7d: 6%(6.4d,9%) | Tkn: 36.1M(I:399k,O:583k,C:35.1M)`
  (segments, labels, colors, and thresholds are configurable — see
  [Configuration](#configuration))
- Current working directory, git branch, dirty counts, and repo root
- Project hints such as package name, nearby `AGENTS.md`, and 3B
  `ACTIVE-STATUS.md` priority when present
- Codex hook event counts from `hooks.json`
- A clear note that Codex's native status line remains authoritative for live
  token and rate-limit values

## Layout

```text
codex-hud/
├─ plugins/
│  └─ codex-hud/
│     ├─ .codex-plugin/plugin.json
│     ├─ scripts/codex-hud.js        # HUD renderer + config loader
│     ├─ vendor/toml.js              # vendored TOML parser (smol-toml)
│     └─ skills/codex-hud/SKILL.md
└─ scripts/
   ├─ test-codex-hud.js
   ├─ test-codex-hud-config.js
   ├─ test-patched-codex-installer.js
   ├─ vendor-toml.js                 # regenerates vendor/toml.js
   └─ install-patched-codex.js
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

## Configuration

The footer is configurable through an optional `codex-hud.toml`. With no config
file you get the default footer shown above; every key is optional and anything
you omit inherits the built-in default.

```bash
codex-hud --init-config     # scaffold ~/.codex/codex-hud.toml (--force to overwrite)
codex-hud --print-config    # print the resolved, merged config as JSON
codex-hud --config-path     # show which config files are in effect
```

### Search order

Later sources override earlier ones (per key — arrays replace, scalars override):

1. built-in defaults
2. `$CODEX_HOME/codex-hud.toml` (per-user; `$CODEX_HOME` defaults to `~/.codex`)
3. `./.codex/codex-hud.toml` (per-project; walks up to the git root)
4. `$CODEX_HUD_CONFIG` (explicit file path via env var)

A missing file is fine. A malformed or invalid file is ignored — the HUD falls
back to defaults and prints a one-line note on stderr, so the status line never
breaks. codex-hud keeps its own file instead of a table inside Codex's
`config.toml`, so a bad HUD config can never stop Codex from launching.

### Options

```toml
# Text placed between segments.
separator = " | "

# Which segments to show, in order. Ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliases: workspace = project + branch + runtime; context = ctx; tokens = tkn.
# (runtime / "node vX" is available but off by default — add it to opt in.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Rename a segment's label (keys are segment ids).
[labels]
ctx = "Ctx"

# Colors: a palette name, a 256-color code (0-255), or "#rrggbb" (mapped to the
# nearest 256 color). Names: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit are the threshold colors shared by ctx / 5h / 7d.
[colors]
model = "neonViolet"
branch = "#5fafff"
ok = "mint"
warn = "amber"
crit = "coral"

# Percent thresholds (0-100) that switch ctx/5h/7d between ok/warn/crit.
[thresholds.percent]
warn = 70
crit = 90

# Formatting toggles.
[format]
tokenParts = true   # false -> total only, hide (I:.. O:.. C:..)
showPace = true     # false -> hide the pace % in 5h/7d
```

Run `codex-hud --print-config` to see the full resolved option set.

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
Codex. When the managed `codex` shim is active, the installer skips that shim
while detecting the base Codex version and uses the next real `codex` on `PATH`;
pass `--version <version>` if you need to pin the rebuild target explicitly. The
rebuilt payload must pass a `--version` health check before the launcher is
rewritten.

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
