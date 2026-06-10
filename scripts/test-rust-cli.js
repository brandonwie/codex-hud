#!/usr/bin/env node
"use strict";

// Rust CLI-path integration harness: exercises the user-facing flag surface
// (--help, --init-config, malformed TOML warnings, --watch) directly against
// the built binary — paths the golden parity harnesses never touch.
//
//   node scripts/test-rust-cli.js [path-to-binary]
//
// Binary resolution: argv[2] > $CODEX_HUD_RUST_BIN > rust/target/release > debug.
// Every invocation pins CODEX_HOME to a throwaway fixture dir so the binary can
// never read — or, via --init-config --force, overwrite — the developer's real
// ~/.codex/codex-hud.toml.

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

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

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-rust-cli-"));
}

const binary = resolveBinary();

// Isolated CODEX_HOME with no sessions/config so CLI behavior is deterministic.
const home = tmpdir();
const cleanups = [home];

function run(args, envOverrides, opts) {
  const options = opts || {};
  return spawnSync(binary, args, {
    encoding: "utf8",
    // Hard default timeout so a hanging regression (e.g. --line entering the
    // watch loop) fails the suite instead of stalling it — and CI — forever.
    timeout: options.timeout === undefined ? 30000 : options.timeout,
    killSignal: options.killSignal,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CODEX_HOME: home,
      CODEX_HUD_NOW_MS: String(FIXED),
      ...(envOverrides || {}),
    },
  });
}

try {
  // 1. --help exits 0 and self-reports the version on the first stdout line —
  //    the parse contract doctor's verifyRustRenderer relies on.
  {
    const result = run(["--help"]);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout.split("\n")[0], /^codex-hud \d+\.\d+\.\d+/);
  }

  // 2. --init-config scaffolds, refuses overwrite, then --force overwrites
  //    (mirrors scripts/test-codex-hud-config.js block 10 against the binary;
  //    stderr asserted by regex — rust formats the path via .display()).
  {
    const initHome = tmpdir();
    cleanups.push(initHome);
    const target = path.join(initHome, "codex-hud.toml");

    const first = run(["--init-config"], { CODEX_HOME: initHome });
    assert.strictEqual(first.status, 0, first.stderr);
    assert.ok(fs.existsSync(target), "scaffold should be created");
    assert.match(fs.readFileSync(target, "utf8"), /\[thresholds\.percent\]/);

    const second = run(["--init-config"], { CODEX_HOME: initHome });
    assert.notStrictEqual(second.status, 0, "must refuse overwrite without --force");
    assert.match(second.stderr, /already exists/);

    fs.writeFileSync(target, "tampered", "utf8");
    const forced = run(["--init-config", "--force"], { CODEX_HOME: initHome });
    assert.strictEqual(forced.status, 0, forced.stderr);
    assert.notStrictEqual(fs.readFileSync(target, "utf8"), "tampered", "--force should overwrite");
  }

  // 3. Malformed TOML: --line exits 0, still renders, and emits exactly one
  //    stderr warning line (mirrors config-test block 6); --json keeps stderr
  //    clean — warnings ride inside the JSON, matching the node oracle's
  //    text/line-only emission.
  {
    const dir = tmpdir();
    cleanups.push(dir);
    const cfg = path.join(dir, "bad.toml");
    fs.writeFileSync(cfg, "segments = [unclosed\n", "utf8");

    const line = run(["--line"], { CODEX_HUD_CONFIG: cfg });
    assert.strictEqual(line.status, 0, "malformed config must not crash the status line");
    assert.ok(line.stdout.trim().length > 0, "should still render a footer");
    assert.match(line.stderr, /codex-hud:/);
    assert.strictEqual(line.stderr.trim().split("\n").length, 1, "config warning must be a single stderr line");

    const json = run(["--json"], { CODEX_HUD_CONFIG: cfg });
    assert.strictEqual(json.status, 0, json.stderr);
    assert.strictEqual(json.stderr, "", "--json must not emit config warnings on stderr");
    const warnings = JSON.parse(json.stdout).hud.warnings;
    assert.ok(Array.isArray(warnings) && warnings.length > 0, "--json must carry config warnings inside the JSON");
    assert.match(warnings.join("\n"), /TOML parse error/, "the parse warning must ride inside hud.warnings");
  }

  // 4. --watch loops forever by design — only ever run it under a hard
  //    timeout + SIGKILL, then assert it was killed (never exited cleanly).
  {
    const watch = run(["--watch", "1"], null, { timeout: 8000, killSignal: "SIGKILL" });
    assert.ok(watch.signal, "watch must be killed by the harness, never exit");
    assert.ok(watch.stdout.includes("\x1Bc"), "watch should reset the screen each refresh");
    assert.match(watch.stdout, /Refreshing every 1s\. Press Ctrl\+C to stop\./);

    const clamped = run(["--watch", "0"], null, { timeout: 3000, killSignal: "SIGKILL" });
    assert.ok(clamped.signal, "watch must be killed by the harness, never exit");
    assert.match(clamped.stdout, /Refreshing every 5s/);
  }
} finally {
  for (const dir of cleanups) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("rust cli tests passed");
