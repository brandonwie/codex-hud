#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const OPENAI_CODEX_REPO = "https://github.com/openai/codex.git";
const DEFAULT_BIN_NAME = "codex-hud-codex";
const DEFAULT_LAUNCHER_NAME = "codex-hud-tui";
const RUST_RENDERER_BIN_NAME = "codex-hud-rs";
const SAFE_COMMAND_NAME_RE = /^[A-Za-z0-9_-]+$/;
const CODEX_VERSION_PATTERN = "\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";
const CODEX_VERSION_RE = new RegExp(`(${CODEX_VERSION_PATTERN})`);
const CODEX_VERSION_EXACT_RE = new RegExp(`^${CODEX_VERSION_PATTERN}$`);
const LAUNCHER_MARKER_FIELDS = {
  patched_version: "patchedVersion",
  stock_path: "stockPath",
  stock_realpath: "stockRealpath",
  stock_version: "stockVersion",
  renderer: "renderer",
  built_at: "builtAt",
};

function rendererBinaryName(platform = process.platform) {
  return platform === "win32" ? `${RUST_RENDERER_BIN_NAME}.exe` : RUST_RENDERER_BIN_NAME;
}

function usage() {
  return `Usage: node scripts/install-patched-codex.js [options]

Install the Codex HUD launcher.

Default mode (stock) writes a launcher that delegates to your real Codex
install, so Codex updates are picked up automatically. Patched mode
(experimental) builds a patched OpenAI Codex binary with
[tui].status_line_command support.

Options:
  --mode <stock|patched>    Install mode. Defaults to stock.
  --renderer <auto|rust|js> Status-line renderer. Defaults to auto (rust when built, else node).
  --doctor                  Print install/runtime diagnostics and exit.
  --version <version>       Codex CLI version to patch (patched mode). Defaults to installed codex version.
  --prefix <dir>            Install directory prefix. Defaults to ~/.local/bin.
  --bin-name <name>         Installed command name. Defaults to ${DEFAULT_BIN_NAME}.
  --launcher-name <name>    Launcher command name. Defaults to ${DEFAULT_LAUNCHER_NAME}.
  --repo <url>              Upstream source repo. Defaults to ${OPENAI_CODEX_REPO}.
  --cache-dir <dir>         Source cache directory. Defaults to ~/.cache/codex-hud.
  --keep-versions <n>       Patched payload versions to retain. Defaults to 2.
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
    timeout: options.timeout,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`${command} ${args.join(" ")} terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function executableExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function uniquePaths(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function findCodexCandidates(env = process.env, options = {}) {
  const names = process.platform === "win32" ? ["codex.exe", "codex.cmd", "codex.bat", "codex"] : ["codex"];
  const candidates = [];
  for (const entry of String(env.PATH || "").split(path.delimiter)) {
    if (!entry) {
      continue;
    }
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (executableExists(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  if (options.includeKnownPaths !== false) {
    for (const candidate of ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex"]) {
      if (executableExists(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return uniquePaths(candidates.map((candidate) => path.resolve(candidate)));
}

function hasHudManagedBasename(filePath) {
  const basename = path.basename(filePath);
  return basename === DEFAULT_BIN_NAME || basename === DEFAULT_LAUNCHER_NAME;
}

function isInsideHudBackingDir(filePath) {
  return String(filePath)
    .split(path.sep)
    .some((segment) => segment.endsWith(".d") && hasHudManagedBasename(segment.slice(0, -2)));
}

function isHudManagedCodexCandidate(candidate) {
  if (hasHudManagedBasename(candidate) || isInsideHudBackingDir(candidate)) {
    return true;
  }

  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) {
      const rawLink = fs.readlinkSync(candidate);
      const resolvedLink = path.resolve(path.dirname(candidate), rawLink);
      if (hasHudManagedBasename(rawLink) || hasHudManagedBasename(resolvedLink) || isInsideHudBackingDir(resolvedLink)) {
        return true;
      }
    }
  } catch (_) {
    return false;
  }

  try {
    const realpath = fs.realpathSync.native(candidate);
    return hasHudManagedBasename(realpath) || isInsideHudBackingDir(realpath);
  } catch (_) {
    return false;
  }
}

function parseCodexVersion(stdout) {
  const match = stdout.match(CODEX_VERSION_RE);
  if (!match) {
    throw new Error(`Could not parse codex version from: ${stdout}`);
  }
  return match[1];
}

function validateCommandName(value, optionName) {
  if (!SAFE_COMMAND_NAME_RE.test(value)) {
    throw new Error(`${optionName} must contain only letters, numbers, underscores, and hyphens`);
  }
}

function validateCodexVersion(value, optionName) {
  if (!CODEX_VERSION_EXACT_RE.test(value)) {
    throw new Error(`${optionName} must be a semver-like Codex version, got: ${value}`);
  }
}

function parseArgs(argv) {
  const args = {
    repo: OPENAI_CODEX_REPO,
    prefix: path.join(os.homedir(), ".local", "bin"),
    binName: DEFAULT_BIN_NAME,
    launcherName: DEFAULT_LAUNCHER_NAME,
    cacheDir: path.join(os.homedir(), ".cache", "codex-hud"),
    mode: "stock",
    renderer: "auto",
    keepVersions: 2,
    doctor: false,
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
    } else if (arg === "--doctor") {
      args.doctor = true;
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
    } else if (
      arg === "--mode" ||
      arg === "--renderer" ||
      arg === "--version" ||
      arg === "--prefix" ||
      arg === "--bin-name" ||
      arg === "--launcher-name" ||
      arg === "--repo" ||
      arg === "--cache-dir" ||
      arg === "--keep-versions"
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      const key = {
        "--mode": "mode",
        "--renderer": "renderer",
        "--version": "version",
        "--prefix": "prefix",
        "--bin-name": "binName",
        "--launcher-name": "launcherName",
        "--repo": "repo",
        "--cache-dir": "cacheDir",
        "--keep-versions": "keepVersions",
      }[arg];
      args[key] = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (args.mode !== "stock" && args.mode !== "patched") {
    throw new Error(`--mode must be stock or patched, got: ${args.mode}`);
  }
  if (args.renderer !== "auto" && args.renderer !== "rust" && args.renderer !== "js") {
    throw new Error(`--renderer must be auto, rust, or js, got: ${args.renderer}`);
  }
  const reservedRendererNames = new Set([RUST_RENDERER_BIN_NAME, rendererBinaryName()]);
  if (reservedRendererNames.has(args.binName) || reservedRendererNames.has(args.launcherName)) {
    const reservedName = reservedRendererNames.has(args.binName) ? args.binName : args.launcherName;
    throw new Error(`Refusing to use ${reservedName} as --bin-name/--launcher-name; it is reserved for the rust renderer binary.`);
  }
  validateCommandName(args.binName, "--bin-name");
  validateCommandName(args.launcherName, "--launcher-name");
  if (args.version) {
    validateCodexVersion(args.version, "--version");
  }
  args.keepVersions = Number.parseInt(args.keepVersions, 10);
  if (!Number.isFinite(args.keepVersions) || args.keepVersions < 1) {
    throw new Error("--keep-versions must be a positive integer");
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

function rustRendererSourcePath() {
  return path.join(repoRoot(), "rust", "target", "release", rendererBinaryName());
}

function verifyRustRenderer(binPath, options = {}) {
  const runCommand = options.runCommand || run;
  const firstLine = runCommand(binPath, ["--help"], { timeout: 10000 }).trim().split(/\r?\n/)[0];
  const match = firstLine.match(/^codex-hud (\d+\.\d+\.\d+\S*)$/);
  if (!match) {
    throw new Error(`Could not parse ${rendererBinaryName()} version from: ${firstLine}`);
  }
  return match[1];
}

function installRustRenderer(args, options = {}) {
  const target = path.join(args.prefix, rendererBinaryName());
  const source = options.sourcePath || rustRendererSourcePath();

  let sourceError = null;
  if (executableExists(source)) {
    try {
      const version = verifyRustRenderer(source, options);
      fs.mkdirSync(args.prefix, { recursive: true });
      const tmpFile = `${target}.tmp-${process.pid}`;
      try {
        fs.copyFileSync(source, tmpFile);
        fs.chmodSync(tmpFile, 0o755);
        fs.renameSync(tmpFile, target);
      } catch (error) {
        fs.rmSync(tmpFile, { force: true });
        throw error;
      }
      return { status: "installed", path: target, version };
    } catch (error) {
      sourceError = error;
    }
  }

  if (executableExists(target)) {
    try {
      const version = verifyRustRenderer(target, options);
      if (sourceError) {
        return { status: "existing", path: target, version, sourceError: sourceError.message, sourcePath: source };
      }
      return { status: "existing", path: target, version };
    } catch (error) {
      return { status: "broken", path: target, error: error.message };
    }
  }

  if (sourceError) {
    return { status: "broken-source", path: source, error: sourceError.message };
  }

  return { status: "missing", path: target };
}

function brokenRendererDetail(brokenPath, errorMessage) {
  return `${brokenPath} failed its --help health check (${errorMessage})`;
}

function resolveRenderer(args, options = {}) {
  if (args.renderer === "js") {
    return { kind: "js" };
  }

  if (options.install === false) {
    const target = path.join(args.prefix, rendererBinaryName());
    const source = options.sourcePath || rustRendererSourcePath();
    let brokenDetail = null;
    if (executableExists(target)) {
      try {
        verifyRustRenderer(target, options);
        return { kind: "rust", path: target };
      } catch (error) {
        brokenDetail = brokenRendererDetail(target, error.message);
      }
    }
    if (executableExists(source)) {
      try {
        verifyRustRenderer(source, options);
        return { kind: "rust", path: target, preview: true };
      } catch (error) {
        brokenDetail = brokenDetail || brokenRendererDetail(source, error.message);
      }
    }
    if (args.renderer === "rust") {
      if (brokenDetail) {
        throw new Error(`renderer rust requested but ${brokenDetail}. Rebuild: npm run build:rust`);
      }
      throw new Error("renderer rust requested but codex-hud-rs is not built. Run: npm run build:rust");
    }
    if (brokenDetail) {
      console.error(`warning: ${brokenDetail}; falling back to the node renderer`);
    }
    return { kind: "js" };
  }

  const installed = installRustRenderer(args, options);
  if (installed.status === "installed" || installed.status === "existing") {
    if (installed.sourceError) {
      console.error(
        `warning: ${brokenRendererDetail(installed.sourcePath, installed.sourceError)}; keeping the previously installed renderer at ${installed.path}`,
      );
    }
    return { kind: "rust", path: installed.path };
  }
  if (installed.status === "broken" || installed.status === "broken-source") {
    const detail = brokenRendererDetail(installed.path, installed.error);
    if (args.renderer === "rust") {
      throw new Error(`renderer rust requested but ${detail}. Rebuild: npm run build:rust`);
    }
    console.error(`warning: ${detail}; falling back to the node renderer`);
    return { kind: "js" };
  }
  if (args.renderer === "rust") {
    throw new Error("renderer rust requested but codex-hud-rs is not built. Run: npm run build:rust");
  }
  return { kind: "js" };
}

function statusLineCommandFor(renderer) {
  if (renderer.kind === "rust") {
    return `${shellQuote(renderer.path)} --line --color`;
  }
  return defaultStatusLineCommand();
}

function detectStockCodex(options = {}) {
  const runCommand = options.runCommand || run;
  const env = options.env || process.env;
  const candidates = findCodexCandidates(env, { includeKnownPaths: options.includeKnownPaths });
  let attemptedRealCandidate = false;
  let lastError = null;

  for (const candidate of candidates) {
    if (isHudManagedCodexCandidate(candidate)) {
      continue;
    }
    attemptedRealCandidate = true;
    try {
      const version = parseCodexVersion(runCommand(candidate, ["--version"]).trim());
      let realpath = candidate;
      try {
        realpath = fs.realpathSync.native(candidate);
      } catch (_) {
        // keep candidate path when realpath resolution is unavailable
      }
      return { path: candidate, realpath, version };
    } catch (error) {
      lastError = error;
    }
  }

  if (attemptedRealCandidate && lastError) {
    throw lastError;
  }

  return null;
}

function findStockCodexPath(env = process.env, options = {}) {
  for (const candidate of findCodexCandidates(env, options)) {
    if (!isHudManagedCodexCandidate(candidate)) {
      return candidate;
    }
  }
  return null;
}

function detectCodexVersion(options = {}) {
  const stock = detectStockCodex(options);
  if (stock) {
    return stock.version;
  }
  throw new Error("No stock codex found for version detection. Install Codex, or pass --version <version> for patched mode.");
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

function versionsDir(args) {
  const binName = args.binName || DEFAULT_BIN_NAME;
  validateCommandName(binName, "--bin-name");
  return path.join(args.prefix, `${binName}.d`);
}

function builtBinaryName() {
  return process.platform === "win32" ? "codex.exe" : "codex";
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

  return installBuiltBinary(sourceDir, args);
}

function stageBuiltBinary(sourceDir, args) {
  if (!args.version) {
    throw new Error("Cannot stage patched binary without a resolved --version.");
  }
  validateCodexVersion(args.version, "--version");
  const builtBinary = path.join(sourceDir, "codex-rs", "target", "release", builtBinaryName());
  const stagingDir = path.join(versionsDir(args), `${args.version}.staging`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const stagedBinary = path.join(stagingDir, builtBinaryName());
  fs.copyFileSync(builtBinary, stagedBinary);
  fs.chmodSync(stagedBinary, 0o755);
  return stagedBinary;
}

function markFailedStaging(stagedBinary) {
  const stagingDir = path.dirname(stagedBinary);
  const failedDir = stagingDir.replace(/\.staging$/, ".failed");
  fs.rmSync(failedDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, failedDir);
  return failedDir;
}

function activateStagedBinary(stagedBinary, args) {
  const stagingDir = path.dirname(stagedBinary);
  const versionDir = stagingDir.replace(/\.staging$/, "");
  fs.rmSync(versionDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, versionDir);
  const activeBinary = path.join(versionDir, path.basename(stagedBinary));

  const target = path.join(args.prefix, args.binName);
  let targetStat = null;
  try {
    targetStat = fs.lstatSync(target);
  } catch (_) {
    targetStat = null;
  }
  if (targetStat && targetStat.isDirectory()) {
    throw new Error(`Refusing to replace directory at ${target}.`);
  }

  const tmpLink = `${target}.tmp-${process.pid}`;
  fs.rmSync(tmpLink, { force: true });
  fs.symlinkSync(activeBinary, tmpLink);
  fs.renameSync(tmpLink, target);
  return { target, activeBinary, versionDir };
}

function installBuiltBinary(sourceDir, args) {
  fs.mkdirSync(args.prefix, { recursive: true });
  const stagedBinary = stageBuiltBinary(sourceDir, args);

  let version;
  try {
    version = verifyInstalledBinary(stagedBinary, args);
  } catch (error) {
    const failedDir = markFailedStaging(stagedBinary);
    const signalHint = /terminated by SIG/.test(error.message)
      ? "\nmacOS may have killed the unsigned rebuilt binary (Gatekeeper / signature cache)." +
        `\nTroubleshooting: codesign -s - --force ${path.join(failedDir, builtBinaryName())}` +
        "\n                 xattr -l <payload>  (check com.apple.quarantine)"
      : "";
    throw new Error(
      "Patched Codex health check failed; the active runtime was NOT modified." +
      `\nFailed payload kept at: ${failedDir}` +
      `\n${error.message}${signalHint}`,
    );
  }

  const { target } = activateStagedBinary(stagedBinary, args);
  return { target, version };
}

function verifyInstalledBinary(installedBinary, args) {
  const stdout = run(installedBinary, ["--version"], { timeout: args.healthCheckTimeoutMs || 10000 }).trim();
  const version = parseCodexVersion(stdout);
  if (args.version && version !== args.version) {
    throw new Error(`Patched Codex version mismatch: expected ${args.version}, got ${version}`);
  }
  return version;
}

function versionSortKey(version) {
  const value = String(version);
  const [withoutBuild, build = ""] = value.split("+", 2);
  const [core, prerelease = ""] = withoutBuild.split("-", 2);
  return {
    parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    prerelease: prerelease ? prerelease.split(".") : null,
    build,
  };
}

function comparePrereleaseDesc(aPrerelease, bPrerelease) {
  if (!aPrerelease && !bPrerelease) {
    return 0;
  }
  if (!aPrerelease) {
    return -1;
  }
  if (!bPrerelease) {
    return 1;
  }

  for (let index = 0; index < Math.max(aPrerelease.length, bPrerelease.length); index += 1) {
    const aPart = aPrerelease[index];
    const bPart = bPrerelease[index];
    if (aPart === undefined) {
      return 1;
    }
    if (bPart === undefined) {
      return -1;
    }
    if (aPart === bPart) {
      continue;
    }

    const aNumeric = /^(0|[1-9]\d*)$/.test(aPart);
    const bNumeric = /^(0|[1-9]\d*)$/.test(bPart);
    if (aNumeric && bNumeric) {
      return Number(bPart) - Number(aPart);
    }
    if (aNumeric) {
      return 1;
    }
    if (bNumeric) {
      return -1;
    }
    return aPart > bPart ? -1 : 1;
  }
  return 0;
}

function compareVersionsDesc(a, b) {
  const keyA = versionSortKey(a);
  const keyB = versionSortKey(b);
  for (let index = 0; index < Math.max(keyA.parts.length, keyB.parts.length); index += 1) {
    const diff = (keyB.parts[index] || 0) - (keyA.parts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  const prereleaseDiff = comparePrereleaseDesc(keyA.prerelease, keyB.prerelease);
  if (prereleaseDiff !== 0) {
    return prereleaseDiff;
  }
  return keyA.build.localeCompare(keyB.build);
}

function pruneVersionDirs(args, keep = args.keepVersions || 2) {
  const dir = versionsDir(args);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const removed = [];

  let activeVersion = null;
  try {
    const activeReal = fs.realpathSync.native(path.join(args.prefix, args.binName));
    const activeParent = path.dirname(activeReal);
    if (path.dirname(activeParent) === fs.realpathSync.native(dir)) {
      activeVersion = path.basename(activeParent);
    }
  } catch (_) {
    activeVersion = null;
  }

  const isVersionDir = (entry) => {
    if (!/^\d+\.\d+\.\d+/.test(entry) || entry.endsWith(".staging") || entry.endsWith(".failed")) {
      return false;
    }
    try {
      return fs.lstatSync(path.join(dir, entry)).isDirectory();
    } catch (_) {
      return false;
    }
  };

  const versions = entries.filter(isVersionDir).sort(compareVersionsDesc);
  const keepSet = new Set(versions.slice(0, keep));
  if (activeVersion) {
    keepSet.add(activeVersion);
  }
  for (const version of versions) {
    if (keepSet.has(version)) {
      continue;
    }
    fs.rmSync(path.join(dir, version), { recursive: true, force: true });
    removed.push(version);
  }

  for (const entry of entries) {
    if (entry.endsWith(".staging")) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      removed.push(entry);
    }
    if (entry.endsWith(".legacy-failed")) {
      fs.rmSync(path.join(dir, entry), { force: true });
      removed.push(entry);
    }
  }

  const failed = entries
    .filter((entry) => entry.endsWith(".failed"))
    .sort((a, b) => compareVersionsDesc(a.replace(/\.failed$/, ""), b.replace(/\.failed$/, "")));
  for (const entry of failed.slice(1)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    removed.push(entry);
  }

  return removed;
}

function renderLauncherScript(opts) {
  const mode = opts.mode;
  if (mode !== "stock" && mode !== "patched") {
    throw new Error(`Unknown launcher mode: ${mode}`);
  }
  const binName = opts.binName || DEFAULT_BIN_NAME;
  const launcherName = opts.launcherName || DEFAULT_LAUNCHER_NAME;
  validateCommandName(binName, "--bin-name");
  validateCommandName(launcherName, "--launcher-name");

  const markers = [`# codex-hud-launcher v2 mode=${mode}`];
  for (const [field, optKey] of Object.entries(LAUNCHER_MARKER_FIELDS)) {
    if (opts[optKey]) {
      markers.push(`# ${field}=${opts[optKey]}`);
    }
  }

  if (mode === "stock") {
    return `#!/usr/bin/env bash
${markers.join("\n")}
set -euo pipefail

STOCK_CODEX=${shellQuote(opts.stockPath || "")}
MANAGED_SHIM=${shellQuote(path.join(opts.prefix, "codex"))}

resolve_stock() {
  if [ -n "$STOCK_CODEX" ] && [ -x "$STOCK_CODEX" ]; then
    printf '%s\\n' "$STOCK_CODEX"
    return 0
  fi
  local IFS=':'
  local dir candidate resolved
  for dir in $PATH /opt/homebrew/bin /usr/local/bin /usr/bin; do
    [ -n "$dir" ] || continue
    candidate="$dir/codex"
    [ -x "$candidate" ] || continue
    [ "$candidate" = "$MANAGED_SHIM" ] && continue
    case "$candidate" in
      *${launcherName}|*${binName}) continue ;;
    esac
    if command -v realpath >/dev/null 2>&1; then
      resolved="$(realpath "$candidate" 2>/dev/null || true)"
      case "$resolved" in
        *${binName}.d/*|*${launcherName}|*${binName}) continue ;;
      esac
    fi
    printf '%s\\n' "$candidate"
    return 0
  done
  return 1
}

stock="$(resolve_stock)" || {
  echo "codex-hud: no stock codex found on PATH. Install the Codex CLI, or use the experimental patched mode (npm run patch:codex)." >&2
  exit 127
}
exec -a codex "$stock" "$@"
`;
  }

  if (!opts.patchedBinary) {
    throw new Error("Patched launcher requires patchedBinary.");
  }
  const statusLineCommand = opts.statusLineCommand || defaultStatusLineCommand();
  const staleWarning =
    `codex-hud: stock Codex changed since this patched runtime was built; ` +
    `running experimental patched Codex ${opts.patchedVersion || "(unknown version)"}. ` +
    `Rebuild with 'npm run patch:codex' or switch to stock delegation ('npm run install:launcher').`;

  return `#!/usr/bin/env bash
${markers.join("\n")}
set -euo pipefail

PATCHED=${shellQuote(opts.patchedBinary)}
STOCK_PATH=${shellQuote(opts.stockPath || "")}
STOCK_REALPATH_AT_INSTALL=${shellQuote(opts.stockRealpath || "")}

if [ -n "$STOCK_PATH" ] && [ -e "$STOCK_PATH" ] && [ -n "$STOCK_REALPATH_AT_INSTALL" ] && command -v realpath >/dev/null 2>&1; then
  current_stock="$(realpath "$STOCK_PATH" 2>/dev/null || true)"
  if [ -n "$current_stock" ] && [ "$current_stock" != "$STOCK_REALPATH_AT_INSTALL" ]; then
    echo ${shellQuote(staleWarning)} >&2
  fi
fi

exec -a codex "$PATCHED" \\
  -c ${shellQuote(`tui.status_line_command=${JSON.stringify(statusLineCommand)}`)} \\
  "$@"
`;
}

function parseLauncherMetadata(scriptText) {
  if (typeof scriptText !== "string" || scriptText.length === 0) {
    return { format: "foreign" };
  }

  const header = scriptText.match(/^# codex-hud-launcher v2 mode=(stock|patched)$/m);
  if (header) {
    const metadata = { format: "v2", mode: header[1] };
    for (const [field, key] of Object.entries(LAUNCHER_MARKER_FIELDS)) {
      const match = scriptText.match(new RegExp(`^# ${field}=(.*)$`, "m"));
      if (match) {
        metadata[key] = match[1];
      }
    }
    return metadata;
  }

  if (scriptText.includes("exec -a codex")) {
    return { format: "legacy" };
  }
  return { format: "foreign" };
}

function installLauncher(args, opts) {
  const launcher = path.join(args.prefix, args.launcherName);
  const script = renderLauncherScript({
    prefix: args.prefix,
    binName: args.binName,
    launcherName: args.launcherName,
    ...opts,
  });

  fs.mkdirSync(args.prefix, { recursive: true });
  const tmpFile = `${launcher}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, script);
  fs.chmodSync(tmpFile, 0o755);
  fs.renameSync(tmpFile, launcher);
  return launcher;
}

function quarantineStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function detectLegacyLayout(args) {
  const layout = { flatPayload: null, binEntry: null };

  const flatPayload = path.join(versionsDir(args), builtBinaryName());
  try {
    if (fs.lstatSync(flatPayload).isFile()) {
      layout.flatPayload = flatPayload;
    }
  } catch (_) {
    layout.flatPayload = null;
  }

  const binEntryPath = path.join(args.prefix, args.binName);
  try {
    const stat = fs.lstatSync(binEntryPath);
    layout.binEntry = {
      path: binEntryPath,
      kind: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
    };
  } catch (_) {
    layout.binEntry = null;
  }

  return layout;
}

function migrateLegacyLayout(args, options = {}) {
  const runCommand = options.runCommand || run;
  const layout = detectLegacyLayout(args);
  if (!layout.flatPayload) {
    return { status: "none" };
  }

  let version;
  try {
    version = parseCodexVersion(
      runCommand(layout.flatPayload, ["--version"], { timeout: args.healthCheckTimeoutMs || 10000 }).trim(),
    );
  } catch (error) {
    const failedPath = `${layout.flatPayload}.legacy-failed`;
    fs.rmSync(failedPath, { force: true });
    fs.renameSync(layout.flatPayload, failedPath);
    return { status: "quarantined", failedPath, error: error.message };
  }

  const migratedBinary = path.join(versionsDir(args), version, path.basename(layout.flatPayload));
  fs.mkdirSync(path.dirname(migratedBinary), { recursive: true });
  fs.rmSync(migratedBinary, { force: true });
  fs.renameSync(layout.flatPayload, migratedBinary);

  if (layout.binEntry && layout.binEntry.kind === "symlink") {
    try {
      const resolved = path.resolve(path.dirname(layout.binEntry.path), fs.readlinkSync(layout.binEntry.path));
      if (resolved === layout.flatPayload) {
        const tmpLink = `${layout.binEntry.path}.tmp-${process.pid}`;
        fs.rmSync(tmpLink, { force: true });
        fs.symlinkSync(migratedBinary, tmpLink);
        fs.renameSync(tmpLink, layout.binEntry.path);
      }
    } catch (_) {
      // leave a dangling legacy entry to the doctor report rather than guessing
    }
  }

  return { status: "migrated", version, migratedBinary };
}

function reviewLegacyBinEntry(args, options = {}) {
  const runCommand = options.runCommand || run;
  const layout = detectLegacyLayout(args);
  if (!layout.binEntry) {
    return { status: "absent", path: path.join(args.prefix, args.binName) };
  }
  if (layout.binEntry.kind === "directory") {
    return { status: "skipped", path: layout.binEntry.path, reason: "directory" };
  }

  try {
    const version = parseCodexVersion(
      runCommand(layout.binEntry.path, ["--version"], { timeout: args.healthCheckTimeoutMs || 10000 }).trim(),
    );
    return { status: "ok", path: layout.binEntry.path, version };
  } catch (error) {
    const stamp = quarantineStamp();
    const quarantinePath = `${layout.binEntry.path}.broken-${stamp}`;
    fs.renameSync(layout.binEntry.path, quarantinePath);
    let quarantinedPayload = null;
    if (layout.flatPayload) {
      quarantinedPayload = `${layout.flatPayload}.broken-${stamp}`;
      fs.rmSync(quarantinedPayload, { force: true });
      fs.renameSync(layout.flatPayload, quarantinedPayload);
    }
    return {
      status: "quarantined",
      path: layout.binEntry.path,
      quarantinePath,
      quarantinedPayload,
      error: error.message,
    };
  }
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

function doctor(args, options = {}) {
  const runCommand = options.runCommand || run;
  const env = options.env || process.env;
  const launcherPath = path.join(args.prefix, args.launcherName);
  const shimPath = defaultShimPath(args);

  const report = {
    prefix: args.prefix,
    shim: { path: shimPath, status: "missing", target: null },
    launcher: { path: launcherPath, status: "missing", mode: null, metadata: null },
    stock: null,
    patched: { dir: versionsDir(args), versions: [], active: null, flatPayload: null },
    renderer: { configured: null, binPath: path.join(args.prefix, rendererBinaryName()), installed: false, broken: false, version: null },
    anomalies: [],
    recommendations: [],
    healthy: true,
  };

  let shimStat = null;
  try {
    shimStat = fs.lstatSync(shimPath);
  } catch (_) {
    shimStat = null;
  }
  if (shimStat) {
    if (isManagedDefaultShim(shimPath, launcherPath)) {
      report.shim.status = "managed";
      report.shim.target = launcherPath;
    } else if (shimStat.isSymbolicLink() && !fs.existsSync(shimPath)) {
      report.shim.status = "broken";
      try {
        report.shim.target = fs.readlinkSync(shimPath);
      } catch (_) {
        report.shim.target = null;
      }
      report.healthy = false;
      report.anomalies.push(`codex shim is a broken symlink: ${shimPath}`);
    } else {
      report.shim.status = "foreign";
      try {
        report.shim.target = shimStat.isSymbolicLink() ? fs.readlinkSync(shimPath) : "(regular file)";
      } catch (_) {
        report.shim.target = null;
      }
    }
  }

  let launcherText = null;
  try {
    launcherText = fs.readFileSync(launcherPath, "utf8");
  } catch (_) {
    launcherText = null;
  }
  if (launcherText !== null) {
    const metadata = parseLauncherMetadata(launcherText);
    report.launcher.status = metadata.format;
    report.launcher.mode = metadata.mode || null;
    report.launcher.metadata = metadata;
    report.renderer.configured = metadata.renderer || (metadata.format === "v2" ? "js" : null);
  }

  if (executableExists(report.renderer.binPath)) {
    try {
      report.renderer.version = verifyRustRenderer(report.renderer.binPath, {
        runCommand: (command, commandArgs, commandOptions) =>
          runCommand(command, commandArgs, { ...commandOptions, timeout: args.healthCheckTimeoutMs || 10000 }),
      });
      report.renderer.installed = true;
    } catch (error) {
      report.renderer.broken = true;
      report.anomalies.push(`installed codex-hud-rs failed --help health check: ${error.message}`);
    }
  }

  try {
    report.stock = detectStockCodex({ runCommand, env });
  } catch (error) {
    report.anomalies.push(`stock codex --version failed: ${error.message}`);
  }

  let payloadEntries = [];
  try {
    payloadEntries = fs.readdirSync(report.patched.dir);
  } catch (_) {
    payloadEntries = [];
  }
  for (const entry of payloadEntries) {
    const fullPath = path.join(report.patched.dir, entry);
    let entryStat = null;
    try {
      entryStat = fs.lstatSync(fullPath);
    } catch (_) {
      continue;
    }
    if (entry.endsWith(".staging") || entry.endsWith(".failed") || entry.includes(".broken") || entry.endsWith(".legacy-failed")) {
      report.anomalies.push(`leftover payload artifact: ${fullPath}`);
    } else if (entryStat.isDirectory() && /^\d+\.\d+\.\d+/.test(entry)) {
      report.patched.versions.push(entry);
    } else if (entryStat.isFile() && entry === builtBinaryName()) {
      report.patched.flatPayload = fullPath;
      report.anomalies.push(`legacy flat payload layout: ${fullPath}`);
    }
  }
  report.patched.versions.sort(compareVersionsDesc);

  const binEntryPath = path.join(args.prefix, args.binName);
  let binStat = null;
  try {
    binStat = fs.lstatSync(binEntryPath);
  } catch (_) {
    binStat = null;
  }
  if (binStat) {
    const active = {
      path: binEntryPath,
      kind: binStat.isSymbolicLink() ? "symlink" : "file",
      target: null,
      version: null,
      broken: false,
    };
    try {
      active.target = fs.realpathSync.native(binEntryPath);
    } catch (_) {
      active.broken = true;
      report.anomalies.push(`patched command is a broken symlink: ${binEntryPath}`);
    }
    if (!active.broken) {
      try {
        active.version = parseCodexVersion(
          runCommand(binEntryPath, ["--version"], { timeout: args.healthCheckTimeoutMs || 10000 }).trim(),
        );
      } catch (error) {
        active.broken = true;
        report.anomalies.push(`active patched payload is broken: ${error.message}`);
      }
    }
    report.patched.active = active;
  }

  let prefixEntries = [];
  try {
    prefixEntries = fs.readdirSync(args.prefix);
  } catch (_) {
    prefixEntries = [];
  }
  for (const entry of prefixEntries) {
    if (entry.includes(".broken-") || entry.endsWith(".legacy-failed") || entry.includes(".stock-symlink-")) {
      report.anomalies.push(`leftover artifact: ${path.join(args.prefix, entry)}`);
    }
  }

  if (report.launcher.status === "missing") {
    report.recommendations.push("no HUD launcher installed -> run: npm run install:launcher");
  } else if (report.launcher.status === "legacy") {
    report.recommendations.push("launcher predates the v2 format -> run: npm run install:launcher (stock) or npm run patch:codex (patched)");
  }

  if (report.launcher.mode === "stock" && !report.stock) {
    report.healthy = false;
    report.recommendations.push("stock-mode launcher but no stock codex found -> install the Codex CLI");
  }

  if (report.launcher.mode === "patched") {
    const patchedVersion =
      (report.launcher.metadata && report.launcher.metadata.patchedVersion) ||
      (report.patched.active && report.patched.active.version);
    if (report.stock && patchedVersion && report.stock.version !== patchedVersion) {
      report.recommendations.push(
        `stock codex is ${report.stock.version} but patched runtime is ${patchedVersion} -> run: npm run patch:codex (or npm run install:launcher for stock mode)`,
      );
    }
    if (!report.patched.active || report.patched.active.broken) {
      report.healthy = false;
      report.recommendations.push("patched-mode launcher but its payload is missing or broken -> run: npm run patch:codex or npm run install:launcher");
    }
  }

  // Renderer health breaks the active entrypoint only in patched mode; stock
  // launchers never inject status_line_command.
  if (report.renderer.configured === "rust" && !report.renderer.installed && report.launcher.mode === "patched") {
    if (report.renderer.broken) {
      report.healthy = false;
      report.recommendations.push(
        `launcher renderer=rust but ${report.renderer.binPath} is broken (failed --help health check) -> run: npm run build:rust && npm run patch:codex`,
      );
    } else {
      report.recommendations.push(
        `launcher renderer=rust but ${report.renderer.binPath} is missing -> run: npm run build:rust && npm run patch:codex`,
      );
    }
  }

  if (report.renderer.installed) {
    const repoVersion = require(path.join(repoRoot(), "package.json")).version;
    if (report.renderer.version !== repoVersion) {
      report.recommendations.push(
        `codex-hud-rs is v${report.renderer.version} but the repo is v${repoVersion} -> rebuild: npm run build:rust && rerun the installer`,
      );
    }
  }

  if (report.shim.status === "managed" && report.launcher.status === "missing") {
    report.healthy = false;
    report.anomalies.push("codex shim points at a missing launcher");
  }

  return report;
}

function printDoctorReport(report) {
  const lines = [];
  lines.push(`prefix: ${report.prefix}`);
  lines.push(`codex shim: ${report.shim.status}${report.shim.target ? ` -> ${report.shim.target}` : ""} (${report.shim.path})`);
  lines.push(`launcher: ${report.launcher.status}${report.launcher.mode ? ` mode=${report.launcher.mode}` : ""} (${report.launcher.path})`);
  if (report.launcher.metadata && report.launcher.metadata.format === "v2") {
    const meta = report.launcher.metadata;
    const details = Object.values(LAUNCHER_MARKER_FIELDS)
      .filter((key) => meta[key])
      .map((key) => `${key}=${meta[key]}`);
    if (details.length) {
      lines.push(`launcher metadata: ${details.join(" ")}`);
    }
  }
  lines.push(report.stock
    ? `stock codex: ${report.stock.path} (${report.stock.version}, realpath ${report.stock.realpath})`
    : "stock codex: not found");
  if (report.renderer) {
    const stockQualifier = report.launcher.mode === "stock"
      ? "; used by --print-config/patched mode only — stock launcher does not invoke it"
      : "";
    if (report.renderer.installed) {
      lines.push(`renderer: rust (${report.renderer.binPath}, v${report.renderer.version}${stockQualifier})`);
    } else if (report.renderer.broken) {
      lines.push(`renderer: rust binary is broken at ${report.renderer.binPath} — failed --help health check${stockQualifier}`);
    } else if (report.renderer.configured === "js") {
      lines.push(`renderer: js (node renderer; rust binary missing at ${report.renderer.binPath})`);
    } else if (report.renderer.configured === "rust") {
      lines.push(`renderer: rust configured but binary missing at ${report.renderer.binPath}${stockQualifier}`);
    } else {
      lines.push(`renderer: rust binary missing at ${report.renderer.binPath}`);
    }
  }
  lines.push(`patched payload dir: ${report.patched.dir}`);
  lines.push(`patched versions: ${report.patched.versions.length ? report.patched.versions.join(", ") : "(none)"}`);
  if (report.patched.active) {
    const active = report.patched.active;
    lines.push(`patched command: ${active.path} -> ${active.target || "(unresolved)"}${active.version ? ` (${active.version})` : ""}${active.broken ? " [BROKEN]" : ""}`);
  } else {
    lines.push("patched command: (none)");
  }
  for (const anomaly of report.anomalies) {
    lines.push(`anomaly: ${anomaly}`);
  }
  for (const recommendation of report.recommendations) {
    lines.push(`recommendation: ${recommendation}`);
  }
  lines.push(`status: ${report.healthy ? "healthy" : "BROKEN entrypoint chain"}`);
  console.log(lines.join("\n"));
}

function installShimIfRequested(launcher, args) {
  if (!args.makeDefault) {
    return;
  }
  const shim = installDefaultShim(launcher, args);
  console.log(`${shim.status === "unchanged" ? "Kept" : "Installed"} default codex shim: ${shim.target}`);
  console.log("Run `rehash` if your shell cached the old codex path.");
}

function runStockInstall(args) {
  const stock = detectStockCodex();
  if (!stock) {
    throw new Error(
      "No stock codex found on PATH or in known locations. Install the Codex CLI first, or use the experimental patched mode: npm run patch:codex",
    );
  }
  console.log(`Stock Codex: ${stock.path} (${stock.version})`);

  if (args.dryRun) {
    const previewRenderer = resolveRenderer(args, { install: false });
    console.log(`Would install stock-delegating HUD launcher: ${path.join(args.prefix, args.launcherName)}`);
    console.log(`renderer (used by patched mode and --print-config only): ${previewRenderer.kind}`);
    console.log("Dry run complete; nothing installed.");
    return;
  }

  const renderer = resolveRenderer(args);

  const launcher = installLauncher(args, {
    mode: "stock",
    stockPath: stock.path,
    stockRealpath: stock.realpath,
    stockVersion: stock.version,
    renderer: renderer.kind,
    builtAt: new Date().toISOString(),
  });
  console.log(`Installed stock-delegating HUD launcher: ${launcher}`);
  console.log("Codex updates are picked up automatically; no rebuild needed.");
  console.log(`renderer (used by patched mode and --print-config only): ${renderer.kind}`);

  const legacy = reviewLegacyBinEntry(args);
  if (legacy.status === "ok") {
    console.log(
      `Note: patched command kept at ${legacy.path} (codex ${legacy.version}). ` +
      "Direct invocations of it will go stale; rerun `npm run patch:codex` or remove it.",
    );
  } else if (legacy.status === "quarantined") {
    console.log(`Quarantined broken patched command: ${legacy.path} -> ${legacy.quarantinePath}`);
    if (legacy.quarantinedPayload) {
      console.log(`Quarantined broken flat payload: ${legacy.quarantinedPayload}`);
    }
    console.log("Restore by renaming it back, or rebuild with `npm run patch:codex`.");
  }

  installShimIfRequested(launcher, args);
}

function runPatchedInstall(args) {
  if (!args.version) {
    args.version = detectCodexVersion();
  }

  if (args.binName === "codex" && !args.replaceCodex) {
    throw new Error("Refusing to install as 'codex' without --replace-codex. Use the default codex-hud-codex first.");
  }

  console.log(`Codex HUD patch target: OpenAI Codex ${args.version}`);

  const sourceDir = ensureSource(args);
  const changes = patchSource(sourceDir);
  console.log(changes.length ? `Applied patch: ${changes.join(", ")}` : "Patch already applied.");

  if (args.dryRun) {
    console.log(`HUD command: ${statusLineCommandFor(resolveRenderer(args, { install: false }))}`);
    console.log("Dry run complete; build/install skipped.");
    return;
  }

  const migration = migrateLegacyLayout(args);
  if (migration.status === "migrated") {
    console.log(`Migrated legacy flat payload into versioned layout: ${migration.migratedBinary}`);
  } else if (migration.status === "quarantined") {
    console.log(`Legacy flat payload failed its health check; kept at: ${migration.failedPath}`);
  }

  let stock = null;
  try {
    stock = detectStockCodex();
  } catch (_) {
    stock = null;
  }

  // Resolve and install the renderer BEFORE activating the patched payload so
  // an explicit --renderer rust failure cannot leave a half-finished install
  // (new payload active, stale launcher). If installBinary fails below, an
  // already installed standalone renderer is harmless.
  const renderer = resolveRenderer(args);
  const statusLineCommand = statusLineCommandFor(renderer);
  console.log(`HUD command: ${statusLineCommand}`);
  if (renderer.kind === "js" && args.renderer === "auto") {
    console.log("rust renderer not available; using node renderer (run npm run build:rust && rerun to enable)");
  }
  const installed = installBinary(sourceDir, args);
  const launcher = installLauncher(args, {
    mode: "patched",
    patchedBinary: installed.target,
    patchedVersion: installed.version,
    stockPath: stock ? stock.path : null,
    stockRealpath: stock ? stock.realpath : null,
    stockVersion: stock ? stock.version : null,
    statusLineCommand,
    renderer: renderer.kind,
    builtAt: new Date().toISOString(),
  });
  const pruned = pruneVersionDirs(args);

  console.log(`Installed patched Codex as: ${installed.target}`);
  console.log(`Verified patched Codex version: ${installed.version}`);
  console.log(`Installed HUD launcher as: ${launcher}`);
  if (pruned.length) {
    console.log(`Pruned old payloads: ${pruned.join(", ")}`);
  }
  installShimIfRequested(launcher, args);
  console.log("Add this under your existing [tui] table:");
  console.log(`status_line_command = ${JSON.stringify(statusLineCommand)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (args.printConfig) {
    const renderer = resolveRenderer(args, { install: false });
    console.log(`status_line_command = ${JSON.stringify(statusLineCommandFor(renderer))}`);
    if (renderer.preview) {
      console.error("note: binary not yet at the install target; run npm run install:launcher or npm run patch:codex");
    }
    return;
  }

  if (args.uninstallShim) {
    const result = uninstallDefaultShim(args);
    console.log(result.status === "removed" ? `Removed Codex HUD shim: ${result.target}` : `No Codex HUD shim found at: ${result.target}`);
    return;
  }

  if (args.doctor) {
    const report = doctor(args);
    printDoctorReport(report);
    if (!report.healthy) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.mode === "stock") {
    runStockInstall(args);
    return;
  }
  runPatchedInstall(args);
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
  activateStagedBinary,
  defaultStatusLineCommand,
  detectCodexVersion,
  detectLegacyLayout,
  detectStockCodex,
  doctor,
  findStockCodexPath,
  installBinary,
  installBuiltBinary,
  installDefaultShim,
  installLauncher,
  installRustRenderer,
  isManagedDefaultShim,
  migrateLegacyLayout,
  parseArgs,
  parseLauncherMetadata,
  patchSource,
  pruneVersionDirs,
  renderLauncherScript,
  rendererBinaryName,
  resolveRenderer,
  reviewLegacyBinEntry,
  stageBuiltBinary,
  statusLineCommandFor,
  uninstallDefaultShim,
  verifyInstalledBinary,
  verifyRustRenderer,
};
