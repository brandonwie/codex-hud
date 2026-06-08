#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const OPENAI_CODEX_REPO = "https://github.com/openai/codex.git";
const DEFAULT_BIN_NAME = "codex-hud-codex";
const DEFAULT_LAUNCHER_NAME = "codex-hud-tui";

function usage() {
  return `Usage: node scripts/install-patched-codex.js [options]

Build a patched OpenAI Codex binary with [tui].status_line_command support.

Options:
  --version <version>       Codex CLI version to patch. Defaults to installed codex version.
  --prefix <dir>            Install directory prefix. Defaults to ~/.local/bin.
  --bin-name <name>         Installed command name. Defaults to ${DEFAULT_BIN_NAME}.
  --launcher-name <name>    Launcher command name. Defaults to ${DEFAULT_LAUNCHER_NAME}.
  --repo <url>              Upstream source repo. Defaults to ${OPENAI_CODEX_REPO}.
  --cache-dir <dir>         Source cache directory. Defaults to ~/.cache/codex-hud.
  --dry-run                 Clone/check out and patch source, but do not build or install.
  --make-default            Symlink ~/.local/bin/codex to the HUD launcher after install.
  --force-shim              Replace an existing ~/.local/bin/codex when used with --make-default.
  --uninstall-shim          Remove the managed ~/.local/bin/codex shim and exit.
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
    launcherName: DEFAULT_LAUNCHER_NAME,
    cacheDir: path.join(os.homedir(), ".cache", "codex-hud"),
    dryRun: false,
    makeDefault: false,
    forceShim: false,
    uninstallShim: false,
    replaceCodex: false,
    printConfig: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--make-default") {
      args.makeDefault = true;
    } else if (arg === "--force-shim") {
      args.forceShim = true;
    } else if (arg === "--uninstall-shim") {
      args.uninstallShim = true;
    } else if (arg === "--replace-codex") {
      args.replaceCodex = true;
    } else if (arg === "--print-config") {
      args.printConfig = true;
    } else if (arg === "--version" || arg === "--prefix" || arg === "--bin-name" || arg === "--launcher-name" || arg === "--repo" || arg === "--cache-dir") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      const key = {
        "--version": "version",
        "--prefix": "prefix",
        "--bin-name": "binName",
        "--launcher-name": "launcherName",
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
  return `node ${shellQuote(hudScript)} --line --color`;
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

function statusCommandHelperSource() {
  return [
    "    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {",
    "        let command = self.config.tui_status_line_command.as_ref()?.trim();",
    "        if command.is_empty() {",
    "            return None;",
    "        }",
    "",
    "        let mut process = if cfg!(windows) {",
    "            let mut process = std::process::Command::new(\"cmd\");",
    "            process.args([\"/C\", command]);",
    "            process",
    "        } else {",
    "            let mut process = std::process::Command::new(\"sh\");",
    "            process.args([\"-lc\", command]);",
    "            process",
    "        };",
    "",
    "        let output = process.current_dir(self.status_line_cwd()).output().ok()?;",
    "        if !output.status.success() {",
    "            return None;",
    "        }",
    "",
    "        let text = String::from_utf8_lossy(&output.stdout)",
    "            .lines()",
    "            .next()",
    "            .unwrap_or(\"\")",
    "            .trim()",
    "            .to_string();",
    "        if text.is_empty() {",
    "            return None;",
    "        }",
    "",
    "        Some(Self::ansi_status_line_to_line(&text))",
    "    }",
    "",
    "    fn ansi_status_line_to_line(text: &str) -> ratatui::text::Line<'static> {",
    "        let mut spans = Vec::new();",
    "        let mut buffer = String::new();",
    "        let mut style = ratatui::style::Style::default();",
    "        let mut chars = text.chars().peekable();",
    "",
    "        while let Some(ch) = chars.next() {",
    "            if ch == '\\u{1b}' && chars.peek() == Some(&'[') {",
    "                chars.next();",
    "                let mut sequence = String::new();",
    "                for next in chars.by_ref() {",
    "                    if next == 'm' {",
    "                        break;",
    "                    }",
    "                    sequence.push(next);",
    "                }",
    "",
    "                if !buffer.is_empty() {",
    "                    spans.push(ratatui::text::Span::styled(std::mem::take(&mut buffer), style));",
    "                }",
    "                Self::apply_ansi_status_style(&sequence, &mut style);",
    "            } else {",
    "                buffer.push(ch);",
    "            }",
    "        }",
    "",
    "        if !buffer.is_empty() {",
    "            spans.push(ratatui::text::Span::styled(buffer, style));",
    "        }",
    "",
    "        ratatui::text::Line::from(spans)",
    "    }",
    "",
    "    fn apply_ansi_status_style(sequence: &str, style: &mut ratatui::style::Style) {",
    "        let codes = if sequence.is_empty() {",
    "            vec![0]",
    "        } else {",
    "            sequence",
    "                .split(';')",
    "                .filter_map(|part| part.parse::<u16>().ok())",
    "                .collect::<Vec<_>>()",
    "        };",
    "",
    "        let mut index = 0;",
    "        while index < codes.len() {",
    "            match codes[index] {",
    "                0 | 39 => *style = ratatui::style::Style::default(),",
    "                30..=37 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed((codes[index] - 30) as u8));",
    "                }",
    "                90..=97 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed((codes[index] - 90 + 8) as u8));",
    "                }",
    "                38 if index + 2 < codes.len() && codes[index + 1] == 5 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed(codes[index + 2] as u8));",
    "                    index += 2;",
    "                }",
    "                _ => {}",
    "            }",
    "            index += 1;",
    "        }",
    "    }",
  ].join("\n");
}

function ensureAnsiStatusLineParser(filePath) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes("fn ansi_status_line_to_line")) {
    return false;
  }

  const startNeedle = "    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {";
  const endNeedle = "\n\n    /// Clears the terminal title Codex most recently wrote, if any.";
  const start = current.indexOf(startNeedle);
  const end = start === -1 ? -1 : current.indexOf(endNeedle, start);
  if (start === -1 || end === -1) {
    throw new Error(`ANSI parser patch anchor not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, current.slice(0, start) + statusCommandHelperSource() + current.slice(end));
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

  if (ensureAnsiStatusLineParser(statusSurfaces)) {
    changes.push("TUI ANSI status-line parser");
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
  const env = {
    ...process.env,
    CARGO_NET_GIT_FETCH_WITH_CLI: process.env.CARGO_NET_GIT_FETCH_WITH_CLI || "true",
  };
  run("cargo", ["build", "--release", "-p", "codex-cli", "--bin", "codex"], {
    cwd: workspace,
    stdio: "inherit",
    env,
  });

  const builtBinary = path.join(workspace, "target", "release", process.platform === "win32" ? "codex.exe" : "codex");
  const target = path.join(args.prefix, args.binName);
  fs.mkdirSync(args.prefix, { recursive: true });
  fs.copyFileSync(builtBinary, target);
  fs.chmodSync(target, 0o755);
  return target;
}

