#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const VERSION = "0.2.4";
const DEFAULT_TIMEOUT_MS = 1200;
const RESET = "\x1b[0m";
const COLORS = {
  dim: "\x1b[38;5;245m",
  coral: "\x1b[38;5;203m",
  mint: "\x1b[38;5;85m",
  amber: "\x1b[38;5;215m",
  cyan: "\x1b[38;5;117m",
  violet: "\x1b[38;5;141m",
  neonViolet: "\x1b[38;5;135m",
};

function usage() {
  return [
    "codex-hud " + VERSION,
    "",
    "Usage:",
    "  codex-hud             Print a multiline Codex context HUD",
    "  codex-hud --line      Print compact model, git, and CTX/5H/7D usage",
    "  codex-hud --line --color",
    "                        Print compact usage with 256-color ANSI styling",
    "  codex-hud --status-line",
    "                        Alias for --line",
    "  codex-hud --json      Print the same data as JSON",
    "  codex-hud --watch 5   Refresh the text HUD every 5 seconds",
    "  codex-hud --help      Show this help",
    "",
    "Codex HUD complements Codex's native [tui].status_line.",
  ].join("\n");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    env: process.env,
  });

  if (result.error || result.status !== 0) return null;
  return (result.stdout || "").trim();
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return null;
  }
}

function findUp(startDir, fileName) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function firstTomlString(config, key) {
  const match = config.match(new RegExp("^" + key + '\\s*=\\s*"([^"]*)"', "m"));
  return match ? match[1] : null;
}

function tomlBoolean(config, section, key) {
  const body = tomlSection(config, section);
  if (!body) return null;
  const match = body.match(new RegExp("^" + key + "\\s*=\\s*(true|false)", "m"));
  return match ? match[1] === "true" : null;
}

function tomlSection(config, section) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionStart = config.match(new RegExp("^\\[" + escaped + "\\]\\s*$", "m"));
  if (!sectionStart) return null;

  const rest = config.slice(sectionStart.index + sectionStart[0].length);
  const nextSection = rest.search(/^\[[^\]]+\]\s*$/m);
  return nextSection === -1 ? rest : rest.slice(0, nextSection);
}

function tomlStringArray(config, section, key) {
  const body = tomlSection(config, section);
  if (!body) return [];

  const match = body.match(new RegExp("^" + key + "\\s*=\\s*\\[([^\\]]*)\\]", "m"));
  if (!match) return [];

  const values = [];
  const itemRegex = /"([^"]*)"/g;
  let item;
  while ((item = itemRegex.exec(match[1])) !== null) values.push(item[1]);
  return values;
}

function resolveCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function findProjectConfig(cwd, gitRoot) {
  let current = path.resolve(cwd);
  const home = path.resolve(os.homedir());
  const stopAt = gitRoot ? path.resolve(gitRoot) : path.parse(current).root;

  while (true) {
    const candidate = path.join(current, ".codex", "config.toml");
    if (current !== home && fs.existsSync(candidate)) return candidate;

    if (current === stopAt) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveConfig(codexHome, cwd, gitRoot) {
  const userConfig = path.join(codexHome, "config.toml");
  const projectConfig = findProjectConfig(cwd, gitRoot);
  return {
    userConfig,
    projectConfig,
    userText: readText(userConfig) || "",
    projectText: projectConfig ? readText(projectConfig) || "" : "",
  };
}

function gitInfo(cwd) {
  const root = run("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (!root) return { available: false };

  const branch = run("git", ["branch", "--show-current"], { cwd: root }) || "detached";
  const porcelain = run("git", ["status", "--porcelain=v1", "-b"], { cwd: root }) || "";
  const lines = porcelain.split(/\r?\n/).filter(Boolean);
  const header = lines[0] && lines[0].startsWith("## ") ? lines[0].slice(3) : branch;
  const entries = lines.filter((line) => !line.startsWith("## "));
  const counts = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    other: 0,
  };

  for (const line of entries) {
    const code = line.slice(0, 2);
    if (code === "??") counts.untracked += 1;
    else if (code.includes("M")) counts.modified += 1;
    else if (code.includes("A")) counts.added += 1;
    else if (code.includes("D")) counts.deleted += 1;
    else if (code.includes("R")) counts.renamed += 1;
    else counts.other += 1;
  }

  return { available: true, root, branch, header, dirty: entries.length, counts };
}

function nearestPackage(cwd) {
  const packagePath = findUp(cwd, "package.json");
  if (!packagePath) return null;

  try {
    const parsed = JSON.parse(readText(packagePath));
    return {
      path: packagePath,
      name: parsed.name || null,
      version: parsed.version || null,
    };
  } catch (_) {
    return { path: packagePath, name: null, version: null };
  }
}

function projectHints(cwd, gitRoot) {
  const agentsPath = findUp(cwd, "AGENTS.md");
  const activeStatusPath = gitRoot ? path.join(gitRoot, "ACTIVE-STATUS.md") : null;
  const activeStatusText = activeStatusPath ? readText(activeStatusPath) : null;
  const activePriority = activeStatusText
    ? activeStatusText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith("- (")) || null
    : null;

  return {
    agentsPath,
    package: nearestPackage(cwd),
    activePriority: activePriority ? activePriority.replace(/\s+/g, " ") : null,
  };
}

function hookSummary(codexHome) {
  const hookPath = path.join(codexHome, "hooks.json");
  const text = readText(hookPath);
  if (!text) return { path: hookPath, events: {} };

  try {
    const parsed = JSON.parse(text);
    const events = {};
    for (const [event, groups] of Object.entries(parsed.hooks || {})) {
      events[event] = Array.isArray(groups)
        ? groups.reduce((sum, group) => sum + ((group.hooks || []).length || 0), 0)
        : 0;
    }
    return { path: hookPath, events };
  } catch (error) {
    return { path: hookPath, error: error.message, events: {} };
  }
}

function listSessionFiles(codexHome) {
  const sessionsRoot = path.join(codexHome, "sessions");
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir) || files.length > 3000) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/^rollout-.*\.jsonl$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(sessionsRoot);
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function readTailLines(filePath, maxLines) {
  const text = readText(filePath);
  if (!text) return [];
  const lines = text.trim().split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines));
}

function parseTokenCount(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch (_) {
    return null;
  }

  const payload = event && event.payload;
  if (!payload || payload.type !== "token_count") return null;

  return {
    timestamp: event.timestamp || null,
    info: payload.info || null,
    rateLimits: payload.rate_limits || null,
  };
}

function percentFromTokens(usage, contextWindow) {
  const total = usage && Number(usage.total_tokens);
  const window = Number(contextWindow);
  if (!Number.isFinite(total) || !Number.isFinite(window) || window <= 0) return null;
  return Math.max(0, Math.round((total / window) * 100));
}

function rateWindow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const usedPercent = Number(raw.used_percent);
  const windowMinutes = Number(raw.window_minutes);
  const resetsAt = Number(raw.resets_at);
  return {
    usedPercent: Number.isFinite(usedPercent) ? Math.round(usedPercent) : null,
    windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : null,
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  };
}

function latestUsage(codexHome) {
  const files = listSessionFiles(codexHome);
  let latestContext = null;
  let latestRateLimits = null;
  let sourceFile = null;

  for (const file of files.slice(0, 50)) {
    const lines = readTailLines(file, 1200).reverse();

    for (const line of lines) {
      const tokenCount = parseTokenCount(line);
      if (!tokenCount) continue;

      if (!latestContext && tokenCount.info) {
        const info = tokenCount.info;
        latestContext = {
          usedPercent: percentFromTokens(info.last_token_usage, info.model_context_window),
          usedTokens: info.last_token_usage ? Number(info.last_token_usage.total_tokens) : null,
          windowTokens: Number(info.model_context_window) || null,
          timestamp: tokenCount.timestamp,
        };
        sourceFile = file;
      }

      if (!latestRateLimits && tokenCount.rateLimits) {
        latestRateLimits = {
          primary: rateWindow(tokenCount.rateLimits.primary),
          secondary: rateWindow(tokenCount.rateLimits.secondary),
          planType: tokenCount.rateLimits.plan_type || null,
          limitId: tokenCount.rateLimits.limit_id || null,
          timestamp: tokenCount.timestamp,
        };
      }

      if (latestContext && latestRateLimits) {
        return {
          sourceFile,
          context: latestContext,
          rateLimits: latestRateLimits,
        };
      }
    }
  }

  return {
    sourceFile,
    context: latestContext,
    rateLimits: latestRateLimits,
  };
}

function commandVersion(command, args) {
  const out = run(command, args);
  return out ? out.split(/\r?\n/)[0] : null;
}

