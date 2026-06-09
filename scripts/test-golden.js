#!/usr/bin/env node
"use strict";

// Golden parity harness for the Codex HUD renderer.
//
// The renderer is the reference oracle: this harness feeds it deterministic,
// synthetic `data` objects and captures the exact rendered bytes. A future
// reimplementation must reproduce these fixtures byte-for-byte. See
// spec/config-schema.md for the frozen contract.
//
//   node scripts/test-golden.js            # check against goldens (CI)
//   node scripts/test-golden.js --update   # re-capture goldens
//
// Time is frozen BEFORE the renderer is required so any Date-based logic
// (rate-limit reset durations, pace) is deterministic.

const FIXED = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01T00:00:00.000Z
const RealDate = Date;
// eslint-disable-next-line no-global-assign
global.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED);
    else super(...args);
  }
  static now() {
    return FIXED;
  }
};

const fs = require("fs");
const path = require("path");
const R = require("../plugins/codex-hud/scripts/codex-hud.js");

const FIXED_ISO = new RealDate(FIXED).toISOString();
const GOLDEN = path.join(__dirname, "golden", "hud-output.golden");

const clone = (o) => JSON.parse(JSON.stringify(o));

function deepMerge(base, over) {
  if (over === null || typeof over !== "object" || Array.isArray(over)) {
    return over === undefined ? base : clone(over);
  }
  const out = Object.assign({}, base);
  for (const k of Object.keys(over)) {
    const bv = base ? base[k] : undefined;
    const ov = over[k];
    out[k] =
      ov && typeof ov === "object" && !Array.isArray(ov) && bv && typeof bv === "object"
        ? deepMerge(bv, ov)
        : ov === null || typeof ov !== "object"
        ? ov
        : clone(ov);
  }
  return out;
}

// Canonical, fully-populated, deterministic data object. Mirrors the shape of
// collect() output so every segment and the multiline view have real inputs.
function baseData() {
  return {
    codexHudVersion: "0.3.0",
    hud: { config: clone(R.DEFAULT_CONFIG), contributors: [], warnings: [] },
    generatedAt: FIXED_ISO,
    cwd: "/work/proj",
    codexHome: "/home/user/.codex",
    codexVersion: "codex-cli 0.5.5",
    nodeVersion: "v24.3.0",
    runtime: { label: "node", version: "v24.3.0" },
    config: {
      userPath: "/home/user/.codex/config.toml",
      projectPath: null,
      model: "gpt-5.5",
      reasoning: "xhigh",
      sandbox: "workspace-write",
      approval: "on-request",
      nativeStatusItems: ["model", "directory"],
      nativeStatusItemCount: 2,
      nativeStatusColors: true,
    },
    git: {
      available: true,
      root: "/work/proj",
      branch: "main",
      header: "## main...origin/main",
      dirty: 0,
      counts: { modified: 0, added: 0, deleted: 0, renamed: 0, untracked: 0, other: 0 },
    },
    project: {
      agentsPath: "/work/proj/AGENTS.md",
      package: { path: "/work/proj/package.json", name: "proj", version: "1.0.0" },
      activePriority: null,
    },
    hooks: {
      path: "/home/user/.codex/hooks.json",
      events: { PostToolUse: 1, PreToolUse: 2, SessionStart: 1, Stop: 1, UserPromptSubmit: 3 },
    },
    usage: {
      sourceFile: "/home/user/.codex/sessions/sess.jsonl",
      context: { usedPercent: 21, usedTokens: 42000, windowTokens: 200000, timestamp: FIXED_ISO },
      tokens: { total: 904321, input: 533000, output: 5000, cache: 366000 },
      rateLimits: {
        primary: { usedPercent: 17, windowMinutes: 300, resetsAt: null },
        secondary: { usedPercent: 16, windowMinutes: 10080, resetsAt: null },
        planType: "pro",
        limitId: "abc",
        timestamp: FIXED_ISO,
      },
    },
    limits: { note: "Codex native status line remains authoritative for live values." },
  };
}

const makeData = (over) => deepMerge(baseData(), over || {});

