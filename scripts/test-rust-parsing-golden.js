#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const candidates = [
  process.argv[2],
  process.env.CODEX_HUD_RUST_BIN,
  path.join(__dirname, "..", "rust", "target", "release", "codex-hud"),
  path.join(__dirname, "..", "rust", "target", "debug", "codex-hud"),
].filter(Boolean);

const binary = candidates.find((candidate) => fs.existsSync(candidate));
if (!binary) {
  console.error("rust binary not found - run: cargo build --manifest-path rust/Cargo.toml");
  process.exit(1);
}

const args = [path.join(__dirname, "test-parsing-golden.js"), ...process.argv.slice(3)];
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, CODEX_HUD_RUST_BIN: path.resolve(binary) },
});

process.exit(result.status === null ? 1 : result.status);
