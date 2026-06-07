#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const OPENAI_CODEX_REPO = "https://github.com/openai/codex.git";
const DEFAULT_BIN_NAME = "codex-hud-codex";

function usage() {
  return `Usage: node scripts/install-patched-codex.js [options]

Build a patched OpenAI Codex binary with [tui].status_line_command support.

Options:
  --version <version>       Codex CLI version to patch. Defaults to installed codex version.
  --prefix <dir>            Install directory prefix. Defaults to ~/.local/bin.
  --bin-name <name>         Installed command name. Defaults to ${DEFAULT_BIN_NAME}.
  --repo <url>              Upstream source repo. Defaults to ${OPENAI_CODEX_REPO}.
  --cache-dir <dir>         Source cache directory. Defaults to ~/.cache/codex-hud.
  --dry-run                 Clone/check out and patch source, but do not build or install.
  --replace-codex           Allow --bin-name codex. Without this, overwriting codex is refused.
  --print-config            Print the TOML line for this repo's HUD command and exit.
  -h, --help                Show this help.
`;
}

function expandHome(value) {
  if (!value || value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    cwd: options.cwd,
    env: options.env || process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function parseArgs(argv) {
  const args = {
    repo: OPENAI_CODEX_REPO,
    prefix: path.join(os.homedir(), ".local", "bin"),
    binName: DEFAULT_BIN_NAME,
    cacheDir: path.join(os.homedir(), ".cache", "codex-hud"),
    dryRun: false,
    replaceCodex: false,
    printConfig: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--replace-codex") {
      args.replaceCodex = true;
    } else if (arg === "--print-config") {
      args.printConfig = true;
    } else if (arg === "--version" || arg === "--prefix" || arg === "--bin-name" || arg === "--repo" || arg === "--cache-dir") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      const key = {
        "--version": "version",
        "--prefix": "prefix",
        "--bin-name": "binName",
        "--repo": "repo",
        "--cache-dir": "cacheDir",
      }[arg];
      args[key] = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.prefix = path.resolve(expandHome(args.prefix));
  args.cacheDir = path.resolve(expandHome(args.cacheDir));
  return args;
}

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function defaultStatusLineCommand() {
  const hudScript = path.join(repoRoot(), "plugins", "codex-hud", "scripts", "codex-hud.js");
  return `node ${shellQuote(hudScript)} --line`;
}

function detectCodexVersion() {
  const stdout = run("codex", ["--version"]).trim();
  const match = stdout.match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  if (!match) {
    throw new Error(`Could not parse codex version from: ${stdout}`);
  }
  return match[1];
}

function applyTextPatch(filePath, marker, anchor, replacement) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes(marker)) {
    return false;
  }
  if (!current.includes(anchor)) {
    throw new Error(`Patch anchor not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, current.replace(anchor, replacement));
  return true;
}

function patchSource(sourceRoot) {
  const configTypes = path.join(sourceRoot, "codex-rs", "config", "src", "types.rs");
  const coreConfig = path.join(sourceRoot, "codex-rs", "core", "src", "config", "mod.rs");
  const statusSurfaces = path.join(sourceRoot, "codex-rs", "tui", "src", "chatwidget", "status_surfaces.rs");

  const changes = [];

  if (applyTextPatch(
    configTypes,
    "pub status_line_command: Option<String>",
    `    #[serde(default)]
    pub status_line: Option<Vec<String>>,

    /// Color status line items with colors derived from the active syntax theme.`,
    `    #[serde(default)]
    pub status_line: Option<Vec<String>>,

    /// Shell command used to render a custom status line. When set, it overrides status_line.
    #[serde(default)]
    pub status_line_command: Option<String>,

    /// Color status line items with colors derived from the active syntax theme.`,
  )) {
    changes.push("config Tui.status_line_command");
  }

  if (applyTextPatch(
    coreConfig,
    "pub tui_status_line_command: Option<String>",
    `    pub tui_status_line: Option<Vec<String>>,

    /// Whether to color status line items with colors from the active syntax theme.`,
    `    pub tui_status_line: Option<Vec<String>>,

    /// Shell command that renders a custom TUI status line.
    pub tui_status_line_command: Option<String>,

    /// Whether to color status line items with colors from the active syntax theme.`,
  )) {
    changes.push("core Config.tui_status_line_command");
  }

  if (applyTextPatch(
    coreConfig,
    "tui_status_line_command: cfg",
    `            tui_status_line: cfg.tui.as_ref().and_then(|t| t.status_line.clone()),
            tui_status_line_use_colors: cfg`,
    `            tui_status_line: cfg.tui.as_ref().and_then(|t| t.status_line.clone()),
            tui_status_line_command: cfg
                .tui
                .as_ref()
                .and_then(|t| t.status_line_command.clone()),
            tui_status_line_use_colors: cfg`,
  )) {
    changes.push("core ConfigBuilder status_line_command resolution");
  }

  if (applyTextPatch(
    statusSurfaces,
    "fn custom_status_line_from_command",
    `    fn refresh_status_line_from_selections(&mut self, selections: &StatusSurfaceSelections) {
        let enabled = !selections.status_line_items.is_empty();`,
    `    fn refresh_status_line_from_selections(&mut self, selections: &StatusSurfaceSelections) {
        if let Some(status_line) = self.custom_status_line_from_command() {
            self.bottom_pane.set_status_line_enabled(true);
            self.set_status_line(Some(status_line));
            self.set_status_line_hyperlink(None);
            return;
        }

        let enabled = !selections.status_line_items.is_empty();`,
  )) {
    changes.push("TUI status-line command render hook");
  }

  if (applyTextPatch(
    statusSurfaces,
    "status_line_command.as_ref",
    `        self.set_status_line_hyperlink(hyperlink_url);
    }

    /// Clears the terminal title Codex most recently wrote, if any.`,
    `        self.set_status_line_hyperlink(hyperlink_url);
    }

    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {
        let command = self.config.tui_status_line_command.as_ref()?.trim();
        if command.is_empty() {
            return None;
        }

        let mut process = if cfg!(windows) {
            let mut process = std::process::Command::new("cmd");
            process.args(["/C", command]);
            process
        } else {
            let mut process = std::process::Command::new("sh");
            process.args(["-lc", command]);
            process
        };

        let output = process.current_dir(self.status_line_cwd()).output().ok()?;
        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return None;
        }

        Some(ratatui::text::Line::from(text))
    }

    /// Clears the terminal title Codex most recently wrote, if any.`,
  )) {
    changes.push("TUI status-line command helper");
  }

  return changes;
}

