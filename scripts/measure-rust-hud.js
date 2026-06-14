#!/usr/bin/env node
"use strict";

// Measurement harness for the Rust HUD renderer: real binary size + startup
// latency for the user-facing --line path.
//
//   node scripts/measure-rust-hud.js [runs]
//
// Requires: cargo build --release --manifest-path rust/Cargo.toml

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const rustBin = path.join(repoRoot, "rust", "target", "release", "codex-hud");
const RUNS = Math.max(3, Number(process.argv[2]) || 15);

if (!fs.existsSync(rustBin)) {
  console.error("release binary missing — run: cargo build --release --manifest-path rust/Cargo.toml");
  process.exit(1);
}

function timeOne(command, args) {
  const start = process.hrtime.bigint();
  const r = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  if (r.status !== 0) {
    console.error(`${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || ""}`);
    process.exit(1);
  }
  return elapsedMs;
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return { median, mean, min: sorted[0], max: sorted[sorted.length - 1] };
}

function measure(label, command, args) {
  timeOne(command, args); // warmup (fs cache, git index)
  const samples = [];
  for (let i = 0; i < RUNS; i++) samples.push(timeOne(command, args));
  const s = stats(samples);
  console.log(
    `  ${label.padEnd(22)} median ${s.median.toFixed(1)}ms  mean ${s.mean.toFixed(1)}ms  ` +
      `min ${s.min.toFixed(1)}ms  max ${s.max.toFixed(1)}ms`
  );
  return s;
}

const rustSize = fs.statSync(rustBin).size;
console.log(`codex-hud measurement (${RUNS} runs each, --line, cwd=${path.basename(repoRoot)})`);
console.log(`\nBinary size:`);
console.log(`  rust release          ${(rustSize / 1024).toFixed(1)} KB (${rustSize} bytes)`);
console.log(`\nStartup + render latency:`);
measure("rust renderer", rustBin, ["--line"]);