function mergedConfigValue(configs, key) {
  return firstTomlString(configs.projectText, key) || firstTomlString(configs.userText, key);
}

function collect() {
  const cwd = process.cwd();
  const codexHome = resolveCodexHome();
  const git = gitInfo(cwd);
  const configs = resolveConfig(codexHome, cwd, git.root);
  const statusItems = tomlStringArray(configs.userText, "tui", "status_line");
  const hints = projectHints(cwd, git.root);

  return {
    codexHudVersion: VERSION,
    generatedAt: new Date().toISOString(),
    cwd,
    codexHome,
    codexVersion: commandVersion("codex", ["--version"]),
    nodeVersion: process.version,
    config: {
      userPath: configs.userConfig,
      projectPath: configs.projectConfig,
      model: mergedConfigValue(configs, "model"),
      reasoning: mergedConfigValue(configs, "model_reasoning_effort"),
      sandbox: mergedConfigValue(configs, "sandbox_mode"),
      approval: mergedConfigValue(configs, "approval_policy"),
      nativeStatusItems: statusItems,
      nativeStatusItemCount: statusItems.length,
      nativeStatusColors: tomlBoolean(configs.userText, "tui", "status_line_use_colors"),
    },
    git,
    project: hints,
    hooks: hookSummary(codexHome),
    usage: latestUsage(codexHome),
    limits: {
      note: "Usage is parsed from the latest Codex rollout JSONL. Codex's native TUI status line remains authoritative.",
    },
  };
}

function formatCounts(counts) {
  if (!counts) return "clean";
  const parts = [];
  for (const key of ["modified", "added", "deleted", "renamed", "untracked", "other"]) {
    if (counts[key]) parts.push(key[0] + ":" + counts[key]);
  }
  return parts.length ? parts.join(" ") : "clean";
}

function formatHookEvents(events) {
  const parts = Object.entries(events || {})
    .filter(([, count]) => count > 0)
    .map(([event, count]) => event + ":" + count);
  return parts.length ? parts.join(" ") : "none";
}

function formatPercent(value) {
  return Number.isFinite(value) ? Math.round(value) + "%" : "?";
}

function colorize(text, color, colorEnabled) {
  return colorEnabled && color ? color + text + RESET : text;
}

function colorByPercent(value) {
  if (!Number.isFinite(value)) return COLORS.dim;
  if (value >= 90) return COLORS.coral;
  if (value >= 70) return COLORS.amber;
  return COLORS.mint;
}

function formatDurationUntil(epochSeconds) {
  const seconds = Number(epochSeconds) - Date.now() / 1000;
  if (!Number.isFinite(seconds)) return "?";
  if (seconds <= 0) return "NOW";

  const hours = seconds / 3600;
  if (hours < 24) {
    return (hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()) + "H";
  }

  const days = hours / 24;
  return (days < 10 ? days.toFixed(1) : Math.round(days).toString()) + "D";
}

function formatReasoningEffort(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (/^x[-_ ]?high$/i.test(normalized)) return "xhigh";
  if (/^high$/i.test(normalized)) return "High";
  if (/^medium$/i.test(normalized)) return "Med";
  if (/^low$/i.test(normalized)) return "Low";
  return normalized;
}

function formatMetric(label, percent, remaining, colorEnabled) {
  const labelText = colorize(label, COLORS.dim, colorEnabled);
  const percentText = colorize(formatPercent(percent), colorByPercent(percent), colorEnabled);
  const remainingText = remaining
    ? colorize("(" + remaining + ")", COLORS.dim, colorEnabled)
    : "";
  return labelText + colorize(":", COLORS.dim, colorEnabled) + percentText + remainingText;
}

function formatRate(label, window, colorEnabled) {
  if (!window) {
    return colorize(label, COLORS.dim, colorEnabled) + colorize(":?", COLORS.dim, colorEnabled);
  }
  const remaining = window.resetsAt ? formatDurationUntil(window.resetsAt) : "";
  return formatMetric(label, window.usedPercent, remaining, colorEnabled);
}

function statusProjectName(data) {
  if (data.project.package && data.project.package.name) return data.project.package.name;
  if (data.git.available && data.git.root) return path.basename(data.git.root);
  return path.basename(data.cwd);
}

function statusGitBranch(data) {
  if (!data.git.available) return null;
  return data.git.branch + (data.git.dirty > 0 ? "*" : "");
}

