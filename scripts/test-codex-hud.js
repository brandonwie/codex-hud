#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hudScript = path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [hudScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
  });
}

const help = run(["--help"]);
assert.strictEqual(help.status, 0, help.stderr);
assert.match(help.stdout, /Usage:/);

const json = run(["--json"]);
assert.strictEqual(json.status, 0, json.stderr);

const parsed = JSON.parse(json.stdout);
assert.strictEqual(parsed.codexHudVersion, "0.2.4");
assert.strictEqual(typeof parsed.cwd, "string");
assert.strictEqual(typeof parsed.config, "object");
assert.strictEqual(typeof parsed.git, "object");
assert.strictEqual(Array.isArray(parsed.config.nativeStatusItems), true);
assert.strictEqual(parsed.config.projectPath, null);
assert.strictEqual(typeof parsed.usage, "object");

const text = run([]);
assert.strictEqual(text.status, 0, text.stderr);
assert.match(text.stdout, /Codex HUD 0\.2\.4/);
assert.match(text.stdout, /Workspace/);
assert.match(text.stdout, /usage: .+ · .+ node v.+ · Ctx: .+ \| 5h: .+ \| 7d: .+ \| Tkn: .+/);

const line = run(["--line"]);
assert.strictEqual(line.status, 0, line.stderr);
assert.match(line.stdout.trim(), /^.+ · .+ node v.+ · Ctx: .+ \| 5h: .+ \| 7d: .+ \| Tkn: .+$/);

const colorLine = run(["--line", "--color"]);
assert.strictEqual(colorLine.status, 0, colorLine.stderr);
assert.match(colorLine.stdout, /\x1b\[38;5;135m/);
assert.match(colorLine.stdout, /\x1b\[38;5;245m/);
assert.match(
  colorLine.stdout.replace(/\x1b\[[0-9;]*m/g, "").trim(),
  /^.+ · .+ node v.+ · Ctx: .+ \| 5h: .+ \| 7d: .+ \| Tkn: .+$/
);

const tmpCodexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-test-"));
try {
  const nowMs = Date.parse("2026-06-08T00:00:00.000Z");
  const sessionDir = path.join(tmpCodexHome, "sessions", "2026", "06", "08");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "rollout-2026-06-08T00-00-00-test.jsonl"),
    JSON.stringify({
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 399000,
            cached_input_tokens: 35100000,
            output_tokens: 583000,
            total_tokens: 982000,
          },
          last_token_usage: {
            input_tokens: 260,
            cached_input_tokens: 0,
            output_tokens: 0,
            total_tokens: 260,
          },
          model_context_window: 1000,
        },
        rate_limits: {
          primary: {
            used_percent: 0,
            window_minutes: 300,
            resets_at: Math.floor((nowMs + 4.4 * 3600000) / 1000),
          },
          secondary: {
            used_percent: 6,
            window_minutes: 10080,
            resets_at: Math.floor((nowMs + 6.4 * 24 * 3600000) / 1000),
          },
        },
      },
    }) + "\n",
    "utf8"
  );

  const fixtureLine = run(["--line"], {
    env: {
      CODEX_HOME: tmpCodexHome,
      CODEX_HUD_NOW_MS: String(nowMs),
    },
  });
  assert.strictEqual(fixtureLine.status, 0, fixtureLine.stderr);
  assert.match(
    fixtureLine.stdout.trim(),
    /node v.+ · Ctx: 26% \| 5h: 0%\(4\.4h,12%\) \| 7d: 6%\(6\.4d,9%\) \| Tkn: 36\.1M \(I: 399k, O: 583k, cache: 35\.1M\)$/
  );
} finally {
  fs.rmSync(tmpCodexHome, { recursive: true, force: true });
}

console.log("codex-hud smoke tests passed");
