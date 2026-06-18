#!/usr/bin/env node
"use strict";

// Measurement harness for the Rust HUD renderer.
//
// Reports the real release-binary size and startup/render latency for the
// user-facing --line path, and (when git history is available) compares the
// current Rust renderer against the legacy Node renderer it replaced.
//
//   node scripts/measure-rust-hud.js [runs]
//
// Requires: cargo build --release --manifest-path rust/Cargo.toml
//
// The legacy Node renderer is recovered at runtime from git, from the commit
// just before it was removed ("chore: remove legacy JS HUD renderer", b74a250),
// so no stale copy is committed to the tree. Both renderers are run with the
// same pinned CODEX_HUD_CONFIG so they read byte-identical config (a fair A/B),
// and both --help (no git/log work => isolates language+process startup) and
// --line (full hot path => startup + git subprocesses + rollout-log parse) are
// measured so the per-paint difference can be attributed to startup vs work.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const rustBin = path.join(repoRoot, "rust", "target", "release", "codex-hud");
const RUNS = Math.max(5, Number(process.argv[2]) || 15);

// Commit that still HAD the legacy Node renderer (parent of its removal commit).
const LEGACY_REF = "b74a250^";
const LEGACY_RENDERER = "plugins/codex-hud/scripts/codex-hud.js";
const LEGACY_VENDOR = "plugins/codex-hud/vendor/toml.js";

if (!fs.existsSync(rustBin)) {
  console.error("release binary missing — run: cargo build --release --manifest-path rust/Cargo.toml");
  process.exit(1);
}

// Pin config so both renderers resolve identical settings regardless of cwd.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-bench-"));
const pinnedConfig = path.join(tmpDir, "codex-hud.toml");
fs.writeFileSync(pinnedConfig, "[format]\neffortShort = false\n");
const env = { ...process.env, CODEX_HUD_CONFIG: pinnedConfig };

// Recover the legacy Node renderer from git history (best effort).
function recoverLegacyNode() {
  try {
    const renderer = execFileSync("git", ["show", `${LEGACY_REF}:${LEGACY_RENDERER}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const vendor = execFileSync("git", ["show", `${LEGACY_REF}:${LEGACY_VENDOR}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const rendererPath = path.join(tmpDir, "scripts", "codex-hud.js");
    const vendorPath = path.join(tmpDir, "vendor", "toml.js");
    fs.mkdirSync(path.dirname(rendererPath), { recursive: true });
    fs.mkdirSync(path.dirname(vendorPath), { recursive: true });
    fs.writeFileSync(rendererPath, renderer);
    fs.writeFileSync(vendorPath, vendor);
    return rendererPath;
  } catch (error) {
    return null;
  }
}

function timeOne(command, args) {
  const start = process.hrtime.bigint();
  const r = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", env });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  if (r.status !== 0) {
    console.error(`${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || ""}`);
    process.exit(1);
  }
  return { ms: elapsedMs, out: (r.stdout || "").trim() };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    mean: samples.reduce((s, v) => s + v, 0) / samples.length,
    min: sorted[0],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted[sorted.length - 1],
  };
}

function measure(label, command, args) {
  const warm = timeOne(command, args); // warmup (fs cache, git index)
  const samples = [];
  for (let i = 0; i < RUNS; i++) samples.push(timeOne(command, args).ms);
  const s = stats(samples);
  console.log(
    `  ${label.padEnd(16)} median ${s.median.toFixed(1)}ms  mean ${s.mean.toFixed(1)}ms  ` +
      `min ${s.min.toFixed(1)}ms  p90 ${s.p90.toFixed(1)}ms  max ${s.max.toFixed(1)}ms`
  );
  return { stats: s, out: warm.out };
}

try {
  const rustSize = fs.statSync(rustBin).size;
  let cpu = "unknown";
  try { cpu = os.cpus()[0].model; } catch (error) { /* ignore */ }

  console.log(`codex-hud measurement (${RUNS} runs each, --line, cwd=${path.basename(repoRoot)})`);
  console.log(`host: ${os.platform()} ${os.release()} ${os.arch()} | cpu: ${cpu} | node: ${process.version}`);
  console.log(`config: CODEX_HUD_CONFIG pinned (effortShort=false) | CODEX_HOME: ${env.CODEX_HOME || path.join(os.homedir(), ".codex")}`);
  console.log(`\nBinary size:`);
  console.log(`  rust release     ${(rustSize / 1024).toFixed(1)} KB (${rustSize} bytes)`);

  const nodeRenderer = recoverLegacyNode();

  console.log(`\nStartup + render latency:`);
  const rustLine = measure("rust --line", rustBin, ["--line"]);

  if (!nodeRenderer) {
    console.log(`\n(legacy Node renderer not recoverable from git ref ${LEGACY_REF}; skipping comparison)`);
    return;
  }

  console.log(`\nStartup-only (--help: no git, no log parse):`);
  const rustHelp = measure("rust --help", rustBin, ["--help"]);
  const nodeHelp = measure("node --help", "node", [nodeRenderer, "--help"]);

  console.log(`\nFull hot path (--line: startup + git subprocs + rollout-log parse):`);
  // rustLine already measured above; measure node --line here.
  const nodeLine = measure("node --line", "node", [nodeRenderer, "--line"]);

  const startupDelta = nodeHelp.stats.median - rustHelp.stats.median;
  const lineDelta = nodeLine.stats.median - rustLine.stats.median;

  console.log(`\nAnalysis (Rust vs legacy Node, recovered from ${LEGACY_REF}):`);
  console.log(`  output parity (--line): ${rustLine.out === nodeLine.out ? "IDENTICAL" : "DIFFERENT"}`);
  console.log(`  startup delta  (node --help - rust --help): ${startupDelta.toFixed(1)}ms  (language/runtime startup cost)`);
  console.log(`  hot-path delta (node --line - rust --line): ${lineDelta.toFixed(1)}ms  (saved per paint)`);
  console.log(`  hot-path speedup (median): ${(nodeLine.stats.median / rustLine.stats.median).toFixed(2)}x`);
  console.log(`  rust --line is ${(rustLine.stats.median - rustHelp.stats.median).toFixed(1)}ms above its own startup (shared git+log work)`);
  console.log(`  node --line is ${(nodeLine.stats.median - nodeHelp.stats.median).toFixed(1)}ms above its own startup`);
  console.log(`  => startupDelta ~= lineDelta means the per-paint win is runtime startup, not the shared git/log work.`);
  console.log(`\nNote: single machine, single session snapshot; absolute ms are not portable. Direction + delta are the durable signal.`);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
}