// Compact-line cases: each rendered with color off AND on.
const LINE_CASES = [
  { name: "default", over: {} },
  { name: "dirty-repo", over: { git: { dirty: 3, counts: { modified: 2, untracked: 1 } } } },
  { name: "git-unavailable", over: { git: { available: false } } },
  { name: "warn-thresholds", over: { usage: { context: { usedPercent: 75 }, rateLimits: { primary: { usedPercent: 72 }, secondary: { usedPercent: 71 } } } } },
  { name: "crit-thresholds", over: { usage: { context: { usedPercent: 95 }, rateLimits: { primary: { usedPercent: 93 }, secondary: { usedPercent: 91 } } } } },
  { name: "boundary-70", over: { usage: { context: { usedPercent: 70 } } } },
  { name: "boundary-90", over: { usage: { context: { usedPercent: 90 } } } },
  { name: "no-rates", over: { usage: { rateLimits: { primary: null, secondary: null } } } },
  { name: "no-tokens", over: { usage: { tokens: null } } },
  { name: "tokens-millions", over: { usage: { tokens: { total: 1500000, input: 1200000, output: 50000, cache: 250000 } } } },
  { name: "tokens-round-up", over: { usage: { tokens: { total: 1500, input: 900, output: 100, cache: 500 } } } },
  { name: "tokens-round-down", over: { usage: { tokens: { total: 1499, input: 899, output: 100, cache: 500 } } } },
  { name: "spaced", over: { hud: { config: { space: true } } } },
  { name: "no-token-parts", over: { hud: { config: { format: { tokenParts: false } } } } },
  { name: "no-pace", over: {
    hud: { config: { format: { showPace: false } } },
    usage: { rateLimits: { primary: { usedPercent: 17, windowMinutes: 300, resetsAt: (FIXED / 1000) + 7200 } } },
  } },
  { name: "subset-segments", over: { hud: { config: { segments: ["model", "ctx", "tkn"] } } } },
  { name: "reordered-segments", over: { hud: { config: { segments: ["tkn", "branch", "model"] } } } },
  { name: "runtime-enabled", over: { hud: { config: { segments: ["model", "project", "branch", "runtime", "ctx", "5h", "7d", "tkn"] } } } },
  { name: "recolored", over: { hud: { config: { colors: { model: "cyan", branch: "#5fafff", tokenTotal: "mint" } } } } },
  { name: "reasoning-low", over: { config: { reasoning: "low" } } },
  { name: "reasoning-medium", over: { config: { reasoning: "medium" } } },
  { name: "reasoning-high", over: { config: { reasoning: "high" } } },
];

// Multiline cases (formatText has no color dimension).
const TEXT_CASES = [
  { name: "default", over: {} },
  { name: "git-unavailable", over: { git: { available: false } } },
  { name: "no-usage", over: { usage: { context: null, tokens: null, rateLimits: { primary: null, secondary: null } } } },
  { name: "many-status-items", over: { config: { nativeStatusItems: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], nativeStatusItemCount: 10 } } },
];

// Make ANSI escapes visible so goldens stay printable + diff-friendly.
const esc = (s) => String(s).replace(/\x1b/g, "\\x1b");

// Split the golden text back into per-case blocks. Cases are delimited by a
// blank line before each "### " header; multiline text bodies can contain blank
// lines, so we split on the header boundary, not on every blank line.
const splitBlocks = (s) => s.trim().split(/\n\n(?=### )/);

function build() {
  const blocks = [];
  for (const c of LINE_CASES) {
    for (const color of [false, true]) {
      const out = R.formatUsageLine(makeData(c.over), { color });
      blocks.push(`### line | ${c.name} | color=${color}\n${esc(out)}`);
    }
  }
  for (const c of TEXT_CASES) {
    const out = R.formatText(makeData(c.over));
    blocks.push(`### text | ${c.name}\n${esc(out)}`);
  }
  return blocks.join("\n\n") + "\n";
}

function main() {
  const update = process.argv.includes("--update");
  const built = build();
  const blockCount = splitBlocks(built).length;

  if (update) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, built);
    console.log(`golden updated: ${path.relative(process.cwd(), GOLDEN)} (${blockCount} blocks)`);
    return;
  }

  if (!fs.existsSync(GOLDEN)) {
    console.error("golden file missing — run: node scripts/test-golden.js --update");
    process.exit(1);
  }

  const expected = fs.readFileSync(GOLDEN, "utf8");
  if (expected === built) {
    console.log(`golden parity OK (${blockCount} blocks)`);
    return;
  }

  const a = splitBlocks(expected);
  const b = splitBlocks(built);
  let at = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      at = i;
      break;
    }
  }
  console.error(`GOLDEN MISMATCH at block ${at} (of ${Math.max(a.length, b.length)})`);
  console.error("--- expected ---\n" + (a[at] || "(missing)"));
  console.error("--- actual ---\n" + (b[at] || "(missing)"));
  console.error("\nIf this change is intentional: npm run golden:update");
  process.exit(1);
}

main();
