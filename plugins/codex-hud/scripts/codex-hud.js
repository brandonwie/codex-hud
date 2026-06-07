#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const VERSION = "0.1.0";
const DEFAULT_TIMEOUT_MS = 1200;

function usage() {
  return [
    "codex-hud " + VERSION,
    "",
    "Usage:",
    "  codex-hud             Print a multiline Codex context HUD",
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
    limits: {
      note: "Live token and rate-limit values are rendered by Codex's native TUI status line, not exposed to this plugin script.",
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

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
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
