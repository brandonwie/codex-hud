#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Vendored TOML parser (see scripts/vendor-toml.js). Loaded defensively: if the
// vendored file is ever missing or broken, config silently disables and the HUD
// falls back to defaults rather than crashing the status line.
let parseToml;
try {
  parseToml = require("../vendor/toml.js").parse;
} catch (_) {
  parseToml = null;
}

const VERSION = "0.3.0";
const DEFAULT_TIMEOUT_MS = 1200;
const RESET = "\x1b[0m";
const COLORS = {
  dim: "\x1b[38;5;245m",
  coral: "\x1b[38;5;203m",
  mint: "\x1b[38;5;85m",
  amber: "\x1b[38;5;215m",
  cyan: "\x1b[38;5;45m",
  violet: "\x1b[38;5;135m",
  neonViolet: "\x1b[38;5;135m",
};

function usage() {
  return [
    "codex-hud " + VERSION,
    "",
    "Usage:",
    "  codex-hud             Print a multiline Codex context HUD",
    "  codex-hud --line      Print compact model, git, usage, and tokens",
    "  codex-hud --line --color",
    "                        Print compact usage with 256-color ANSI styling",
    "  codex-hud --status-line",
    "                        Alias for --line",
    "  codex-hud --json      Print the same data as JSON",
    "  codex-hud --watch 5   Refresh the text HUD every 5 seconds",
    "  codex-hud --init-config",
    "                        Write a starter codex-hud.toml in CODEX_HOME (--force to overwrite)",
    "  codex-hud --print-config",
    "                        Print the resolved, merged HUD config as JSON",
    "  codex-hud --config-path",
    "                        Show which codex-hud.toml files are in effect",
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
  const usedPercent = Number(raw.used_percent ?? raw.used_percentage);
  const windowMinutes = Number(raw.window_minutes);
  const resetsAt = Number(raw.resets_at);
  return {
    usedPercent: Number.isFinite(usedPercent) ? Math.round(usedPercent) : null,
    windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : null,
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  };
}

function tokenNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function tokenSummary(raw) {
  if (!raw || typeof raw !== "object") return null;

  const input = tokenNumber(raw.input_tokens);
  const output = tokenNumber(raw.output_tokens);
  const cache = tokenNumber(raw.cached_input_tokens ?? raw.cache_read_input_tokens);
  const fallbackTotal = tokenNumber(raw.total_tokens);
  const componentTotal = [input, output, cache]
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const total = componentTotal > 0 ? componentTotal : fallbackTotal;

  if (total === null) return null;
  return { total, input, output, cache };
}

function latestUsage(codexHome) {
  const files = listSessionFiles(codexHome);
  let latestContext = null;
  let latestTokens = null;
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

      if (!latestTokens && tokenCount.info) {
        latestTokens = tokenSummary(tokenCount.info.total_token_usage || tokenCount.info.last_token_usage);
      }

      if (!latestRateLimits && tokenCount.rateLimits) {
        const primary = rateWindow(tokenCount.rateLimits.primary);
        const secondary = rateWindow(tokenCount.rateLimits.secondary);
        if (!primary && !secondary) continue;
        latestRateLimits = {
          primary,
          secondary,
          planType: tokenCount.rateLimits.plan_type || null,
          limitId: tokenCount.rateLimits.limit_id || null,
          timestamp: tokenCount.timestamp,
        };
      }

      if (latestContext && latestTokens && latestRateLimits) {
        return {
          sourceFile,
          context: latestContext,
          tokens: latestTokens,
          rateLimits: latestRateLimits,
        };
      }
    }
  }

  return {
    sourceFile,
    context: latestContext,
    tokens: latestTokens,
    rateLimits: latestRateLimits,
  };
}

function commandVersion(command, args) {
  const out = run(command, args);
  return out ? out.split(/\r?\n/)[0] : null;
}

