#!/usr/bin/env node
"use strict";

// Rust-port golden parity harness: drives the SAME fixture set as
// scripts/test-golden.js through the Rust binary's hidden --render-json mode
// and byte-compares against scripts/golden/hud-output.golden.
//
//   node scripts/test-rust-golden.js [path-to-binary]
//
// Binary resolution: argv[2] > $CODEX_HUD_RUST_BIN > rust/target/release > debug.
// Time is pinned via CODEX_HUD_NOW_MS (the Rust binary's test hook), mirroring
// the frozen Date in test-golden.js.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { LINE_CASES, TEXT_CASES, makeData, esc, splitBlocks, GOLDEN } = require("./test-golden.js");

const FIXED = Date.UTC(2026, 0, 1, 0, 0, 0); // matches test-golden.js

function resolveBinary() {
  const candidates = [
    process.argv[2],
    process.env.CODEX_HUD_RUST_BIN,
    path.join(__dirname, "..", "rust", "target", "release", "codex-hud-rs"),
    path.join(__dirname, "..", "rust", "target", "debug", "codex-hud-rs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error("rust binary not found — run: cargo build --manifest-path rust/Cargo.toml");
  process.exit(1);
}

function build(binary) {
  const requests = [];
  for (const c of LINE_CASES) {
    for (const color of [false, true]) {
      requests.push({ name: `line | ${c.name} | color=${color}`, mode: "line", color, data: makeData(c.over) });
    }
  }
  for (const c of TEXT_CASES) {
    requests.push({ name: `text | ${c.name}`, mode: "text", color: false, data: makeData(c.over) });
  }

  const input =
    requests.map((r) => JSON.stringify({ mode: r.mode, color: r.color, data: r.data })).join("\n") + "\n";
  const r = spawnSync(binary, ["--render-json"], {
    input,
    encoding: "utf8",
    env: { ...process.env, CODEX_HUD_NOW_MS: String(FIXED) },
  });
  if (r.status !== 0) {
    console.error("--render-json failed: " + (r.stderr || ""));
    process.exit(1);
  }
  const outputs = r.stdout.trim().split("\n").map((line) => JSON.parse(line));
  if (outputs.length !== requests.length) {
    console.error(`expected ${requests.length} outputs, got ${outputs.length}`);
    process.exit(1);
  }
  return requests.map((req, i) => `### ${req.name}\n${esc(outputs[i])}`).join("\n\n") + "\n";
}

function main() {
  const binary = resolveBinary();
  const built = build(binary);
  if (!fs.existsSync(GOLDEN)) {
    console.error("golden file missing — run: node scripts/test-golden.js --update");
    process.exit(1);
  }
  const expected = fs.readFileSync(GOLDEN, "utf8");
  const count = splitBlocks(built).length;
  if (expected === built) {
    console.log(`rust golden parity OK (${count} blocks, ${path.relative(process.cwd(), binary)})`);
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
  console.error(`RUST GOLDEN MISMATCH at block ${at} (of ${Math.max(a.length, b.length)})`);
  console.error("--- expected (node oracle) ---\n" + (a[at] || "(missing)"));
  console.error("--- actual (rust) ---\n" + (b[at] || "(missing)"));
  process.exit(1);
}

main();