function statusModel(data) {
  const model = data.config.model || (data.codexVersion || "").split(/\s+/)[0] || null;
  const reasoning = formatReasoningEffort(data.config.reasoning);
  return [model, reasoning].filter(Boolean).join(" ") || null;
}

function formatWorkspace(data, colorEnabled) {
  const project = colorize(statusProjectName(data), COLORS.cyan, colorEnabled);
  const branch = statusGitBranch(data);
  if (!branch) return project;

  const cleanBranch = branch.endsWith("*") ? branch.slice(0, -1) : branch;
  const dirty = branch.endsWith("*") ? colorize("*", COLORS.amber, colorEnabled) : "";
  const git = colorize(" git:(", COLORS.violet, colorEnabled)
    + colorize(cleanBranch, COLORS.violet, colorEnabled)
    + dirty
    + colorize(")", COLORS.violet, colorEnabled);
  return project + git;
}

function formatUsageLine(data, options = {}) {
  const colorEnabled = options.color === true;
  const usage = data.usage || {};
  const context = usage.context || {};
  const rateLimits = usage.rateLimits || {};
  const usageLine = [
    formatMetric("CTX", context.usedPercent, "", colorEnabled),
    formatRate("5H", rateLimits.primary, colorEnabled),
    formatRate("7D", rateLimits.secondary, colorEnabled),
  ].join(colorize(" | ", COLORS.dim, colorEnabled));
  const model = statusModel(data);
  return [
    model ? colorize(model, COLORS.neonViolet, colorEnabled) : null,
    formatWorkspace(data, colorEnabled),
    usageLine,
  ].filter(Boolean).join(colorize(" · ", COLORS.dim, colorEnabled));
}

function formatText(data) {
  const statusPreview = data.config.nativeStatusItems.slice(0, 8).join(", ");
  const statusSuffix =
    data.config.nativeStatusItems.length > 8
      ? " +" + (data.config.nativeStatusItems.length - 8)
      : "";
  const pkg = data.project.package;

  return [
    "Codex HUD " + data.codexHudVersion + " | " + (data.codexVersion || "codex unavailable"),
    "Generated: " + data.generatedAt,
    "",
    "Codex",
    "  model: " + (data.config.model || "?") + " / reasoning " + (data.config.reasoning || "?"),
    "  sandbox: " + (data.config.sandbox || "?") + " / approval " + (data.config.approval || "?"),
    "  status line: " + data.config.nativeStatusItemCount + " items, colors " +
      (data.config.nativeStatusColors === null ? "?" : data.config.nativeStatusColors ? "on" : "off"),
    "  items: " + (statusPreview || "none") + statusSuffix,
    "  usage: " + formatUsageLine(data),
    "",
    "Workspace",
    "  cwd: " + data.cwd,
    data.git.available
      ? "  git: " + data.git.header + " | dirty " + data.git.dirty + " (" + formatCounts(data.git.counts) + ")"
      : "  git: unavailable",
    "  repo: " + (data.git.root || "?"),
    "  package: " + (pkg && pkg.name ? pkg.name + (pkg.version ? "@" + pkg.version : "") : "none detected"),
    "  AGENTS.md: " + (data.project.agentsPath || "none detected"),
    "",
    "Hooks",
    "  events: " + formatHookEvents(data.hooks.events),
    "  file: " + data.hooks.path,
    "",
    "Project Priority",
    "  " + (data.project.activePriority || "none detected"),
    "",
    "Limitations",
    "  " + data.limits.note,
  ].join("\n");
}

function parseWatchSeconds(args) {
  const index = args.indexOf("--watch");
  if (index === -1) return null;
  const raw = args[index + 1];
  const parsed = raw ? Number(raw) : 5;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.max(1, parsed);
}

function printText() {
  console.log(formatText(collect()));
}

function printLine(options = {}) {
  console.log(formatUsageLine(collect(), options));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  if (args.includes("--line") || args.includes("--status-line")) {
    printLine({ color: args.includes("--color") || args.includes("--colors") });
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(collect(), null, 2));
    return;
  }

  const watchSeconds = parseWatchSeconds(args);
  if (watchSeconds) {
    const render = () => {
      process.stdout.write("\x1Bc");
      printText();
      console.log("\nRefreshing every " + watchSeconds + "s. Press Ctrl+C to stop.");
    };
    render();
    setInterval(render, watchSeconds * 1000);
    return;
  }

  printText();
}

main();
