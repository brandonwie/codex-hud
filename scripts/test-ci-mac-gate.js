#!/usr/bin/env node

// Runs scripts/ci-mac-gate.sh with a fake `gh` on PATH, so the verify mode and
// the fork refusal are checked without GitHub and without running any checks.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const gate = path.join(repoRoot, "scripts", "ci-mac-gate.sh");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-mac-gate-test-"));
process.on("exit", () => {
  fs.rmSync(root, { recursive: true, force: true });
});

// The fake gh answers each API read the gate makes from FAKE_* variables and
// records every call. It never calls gh itself.
const bin = path.join(root, "bin");
const calls = path.join(root, "gh-calls");
fs.mkdirSync(bin);
fs.writeFileSync(
  path.join(bin, "gh"),
  `#!/bin/sh
echo "$*" >> "$FAKE_GH_CALLS"
case "$*" in
  *"/statuses"*) printf '%s\\n' "$FAKE_STATUS" ;;
  *"/git/ref/heads/"*) printf '%s\\n' "$FAKE_BASE" ;;
  *"/pulls/"*) printf '%s\\n' "$FAKE_PR" ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 1 ;;
esac
`,
  { mode: 0o755 },
);

const head = "a".repeat(40);
const base = "b".repeat(40);
const movedBase = "c".repeat(40);
const merge = "d".repeat(40);
const repo = "owner/repo";

function runGate(args, fake) {
  fs.rmSync(calls, { force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("sh", [gate, ...args], {
    env: {
      ...env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_CALLS: calls,
      FAKE_PR: `${head} main ${repo} ${repo}`,
      FAKE_BASE: base,
      FAKE_STATUS: "null null",
      ...fake,
    },
    encoding: "utf8",
  });
  const ghCalls = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, ghCalls };
}

const green = `success merge ${merge} base ${base} node 24.11.1 rustc 1.100.0 61s`;

const cases = [
  ["verify passes for a green status on the current base", () => {
    const result = runGate(["verify", "56"], { FAKE_STATUS: green });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /is green on macOS/);
  }],
  ["verify fails when the base moved after a green run", () => {
    const result = runGate(["verify", "56"], { FAKE_STATUS: green, FAKE_BASE: movedBase });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /for another base/);
  }],
  ["verify fails when only a base prefix matches", () => {
    const prefixOnly = `success merge ${merge} base ${base.slice(0, 12)} node 24.11.1 rustc 1.100.0 61s`;
    const result = runGate(["verify", "56"], { FAKE_STATUS: prefixOnly });
    assert.strictEqual(result.status, 1);
  }],
  ["verify fails without a status", () => {
    const result = runGate(["verify", "56"], {});
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /has no macOS status/);
  }],
  ["verify fails for a failure, error or pending status", () => {
    for (const state of ["failure", "error", "pending"]) {
      const result = runGate(["verify", "56"], { FAKE_STATUS: `${state} merge ${merge} base ${base} node 24.11.1 rustc 1.100.0 61s` });
      assert.strictEqual(result.status, 1, state);
      assert.match(result.stderr, new RegExp(`macOS status: ${state}`));
    }
  }],
  ["run refuses a fork PR before it fetches or posts anything", () => {
    const result = runGate(["56"], { FAKE_PR: `${head} main someone/fork ${repo}` });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /comes from someone\/fork/);
    assert.doesNotMatch(result.ghCalls, /statuses/);
  }],
  ["a PR number that is not a number is a usage error", () => {
    const result = runGate(["verify", "abc"], {});
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /usage/);
    assert.strictEqual(result.ghCalls, "");
  }],
];

for (const [name, fn] of cases) {
  fn();
  console.log(`ok - ${name}`);
}
console.log(`ci-mac-gate: ${cases.length} cases passed`);
