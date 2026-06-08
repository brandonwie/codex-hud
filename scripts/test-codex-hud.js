#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hudScript = path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js");

function run(args) {
  return spawnSync(process.execPath, [hudScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

const help = run(["--help"]);
assert.strictEqual(help.status, 0, help.stderr);
assert.match(help.stdout, /Usage:/);

const json = run(["--json"]);
assert.strictEqual(json.status, 0, json.stderr);

const parsed = JSON.parse(json.stdout);
assert.strictEqual(parsed.codexHudVersion, "0.2.3");
assert.strictEqual(typeof parsed.cwd, "string");
assert.strictEqual(typeof parsed.config, "object");
assert.strictEqual(typeof parsed.git, "object");
assert.strictEqual(Array.isArray(parsed.config.nativeStatusItems), true);
assert.strictEqual(parsed.config.projectPath, null);
assert.strictEqual(typeof parsed.usage, "object");

const text = run([]);
assert.strictEqual(text.status, 0, text.stderr);
assert.match(text.stdout, /Codex HUD 0\.2\.3/);
assert.match(text.stdout, /Workspace/);
assert.match(text.stdout, /usage: .+ · .+ · CTX:.+ \| 5H:.+ \| 7D:.+/);

const line = run(["--line"]);
assert.strictEqual(line.status, 0, line.stderr);
assert.match(line.stdout.trim(), /^.+ · .+ · CTX:.+ \| 5H:.+ \| 7D:.+$/);

const colorLine = run(["--line", "--color"]);
assert.strictEqual(colorLine.status, 0, colorLine.stderr);
assert.match(colorLine.stdout, /\x1b\[38;5;135m/);
assert.match(colorLine.stdout, /\x1b\[38;5;245m/);
assert.match(
  colorLine.stdout.replace(/\x1b\[[0-9;]*m/g, "").trim(),
  /^.+ · .+ · CTX:.+ \| 5H:.+ \| 7D:.+$/
);

console.log("codex-hud smoke tests passed");