function installLauncher(installedBinary, args) {
  const launcher = path.join(args.prefix, args.launcherName);
  const command = defaultStatusLineCommand();
  const script = `#!/usr/bin/env bash
set -euo pipefail

exec ${shellQuote(installedBinary)} \\
  -c ${shellQuote(`tui.status_line_command=${JSON.stringify(command)}`)} \\
  "$@"
`;

  fs.mkdirSync(args.prefix, { recursive: true });
  fs.writeFileSync(launcher, script);
  fs.chmodSync(launcher, 0o755);
  return launcher;
}

function defaultShimPath(args) {
  return path.join(args.prefix, "codex");
}

function isManagedDefaultShim(target, launcher) {
  if (!fs.existsSync(target)) {
    return false;
  }

  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    return false;
  }

  const rawLink = fs.readlinkSync(target);
  const resolvedLink = path.resolve(path.dirname(target), rawLink);
  if (resolvedLink === launcher) {
    return true;
  }

  try {
    return fs.realpathSync.native(target) === fs.realpathSync.native(launcher);
  } catch (_) {
    return false;
  }
}

function installDefaultShim(launcher, args) {
  const target = defaultShimPath(args);
  if (path.resolve(target) === path.resolve(launcher)) {
    throw new Error("Refusing to make the launcher itself the codex shim. Use a distinct --launcher-name.");
  }

  fs.mkdirSync(args.prefix, { recursive: true });
  if (fs.existsSync(target)) {
    if (isManagedDefaultShim(target, launcher)) {
      return { target, status: "unchanged" };
    }
    if (!args.forceShim) {
      throw new Error(`Refusing to replace existing codex at ${target}. Pass --force-shim only if you want this PATH entry to launch Codex HUD.`);
    }
    if (fs.lstatSync(target).isDirectory()) {
      throw new Error(`Refusing to replace directory at ${target}.`);
    }
    fs.unlinkSync(target);
  }

  fs.symlinkSync(launcher, target);
  return { target, status: "installed" };
}

function uninstallDefaultShim(args) {
  const target = defaultShimPath(args);
  const launcher = path.join(args.prefix, args.launcherName);
  if (!fs.existsSync(target)) {
    return { target, status: "missing" };
  }
  if (!isManagedDefaultShim(target, launcher)) {
    throw new Error(`Refusing to remove ${target} because it is not a Codex HUD-managed shim.`);
  }

  fs.unlinkSync(target);
  return { target, status: "removed" };
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

  if (args.uninstallShim) {
    const result = uninstallDefaultShim(args);
    console.log(result.status === "removed" ? `Removed Codex HUD shim: ${result.target}` : `No Codex HUD shim found at: ${result.target}`);
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
  const launcher = installLauncher(installed, args);
  console.log(`Installed patched Codex as: ${installed}`);
  console.log(`Installed HUD launcher as: ${launcher}`);
  if (args.makeDefault) {
    const shim = installDefaultShim(launcher, args);
    console.log(`${shim.status === "unchanged" ? "Kept" : "Installed"} default codex shim: ${shim.target}`);
    console.log("Run `rehash` if your shell cached the old codex path.");
  }
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
  installDefaultShim,
  isManagedDefaultShim,
  parseArgs,
  patchSource,
  uninstallDefaultShim,
};
