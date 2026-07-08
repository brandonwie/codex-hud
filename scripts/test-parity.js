#!/usr/bin/env node
"use strict";

// Site-vs-binary parity harness.
//
// The Rust renderer (rust/src/*) and the site playground (site/app.js) must
// resolve the same inputs the same way ("golden parity", per CLAUDE.md). The
// golden tests only exercise the Rust binary, and check-site.js only exercises
// app.js in isolation — so validity divergences between the two engines (bare
// hex accepted on one side, whitespace trimmed on one side, case-sensitive
// model shortening on one side) slip through. This harness runs a shared table
// of inputs through BOTH engines and asserts they agree.
//
// Usage: node scripts/test-parity.js [path-to-codex-hud-binary]

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const binaryArg = process.argv[2];
const binary = binaryArg
  ? path.resolve(process.cwd(), binaryArg)
  : path.join(root, "rust/target/release/codex-hud");
const fail = [];

// --- 1. Load the site's pure helpers via a permissive DOM mock -------------
// app.js is a self-executing IIFE that reads the DOM at load. We give it a
// permissive mock (every element resolves to a generic stub) and a global
// sentinel so it hands back resolveColor/shortModel. render() may run against
// empty fields under this mock; that is fine — we only need the captured
// helpers, so a throw after capture is swallowed.
const genericElement = () => ({
  value: "",
  checked: false,
  className: "",
  textContent: "",
  children: [],
  style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  append() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setAttribute() {},
  getAttribute() {
    return null;
  },
  select() {},
  remove() {},
});

const document = {
  body: genericElement(),
  getElementById() {
    return genericElement();
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return genericElement();
  },
  execCommand() {
    return true;
  },
};

const testHooks = {};
const context = {
  document,
  navigator: { clipboard: { writeText: async () => undefined } },
  Event: function Event(type) {
    this.type = type;
  },
  __CODEX_HUD_TEST__: testHooks,
};
context.globalThis = context;

const appSource = fs.readFileSync(path.join(root, "site", "app.js"), "utf8");
try {
  vm.runInNewContext(appSource, context, { filename: "site/app.js" });
} catch (_error) {
  // render() may throw against the permissive mock; helpers are captured before
  // render() runs, so we proceed as long as the hooks are present.
}

const siteResolveColor = testHooks.resolveColor;
const siteShortModel = testHooks.shortModel;
if (typeof siteResolveColor !== "function" || typeof siteShortModel !== "function") {
  console.error("parity check failed:");
  console.error("- site/app.js did not expose resolveColor/shortModel test hooks");
  process.exit(1);
}

// --- 2. Shared expectation tables ------------------------------------------
// `dim` / `245` are deliberately excluded from color cases: the Rust probe
// detects "invalid" as "renders identically to a guaranteed-invalid input",
// which falls back to dim(245) — so a real dim input would look invalid.
const COLOR_CASES = [
  { input: "mint", valid: true },
  { input: "cyan", valid: true },
  { input: "neonViolet", valid: true },
  { input: "violet", valid: true },
  { input: "45", valid: true }, // 256 code
  { input: "203", valid: true },
  { input: "#5fafff", valid: true }, // hashed hex
  { input: " mint", valid: true }, // leading whitespace (trim)
  { input: "  45  ", valid: true }, // padded numeric (trim)
  { input: " #5fafff ", valid: true }, // padded hex (trim)
  { input: "5fafff", valid: false }, // bare hex — invalid in both engines
  { input: "not-a-color", valid: false },
  { input: "#12xz34", valid: false }, // non-hex chars
  { input: "#12345", valid: false }, // 5 digits
  { input: "300", valid: false }, // out of 0-255 range
];

const MODEL_CASES = [
  { input: "gpt-5.5", short: "5.5" },
  { input: "GPT-5.5", short: "5.5" }, // uppercase prefix must still shorten
  { input: "Gpt-4o", short: "4o" },
  { input: "gpt-4o", short: "4o" },
  { input: "o3", short: "o3" }, // no gpt- prefix — unchanged
  { input: "claude-opus", short: "claude-opus" },
];

// --- 3. Rust probes via --render-json (single batched spawn) ---------------
const INVALID_COLOR = "zzz-not-a-color";

const colorReq = (input) => ({
  mode: "line",
  color: true,
  data: {
    config: { model: "gpt-5" },
    hud: { config: { segments: ["model"], colors: { model: input } } },
  },
});

const modelReq = (input) => ({
  mode: "line",
  color: false,
  data: {
    config: { model: input },
    hud: { config: { segments: ["model"], format: { modelShort: true } } },
  },
});

// Request order: [INVALID_COLOR probe, ...COLOR_CASES, ...MODEL_CASES]
const requests = [
  colorReq(INVALID_COLOR),
  ...COLOR_CASES.map((c) => colorReq(c.input)),
  ...MODEL_CASES.map((c) => modelReq(c.input)),
];

const stdin = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
const result = spawnSync(binary, ["--render-json"], { input: stdin, encoding: "utf8", cwd: root });
if (result.error) {
  console.error("parity check failed:");
  console.error(`- failed to spawn ${binary}: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("parity check failed:");
  console.error(`- --render-json exited ${result.status}: ${result.stderr || "(no stderr)"}`);
  process.exit(1);
}
const outputs = result.stdout
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail.push(`invalid --render-json output on line ${index + 1}: ${line} (${error})`);
      return null;
    }
  });

if (outputs.length !== requests.length) {
  console.error("parity check failed:");
  console.error(`- expected ${requests.length} render-json outputs, got ${outputs.length}`);
  process.exit(1);
}

// --- 4. Compare both engines against the table and each other --------------
const rustInvalidColor = outputs[0];

COLOR_CASES.forEach((testCase, i) => {
  const rustRendered = outputs[1 + i];
  // Rust: valid iff it renders differently from a guaranteed-invalid color
  // (an invalid color falls back to dim, matching the invalid probe).
  const rustValid = rustRendered !== rustInvalidColor;
  // Site: resolveColor returns the fallback sentinel iff the input is invalid.
  const SENTINEL = "__PARITY_FALLBACK__";
  const siteValid = siteResolveColor(testCase.input, SENTINEL) !== SENTINEL;

  if (siteValid !== testCase.valid) {
    fail.push(`color "${testCase.input}": site validity ${siteValid}, expected ${testCase.valid}`);
  }
  if (rustValid !== testCase.valid) {
    fail.push(`color "${testCase.input}": rust validity ${rustValid}, expected ${testCase.valid}`);
  }
  if (siteValid !== rustValid) {
    fail.push(`color "${testCase.input}": PARITY DIVERGENCE — site ${siteValid} vs rust ${rustValid}`);
  }
});

MODEL_CASES.forEach((testCase, i) => {
  const rustShort = outputs[1 + COLOR_CASES.length + i];
  const siteShort = siteShortModel(testCase.input);

  if (siteShort !== testCase.short) {
    fail.push(`model "${testCase.input}": site shortModel "${siteShort}", expected "${testCase.short}"`);
  }
  if (rustShort !== testCase.short) {
    fail.push(`model "${testCase.input}": rust rendered "${rustShort}", expected "${testCase.short}"`);
  }
  if (siteShort !== rustShort) {
    fail.push(`model "${testCase.input}": PARITY DIVERGENCE — site "${siteShort}" vs rust "${rustShort}"`);
  }
});

// --- 5. Report -------------------------------------------------------------
if (fail.length > 0) {
  console.error("parity check failed:");
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`parity check passed (${COLOR_CASES.length} color + ${MODEL_CASES.length} model cases through both engines)`);
