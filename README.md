**Language** · English | [Português (Brasil)](README.pt-BR.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Deutsch](README.de.md) | [Español](README.es.md)

<div align="center">

# Codex HUD

**A compact, colored workspace HUD for the OpenAI Codex CLI — model, project, git, context, and 5h/7d usage in a single footer line.**

[![Version](https://img.shields.io/github/package-json/v/brandonwie/codex-hud?style=for-the-badge&logo=semver&logoColor=white&color=8a63d2&label=version)](https://github.com/brandonwie/codex-hud/blob/main/package.json)
[![License](https://img.shields.io/github/license/brandonwie/codex-hud?style=for-the-badge&color=2ea44f)](LICENSE)
[![Stars](https://img.shields.io/github/stars/brandonwie/codex-hud?style=for-the-badge&logo=github&logoColor=white&color=f5a623)](https://github.com/brandonwie/codex-hud/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/brandonwie/codex-hud?style=for-the-badge&logo=git&logoColor=white&color=ff6b6b)](https://github.com/brandonwie/codex-hud/commits/main)

[![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI-Codex_CLI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/openai/codex)
[![Config](https://img.shields.io/badge/Config-TOML-9c4221?style=for-the-badge&logo=toml&logoColor=white)](#configuration)
[![Platform](https://img.shields.io/badge/Platform-macOS_%7C_Linux-0db7ed?style=for-the-badge&logo=linux&logoColor=white)](#quick-start)

[Features](#features) · [Quick Start](#quick-start) · [Configuration](#configuration) · [Patched Codex Footer](#patched-codex-footer) · [Roadmap](#roadmap)

</div>

---

Codex HUD is a local Codex plugin that renders a multiline workspace HUD for OpenAI Codex CLI sessions.

By default it is a companion to Codex's native `[tui].status_line`, because stock Codex exposes a configurable built-in status item array but not a plugin-owned renderer. This repo also ships a maintained patch path for users who want the HUD script to render directly in the real Codex footer.

```text
5.5xhigh|codex-hud|git(main*)|Ctx:21%|5h:17%(5h,100%)|7d:16%(5.1d,27%)|Tkn:904k(I:533k,O:5k,C:366k)
```

> The segments, labels, colors, and thresholds in that line are all configurable — see [Configuration](#configuration).

## Features

- Codex version, model, reasoning effort, sandbox, and approval mode
- Native Codex status-line item count and color setting
- Compact usage parsed from Codex rollout logs (the example footer above)
- Current working directory, git branch, dirty counts, and repo root
- Project hints such as package name, nearby `AGENTS.md`, and 3B `ACTIVE-STATUS.md` priority when present
- Codex hook event counts from `hooks.json`
- A clear note that Codex's native status line remains authoritative for live token and rate-limit values

## Quick Start

Clone the repo, then install it as a local Codex plugin:

```bash
git clone https://github.com/brandonwie/codex-hud.git
cd codex-hud

# Register this repo as a local plugin marketplace, then add the plugin:
codex plugin marketplace add "$(pwd)"
codex plugin add codex-hud@codex-hud
```

Start a new Codex thread after installing or reinstalling so the skill list is refreshed.

> **Tip:** `codex plugin marketplace add "$(pwd)"` reads the current directory, so run it from the repo root. You can also pass an explicit path instead of `"$(pwd)"`.

## Usage

Run the renderer directly during development:

```bash
node plugins/codex-hud/scripts/codex-hud.js           # multiline HUD
node plugins/codex-hud/scripts/codex-hud.js --line     # single compact line
node plugins/codex-hud/scripts/codex-hud.js --line --color
node plugins/codex-hud/scripts/codex-hud.js --json      # machine-readable
node plugins/codex-hud/scripts/codex-hud.js --watch 5   # refresh every 5s
npm test
```

## Configuration

The footer is configurable through an optional `codex-hud.toml`. With no config file you get the default footer shown above; every key is optional and anything you omit inherits the built-in default.

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

A missing file is fine. A malformed or invalid file is ignored — the HUD falls back to defaults and prints a one-line note on stderr, so the status line never breaks. codex-hud keeps its own file instead of a table inside Codex's `config.toml`, so a bad HUD config can never stop Codex from launching.

### Options

```toml
# Compact by default. Set true for " | " segment spacing and ": " labels.
space = false

# Text placed between segments. The space flag controls padding around this text.
separator = "|"

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

Stock Codex cannot render arbitrary plugin output under the input area. To get a Claude-HUD-style footer, build a separate patched Codex command:

```bash
npm run patch:codex:dry-run
npm run patch:codex
```

The installer patches the matching OpenAI Codex tag, builds the Rust CLI, and keeps the real executable under `~/.local/bin/codex-hud-codex.d/codex`, with `~/.local/bin/codex-hud-codex` as a symlink to that binary. It also writes `~/.local/bin/codex-hud-tui`, a launcher that passes the colored HUD command through Codex's `-c tui.status_line_command=...` override without changing `~/.codex/config.toml`. The executable path and `argv[0]` both keep Codex-visible names, so terminal integrations such as Herdr can still recognize the pane as a Codex session.

Safe launcher mode leaves your normal `codex` command alone:

```bash
codex-hud-tui
```

To make a fresh `codex` launch use the HUD-enabled TUI, opt in to the managed shim:

```bash
npm run patch:codex -- --make-default
rehash
which codex
codex
```

`which codex` should resolve to `~/.local/bin/codex`. The installer refuses to replace an existing `~/.local/bin/codex` unless you pass `--force-shim`, and it still refuses to install the patched binary itself as `codex` unless you pass `--replace-codex`.

Rollback removes only the managed `codex` shim:

```bash
node scripts/install-patched-codex.js --uninstall-shim
rehash
which codex
```

If you prefer a persistent config, add the printed line under your existing `[tui]` table, but note that stock Codex versions may reject unknown fields. Generate the exact line for your machine from the repo root:

```bash
echo "status_line_command = \"node $(pwd)/plugins/codex-hud/scripts/codex-hud.js --line --color\""
```

Then paste it under `[tui]` in `~/.codex/config.toml`:

```toml
# Replace /path/to/codex-hud with your local clone path.
status_line_command = "node /path/to/codex-hud/plugins/codex-hud/scripts/codex-hud.js --line --color"
```

Run `codex-hud-tui` to see the compact footer. Homebrew or Codex updates will not update this separate command; rerun `npm run patch:codex` after updating Codex. When the managed `codex` shim is active, the installer skips that shim while detecting the base Codex version and uses the next real `codex` on `PATH`; pass `--version <version>` if you need to pin the rebuild target explicitly. The rebuilt payload must pass a `--version` health check before the launcher is rewritten.

## Project Layout

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

## Roadmap

- Add richer session transcript summaries if Codex exposes a stable local session-state API for plugins.
- Track upstream Codex status-line changes so the patch can be retired if a supported custom renderer lands.
- Add screenshots once the Codex plugin directory card is ready for publishing.

## Contributing

Issues and pull requests are welcome. After changing HUD output, run `npm test` and the Codex plugin validator; after changing the manifest version, reinstall the local plugin with `codex plugin add codex-hud@codex-hud`.

## License

[MIT](LICENSE) © Brandon Wie