function sourceHasPatch(sourceRoot) {
  const checks = [
    ["codex-rs/config/src/types.rs", "pub status_line_command: Option<String>"],
    ["codex-rs/core/src/config/mod.rs", "pub tui_status_line_command: Option<String>"],
    ["codex-rs/tui/src/chatwidget/status_surfaces.rs", "fn custom_status_line_from_command"],
  ];

  return checks.every(([relativePath, marker]) => {
    const filePath = path.join(sourceRoot, relativePath);
    return fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8").includes(marker);
  });
}

function ensureSource(args) {
  const tag = `rust-v${args.version}`;
  const sourceDir = path.join(args.cacheDir, `openai-codex-${tag}`);
  fs.mkdirSync(args.cacheDir, { recursive: true });

  if (!fs.existsSync(path.join(sourceDir, ".git"))) {
    run("git", ["clone", "--depth", "1", "--branch", tag, args.repo, sourceDir], { stdio: "inherit" });
    return sourceDir;
  }

  const dirty = run("git", ["status", "--porcelain"], { cwd: sourceDir }).trim();
  if (dirty) {
    if (sourceHasPatch(sourceDir)) {
      return sourceDir;
    }
    throw new Error(`Source cache has local changes: ${sourceDir}`);
  }

  run("git", ["fetch", "--depth", "1", "origin", `refs/tags/${tag}:refs/tags/${tag}`], { cwd: sourceDir, stdio: "inherit" });
  run("git", ["checkout", tag], { cwd: sourceDir, stdio: "inherit" });
  return sourceDir;
}

function installBinary(sourceDir, args) {
  const workspace = path.join(sourceDir, "codex-rs");
  run("cargo", ["build", "--release", "-p", "codex-cli", "--bin", "codex"], {
    cwd: workspace,
    stdio: "inherit",
  });

  const builtBinary = path.join(workspace, "target", "release", process.platform === "win32" ? "codex.exe" : "codex");
  const target = path.join(args.prefix, args.binName);
  fs.mkdirSync(args.prefix, { recursive: true });
  fs.copyFileSync(builtBinary, target);
  fs.chmodSync(target, 0o755);
  return target;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (args.printConfig) {
    console.log(`status_line_command = ${JSON.stringify(defaultStatusLineCommand())}`);
    return;
  }

  if (!args.version) {
    args.version = detectCodexVersion();
  }

  if (args.binName === "codex" && !args.replaceCodex) {
    throw new Error("Refusing to install as 'codex' without --replace-codex. Use the default codex-hud-codex first.");
  }

  console.log(`Codex HUD patch target: OpenAI Codex ${args.version}`);
  console.log(`HUD command: ${defaultStatusLineCommand()}`);

  const sourceDir = ensureSource(args);
  const changes = patchSource(sourceDir);
  console.log(changes.length ? `Applied patch: ${changes.join(", ")}` : "Patch already applied.");

  if (args.dryRun) {
    console.log("Dry run complete; build/install skipped.");
    return;
  }

  const installed = installBinary(sourceDir, args);
  console.log(`Installed patched Codex as: ${installed}`);
  console.log("Add this under your existing [tui] table:");
  console.log(`status_line_command = ${JSON.stringify(defaultStatusLineCommand())}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  defaultStatusLineCommand,
  detectCodexVersion,
  patchSource,
};