function runtimeInfo(cwd) {
  if (findUp(cwd, "package.json") || findUp(cwd, ".nvmrc") || findUp(cwd, ".node-version")) {
    return {
      label: "node",
      version: commandVersion("node", ["-v"]) || process.version,
    };
  }
  return null;
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
  const hud = loadHudConfig(codexHome, cwd, git.root);

  return {
    codexHudVersion: VERSION,
    hud,
    generatedAt: new Date().toISOString(),
    cwd,
    codexHome,
    codexVersion: commandVersion("codex", ["--version"]),
    nodeVersion: process.version,
    runtime: runtimeInfo(cwd),
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

function nowMs() {
  const override = Number(process.env.CODEX_HUD_NOW_MS);
  return Number.isFinite(override) && override > 0 ? override : Date.now();
}

function colorize(text, color, colorEnabled) {
  return colorEnabled && color ? color + text + RESET : text;
}

function formatDurationUntil(epochSeconds) {
  const seconds = Number(epochSeconds) - nowMs() / 1000;
  if (!Number.isFinite(seconds)) return "?";
  if (seconds <= 0) return "now";

  const hours = seconds / 3600;
  if (hours < 24) {
    return (hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()) + "h";
  }

  const days = hours / 24;
  return (days < 10 ? days.toFixed(1) : Math.round(days).toString()) + "d";
}

function formatDurationWindow(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  const hours = value / 60;
  if (hours < 24) return (hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()).replace(/\.0$/, "") + "h";

  const days = hours / 24;
  return (days < 10 ? days.toFixed(1) : Math.round(days).toString()).replace(/\.0$/, "") + "d";
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

function ratePacePercent(window) {
  if (!window || !window.resetsAt || !window.windowMinutes) return null;
  const remainingMs = Math.max(0, (window.resetsAt * 1000) - nowMs());
  const windowMs = window.windowMinutes * 60000;
  const elapsedMs = windowMs - remainingMs;
  if (elapsedMs < 0 || elapsedMs > windowMs) return null;
  return Math.round((elapsedMs / windowMs) * 100);
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
  const rawModel = data.config.model || (data.codexVersion || "").split(/\s+/)[0] || null;
  const model = rawModel ? String(rawModel).replace(/^gpt-/i, "") : null;
  const reasoning = formatReasoningEffort(data.config.reasoning);
  return [model, reasoning].filter(Boolean).join("") || null;
}

// ── Config-driven footer rendering ──────────────────────────────────────────
// resolveColor maps a user color value to a 256-color ANSI fg sequence:
//   - a named palette key (read from COLORS, so defaults stay byte-identical)
//   - a 256 index 0-255 (number or numeric string)
//   - a "#rrggbb" hex (mapped to the NEAREST xterm-256 color)
// Anything invalid returns `fallback` — never raw/garbage ANSI.
function resolveColor(input, fallback) {
  if (input == null) return fallback;
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(COLORS, input)) {
    return COLORS[input];
  }
  if (typeof input === "number" || (typeof input === "string" && /^\d{1,3}$/.test(input))) {
    const n = Number(input);
    if (Number.isInteger(n) && n >= 0 && n <= 255) return "\x1b[38;5;" + n + "m";
    return fallback;
  }
  if (typeof input === "string" && /^#?[0-9a-fA-F]{6}$/.test(input)) {
    const hex = input.replace(/^#/, "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return "\x1b[38;5;" + nearestXterm256(r, g, b) + "m";
  }
  return fallback;
}

// Map an RGB triple to the closest xterm-256 index, comparing the 6x6x6 color
// cube (indices 16-231) against the 24-step grayscale ramp (232-255).
function nearestXterm256(r, g, b) {
  const STEPS = [0, 95, 135, 175, 215, 255];
  const nearestStep = (v) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < STEPS.length; i++) {
      const d = Math.abs(STEPS[i] - v);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };
  const ri = nearestStep(r);
  const gi = nearestStep(g);
  const bi = nearestStep(b);
  const cubeIdx = 16 + 36 * ri + 6 * gi + bi;
  const cube = [STEPS[ri], STEPS[gi], STEPS[bi]];

  const gray = Math.round((r + g + b) / 3);
  const grayLevel = Math.max(0, Math.min(23, Math.round((gray - 8) / 10)));
  const grayVal = 8 + grayLevel * 10;
  const grayIdx = 232 + grayLevel;

  const dist = (a, c) => (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2;
  return dist(cube, [r, g, b]) <= dist([grayVal, grayVal, grayVal], [r, g, b]) ? cubeIdx : grayIdx;
}

// Resolve every value in a config.colors map to a concrete ANSI sequence once.
function resolveColorSet(colorsCfg) {
  const out = {};
  for (const key of Object.keys(colorsCfg)) {
    out[key] = resolveColor(colorsCfg[key], COLORS.dim);
  }
  return out;
}

// DEFAULT_CONFIG reproduces the pre-config footer except the `runtime` (node vX)
// segment, which is intentionally omitted from the default `segments` list (it
// stays registered, so users can opt it back in). Every other value is the
// literal pulled from the original hardcoded renderer, so the remaining segments
// render byte-for-byte identically.
const DEFAULT_CONFIG = {
  segments: ["model", "project", "branch", "ctx", "5h", "7d", "tkn"],
  space: false,
  separators: { segment: "|", tokenPart: ",", labelValue: ":", open: "(", close: ")" },
  labels: { ctx: "Ctx", "5h": "5h", "7d": "7d", tkn: "Tkn", tokenInput: "I:", tokenOutput: "O:", tokenCache: "C:" },
  colors: {
    model: "neonViolet",
    project: "cyan",
    branch: "neonViolet",
    runtime: "dim",
    dirty: "amber",
    label: "dim",
    separator: "dim",
    tokenTotal: "amber",
    tokenInput: "cyan",
    tokenOutput: "cyan",
    tokenCache: "cyan",
    pace: "mint",
    ok: "mint",
    warn: "amber",
    crit: "coral",
    none: "dim",
  },
  thresholds: { percent: { warn: 70, crit: 90 }, pace: { warn: 0, crit: 15 } },
  format: { percentRound: true, tokenUnits: true, tokenParts: true, showPace: true },
};

// Convenience aliases expanded before id validation, so the simple public form
// ["model","workspace","ctx","5h","7d","tkn"] works as-is.
const SEGMENT_ALIASES = {
  workspace: ["project", "branch", "runtime"],
  context: ["ctx"],
  tokens: ["tkn"],
};

// cfg-aware value formatters — each defaults to its pre-config counterpart.
function formatPercentCfg(value, format) {
  if (!Number.isFinite(value)) return "?";
  return (format.percentRound ? Math.round(value) : Math.round(value * 10) / 10) + "%";
}

function formatTokenCountCfg(value, format) {
  if (!Number.isFinite(value)) return "?";
  if (!format.tokenUnits) return Math.round(value).toString();
  if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (value >= 1000) return Math.round(value / 1000) + "k";
  return Math.round(value).toString();
}

function colorByPercentCfg(value, ctx) {
  const t = ctx.thresholds.percent;
  const c = ctx.colors;
  if (!Number.isFinite(value)) return c.none;
  if (value >= t.crit) return c.crit;
  if (value >= t.warn) return c.warn;
  return c.ok;
}

function colorByPaceDeltaCfg(percent, pace, ctx) {
  const t = ctx.thresholds.pace;
  const c = ctx.colors;
  if (!Number.isFinite(percent) || !Number.isFinite(pace)) return c.none;
  const diff = percent - pace;
  if (diff > t.crit) return c.crit;
  if (diff > t.warn) return c.warn;
  return c.ok;
}

function renderMetric(label, percent, detail, ctx) {
  const e = ctx.colorEnabled;
  const c = ctx.colors;
  const s = ctx.separators;
  const labelText = colorize(label, ctx.color || c.label, e);
  const percentText = colorize(formatPercentCfg(percent, ctx.format), colorByPercentCfg(percent, ctx), e);
  const detailText = detail ? colorize(s.open + detail + s.close, c.label, e) : "";
  return labelText + colorize(s.labelValue, c.label, e) + percentText + detailText;
}

function renderRate(label, window, ctx) {
  const e = ctx.colorEnabled;
  const c = ctx.colors;
  const s = ctx.separators;
  if (!window) {
    return colorize(label, ctx.color || c.label, e) + colorize(s.labelValue + "?", c.label, e);
  }
  const remainingRaw = window.resetsAt ? formatDurationUntil(window.resetsAt) : "";
  const remaining = remainingRaw === "now" ? formatDurationWindow(window.windowMinutes) || remainingRaw : remainingRaw;
  const pace = ratePacePercent(window);
  const detailParts = [];
  if (remaining) detailParts.push(colorize(remaining, c.label, e));
  if (ctx.format.showPace && pace !== null) {
    detailParts.push(colorize(formatPercentCfg(pace, ctx.format), c.pace || colorByPaceDeltaCfg(window.usedPercent, pace, ctx), e));
  }
  const detail = detailParts.length
    ? colorize(s.open, c.label, e) + detailParts.join(colorize(s.tokenPart, c.label, e)) + colorize(s.close, c.label, e)
    : "";
  const labelText = colorize(label, ctx.color || c.label, e);
  const percentText = colorize(formatPercentCfg(window.usedPercent, ctx.format), colorByPercentCfg(window.usedPercent, ctx), e);
  return labelText + colorize(s.labelValue, c.label, e) + percentText + detail;
}

function renderTokenUsage(label, tokens, ctx) {
  const e = ctx.colorEnabled;
  const c = ctx.colors;
  const s = ctx.separators;
  const lab = ctx.labels;
  const labelText = colorize(label, ctx.color || c.label, e);
  if (!tokens) return labelText + colorize(s.labelValue + "?", c.label, e);

  const total = colorize(formatTokenCountCfg(tokens.total, ctx.format), c.tokenTotal, e);
  if (!ctx.format.tokenParts) {
    return labelText + colorize(s.labelValue, c.label, e) + total;
  }
  const input = colorize(formatTokenCountCfg(tokens.input, ctx.format), c.tokenInput, e);
  const output = colorize(formatTokenCountCfg(tokens.output, ctx.format), c.tokenOutput, e);
  const cache = colorize(formatTokenCountCfg(tokens.cache, ctx.format), c.tokenCache, e);
  return labelText + colorize(s.labelValue, c.label, e) + total
    + colorize(s.open + lab.tokenInput, c.label, e) + input
    + colorize(s.tokenPart + lab.tokenOutput, c.label, e) + output
    + colorize(s.tokenPart + lab.tokenCache, c.label, e) + cache
    + colorize(s.close, c.label, e);
}

// Segment registry. Each entry: { id, defaultLabel?, joinWithPrevious?, render }.
// `joinWithPrevious` glues this segment to the prior one with a raw (uncolored)
// string instead of the colored segment separator.
const SEGMENTS = {
  model: {
    id: "model",
    render(data, ctx) {
      const model = statusModel(data);
      return model ? colorize(model, ctx.color, ctx.colorEnabled) : null;
    },
  },
  project: {
    id: "project",
    render(data, ctx) {
      return colorize(statusProjectName(data), ctx.color, ctx.colorEnabled);
    },
  },
  branch: {
    id: "branch",
    render(data, ctx) {
      const branch = statusGitBranch(data);
      if (!branch) return null;
      const isDirty = branch.endsWith("*");
      const clean = isDirty ? branch.slice(0, -1) : branch;
      const dirty = isDirty ? colorize("*", ctx.colors.dirty, ctx.colorEnabled) : "";
      return colorize("git(", ctx.colors.label, ctx.colorEnabled)
        + colorize(clean, ctx.color, ctx.colorEnabled)
        + dirty
        + colorize(")", ctx.colors.label, ctx.colorEnabled);
    },
  },
  runtime: {
    id: "runtime",
    joinWithPrevious: " ",
    render(data, ctx) {
      const r = data.runtime;
      if (!r || !r.label || !r.version) return null;
      return colorize(r.label + " " + r.version, ctx.color, ctx.colorEnabled);
    },
  },
  ctx: {
    id: "ctx",
    defaultLabel: "Ctx",
    render(data, ctx) {
      const context = (data.usage && data.usage.context) || {};
      return renderMetric(ctx.label, context.usedPercent, "", ctx);
    },
  },
  "5h": {
    id: "5h",
    defaultLabel: "5h",
    render(data, ctx) {
      const rl = (data.usage && data.usage.rateLimits) || {};
      return renderRate(ctx.label, rl.primary, ctx);
    },
  },
  "7d": {
    id: "7d",
    defaultLabel: "7d",
    render(data, ctx) {
      const rl = (data.usage && data.usage.rateLimits) || {};
      return renderRate(ctx.label, rl.secondary, ctx);
    },
  },
  tkn: {
    id: "tkn",
    defaultLabel: "Tkn",
    render(data, ctx) {
      return renderTokenUsage(ctx.label, data.usage && data.usage.tokens, ctx);
    },
  },
};

// Config used for rendering: the loaded user config (attached to data.hud by
// collect()) or DEFAULT_CONFIG when no config layer is present.
function getRenderConfig(data) {
  return (data && data.hud && data.hud.config) || DEFAULT_CONFIG;
}

function effectiveSeparators(config) {
  const separators = clone(config.separators);
  if (config.space) {
    separators.segment = " " + separators.segment.trim() + " ";
    separators.labelValue = separators.labelValue.trimEnd() + " ";
  }
  return separators;
}

function renderFooter(data, config, options = {}) {
  const colorEnabled = options.color === true;
  const colors = resolveColorSet(config.colors);
  const sepColor = resolveColor(config.colors.separator, COLORS.dim);
  const separators = effectiveSeparators(config);
  const separator = colorize(separators.segment, sepColor, colorEnabled);

  const pieces = [];
  for (const id of config.segments) {
    const seg = SEGMENTS[id];
    if (!seg) continue;
    const ctx = {
      label: config.labels && config.labels[id] != null ? config.labels[id] : seg.defaultLabel || "",
      color: colors[id],
      colors,
      thresholds: config.thresholds,
      format: config.format,
      separators,
      labels: config.labels,
      colorEnabled,
    };
    let text;
    try {
      text = seg.render(data, ctx);
    } catch (_) {
      text = null;
    }
    if (text == null || text === "") continue;
    pieces.push({ text, joiner: seg.joinWithPrevious });
  }

  if (pieces.length === 0) return "";
  let out = pieces[0].text;
  for (let i = 1; i < pieces.length; i++) {
    const glue = pieces[i].joiner != null ? pieces[i].joiner : separator;
    out += glue + pieces[i].text;
  }
  return out;
}

// ── User config loading ─────────────────────────────────────────────────────
// Optional codex-hud.toml lets users pick/reorder segments and override labels,
// separators, colors, thresholds, and formats. Search order (later wins):
//   DEFAULT_CONFIG < $CODEX_HOME/codex-hud.toml < ./.codex/codex-hud.toml
//   (walked up to the git root) < $CODEX_HUD_CONFIG (explicit file).
// A missing file is fine; a malformed/invalid file is ignored (defaults used)
// with a one-line note on stderr. The status line must never break.
const HUD_CONFIG_FILENAME = "codex-hud.toml";

const CONFIG_SCAFFOLD = `# codex-hud.toml — Codex HUD footer configuration (every key is optional).
# Search order (first found in each tier; later tiers override earlier):
#   1. $CODEX_HUD_CONFIG            explicit file path (env var)
#   2. ./.codex/codex-hud.toml      per-project (walks up to the git root)
#   3. $CODEX_HOME/codex-hud.toml   per-user ($CODEX_HOME defaults to ~/.codex)
# Anything you omit inherits the built-in default. Delete this file to reset.
# A malformed or invalid file is ignored (defaults used) with a note on stderr.
# Inspect the resolved result with:  codex-hud --print-config

# Compact by default. Set space = true for " | " segment spacing and ": " labels.
space = false

# Text placed between segments. The space flag controls padding around this text.
separator = "|"

# Which segments to show, in order. Remove, reorder, or add any of these ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliases: "workspace" = project + branch + runtime; "context" = ctx; "tokens" = tkn.
# (runtime / "node vX" is available but off by default — add it to opt in.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Rename the label shown for a segment. Keys are segment ids.
[labels]
ctx = "Ctx"
"5h" = "5h"
"7d" = "7d"
tkn = "Tkn"

# Per-segment / threshold colors. A value is a palette name, a 256-color code
# (0-255), or a "#rrggbb" hex (mapped to the nearest 256 color).
# Palette names: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit are the threshold colors shared by ctx / 5h / 7d.
[colors]
model = "neonViolet"
project = "cyan"
branch = "neonViolet"
ok = "mint"
warn = "amber"
crit = "coral"

# Percent thresholds (0-100) switching ctx/5h/7d between ok/warn/crit colors.
[thresholds.percent]
warn = 70
crit = 90

# Pace thresholds for 5h/7d (how far ahead of an even burn rate before warn/crit).
[thresholds.pace]
warn = 0
crit = 15

# Value formatting toggles.
[format]
percentRound = true   # false -> one decimal place
tokenUnits = true     # false -> raw integers (no k/M)
tokenParts = true     # false -> total only, hide (I:.. O:.. C:..)
showPace = true       # false -> hide the pace % in 5h/7d
`;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

// Deep-merge override onto base. Arrays REPLACE (so `segments` is an exact list);
// plain objects merge key-by-key (override one label/color without restating all).
function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return clone(override);
  const out = clone(base);
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : clone(override[key]);
  }
  return out;
}

// Walk up from cwd for <dir>/<...relParts>, stopping at git root / fs root and
// skipping $HOME (mirrors findProjectConfig).
function findProjectFile(cwd, gitRoot, relParts) {
  let current = path.resolve(cwd);
  const home = path.resolve(os.homedir());
  const stopAt = gitRoot ? path.resolve(gitRoot) : path.parse(current).root;
  while (true) {
    const candidate = path.join(current, ...relParts);
    if (current !== home && fs.existsSync(candidate)) return candidate;
    if (current === stopAt) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// Ordered low->high precedence list of existing config sources.
function resolveHudConfigSources(codexHome, cwd, gitRoot) {
  const envRaw = process.env.CODEX_HUD_CONFIG;
  const sources = [
    { tier: "user", path: path.join(codexHome, HUD_CONFIG_FILENAME) },
    { tier: "project", path: findProjectFile(cwd, gitRoot, [".codex", HUD_CONFIG_FILENAME]) },
    { tier: "env", path: envRaw ? path.resolve(envRaw) : null },
  ];
  return sources.filter((src) => src.path);
}

function loadOneTomlFile(filePath) {
  const text = readText(filePath);
  if (text == null) return { ok: true, value: null }; // absent file is not an error
  if (!parseToml) return { ok: false, error: filePath + ": TOML parser unavailable" };
  try {
    return { ok: true, value: parseToml(text) };
  } catch (err) {
    return { ok: false, error: filePath + ": " + (err && err.message ? err.message : "parse error") };
  }
}

// Validate + coerce a raw parsed config into a safe partial. Never throws; drops
// unknown/ill-typed entries and records a note. resolveColor (render layer)
// interprets color values, so here we only require string|number for colors.
function validateAndCoerce(raw, warnings, source) {
  const note = (msg) => warnings.push(source + ": " + msg);
  if (!isPlainObject(raw)) {
    note("top-level config is not a table; ignored");
    return {};
  }
  const out = {};

  if ("segments" in raw) {
    if (Array.isArray(raw.segments)) {
      const known = new Set(Object.keys(SEGMENTS));
      const result = [];
      for (const entry of raw.segments) {
        if (typeof entry !== "string") {
          note("ignored non-string segment " + JSON.stringify(entry));
          continue;
        }
        for (const id of SEGMENT_ALIASES[entry] || [entry]) {
          if (known.has(id)) result.push(id);
          else note('unknown segment "' + id + '" ignored');
        }
      }
      out.segments = result;
    } else {
      note("segments must be an array; ignored");
    }
  }

  if ("separator" in raw) {
    if (typeof raw.separator === "string") out.separators = { segment: raw.separator };
    else note("separator must be a string; ignored");
  }
  if ("space" in raw) {
    if (typeof raw.space === "boolean") out.space = raw.space;
    else note("space must be a boolean; ignored");
  }
  if (isPlainObject(raw.separators)) {
    out.separators = out.separators || {};
    for (const key of Object.keys(raw.separators)) {
      if (typeof raw.separators[key] === "string") out.separators[key] = raw.separators[key];
      else note("separators." + key + " must be a string; ignored");
    }
  }

  if (isPlainObject(raw.labels)) {
    out.labels = {};
    for (const key of Object.keys(raw.labels)) {
      const value = raw.labels[key];
      if (typeof value === "string" || typeof value === "number") out.labels[key] = String(value).slice(0, 40);
      else note("labels." + key + " must be a string; ignored");
    }
  }

  if (isPlainObject(raw.colors)) {
    out.colors = {};
    for (const key of Object.keys(raw.colors)) {
      const value = raw.colors[key];
      if (typeof value === "string") out.colors[key] = value;
      else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) out.colors[key] = value;
      else note("colors." + key + " must be a color name, 0-255, or #hex; ignored");
    }
  }

  if (isPlainObject(raw.thresholds)) {
    out.thresholds = {};
    for (const group of ["percent", "pace"]) {
      if (!isPlainObject(raw.thresholds[group])) continue;
      const coerced = {};
      for (const key of ["warn", "crit"]) {
        const value = raw.thresholds[group][key];
        if (Number.isFinite(value)) coerced[key] = Math.max(0, Math.min(100, value));
        else if (value !== undefined) note("thresholds." + group + "." + key + " must be a number; ignored");
      }
      out.thresholds[group] = coerced;
    }
  }

  if (isPlainObject(raw.format)) {
    out.format = {};
    for (const key of ["percentRound", "tokenUnits", "tokenParts", "showPace"]) {
      if (typeof raw.format[key] === "boolean") out.format[key] = raw.format[key];
      else if (raw.format[key] !== undefined) note("format." + key + " must be a boolean; ignored");
    }
  }

  return out;
}

function loadHudConfig(codexHome, cwd, gitRoot) {
  const warnings = [];
  const contributors = [];
  let merged = clone(DEFAULT_CONFIG);
  try {
    for (const src of resolveHudConfigSources(codexHome, cwd, gitRoot)) {
      const res = loadOneTomlFile(src.path);
      if (!res.ok) {
        warnings.push(res.error);
        continue;
      }
      if (res.value == null) continue;
      merged = deepMerge(merged, validateAndCoerce(res.value, warnings, src.path));
      contributors.push({ tier: src.tier, path: src.path });
    }
  } catch (_) {
    return { config: clone(DEFAULT_CONFIG), contributors: [], warnings: ["codex-hud: config load failed, using defaults"] };
  }
  return { config: merged, contributors, warnings };
}

// Emit the first config warning (if any) to stderr. Codex consumes the status
// command's stdout only, so a stderr note never corrupts the rendered line.
function emitHudWarnings(data) {
  const warnings = data.hud && data.hud.warnings;
  if (warnings && warnings.length) {
    // Collapse embedded newlines (parser errors include a multi-line caret
    // diagram) so the note is always a single stderr line.
    const first = String(warnings[0]).replace(/\s+/g, " ").trim().slice(0, 300);
    const extra = warnings.length > 1 ? " (+" + (warnings.length - 1) + " more)" : "";
    process.stderr.write("codex-hud: " + first + extra + "\n");
  }
}

// --init-config: scaffold a commented codex-hud.toml into CODEX_HOME. The only
// writer in this script. Refuses to overwrite an existing file without --force.
function initConfig(options) {
  const codexHome = resolveCodexHome();
  const target = path.join(codexHome, HUD_CONFIG_FILENAME);
  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(target, CONFIG_SCAFFOLD, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    console.log("wrote " + target);
  } catch (err) {
    if (err && err.code === "EEXIST") {
      process.stderr.write("codex-hud: " + target + " already exists (use --init-config --force to overwrite)\n");
      process.exitCode = 1;
      return;
    }
    process.stderr.write("codex-hud: failed to write " + target + ": " + (err && err.message ? err.message : err) + "\n");
    process.exitCode = 1;
  }
}

// --config-path: show every candidate file (high precedence first) and whether
// it exists.
function printConfigPath() {
  const codexHome = resolveCodexHome();
  const cwd = process.cwd();
  const gitRoot = gitInfo(cwd).root;
  const envRaw = process.env.CODEX_HUD_CONFIG;
  const rows = [
    ["env     ($CODEX_HUD_CONFIG)", envRaw ? path.resolve(envRaw) : null],
    ["project (./.codex)", findProjectFile(cwd, gitRoot, [".codex", HUD_CONFIG_FILENAME])],
    ["user    ($CODEX_HOME)", path.join(codexHome, HUD_CONFIG_FILENAME)],
  ];
  console.log("codex-hud config search (highest precedence first):");
  for (const [label, candidate] of rows) {
    const status = candidate ? (fs.existsSync(candidate) ? "found  " : "absent ") : "unset  ";
    console.log("  " + status + label + (candidate ? "  " + candidate : ""));
  }
}

// --print-config: dump the merged config + which files contributed + warnings.
function printMergedConfig() {
  const cwd = process.cwd();
  const result = loadHudConfig(resolveCodexHome(), cwd, gitInfo(cwd).root);
  console.log(JSON.stringify(result, null, 2));
}

function formatUsageLine(data, options = {}) {
  return renderFooter(data, getRenderConfig(data), options);
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
  const data = collect();
  emitHudWarnings(data);
  console.log(formatText(data));
}

function printLine(options = {}) {
  const data = collect();
  emitHudWarnings(data);
  console.log(formatUsageLine(data, options));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  if (args.includes("--config-path")) {
    printConfigPath();
    return;
  }

  if (args.includes("--print-config")) {
    printMergedConfig();
    return;
  }

  if (args.includes("--init-config")) {
    initConfig({ force: args.includes("--force") });
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

if (require.main === module) {
  main();
}

module.exports = {
  formatUsageLine,
  formatText,
  renderFooter,
  resolveColor,
  nearestXterm256,
  DEFAULT_CONFIG,
  SEGMENTS,
  collect,
};
