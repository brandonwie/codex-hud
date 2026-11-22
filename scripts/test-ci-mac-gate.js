#!/usr/bin/env node

// Runs scripts/ci-mac-gate.sh with a fake `gh` on PATH, so the verify mode and
// the fork rules are checked without GitHub and without running any checks.

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
  *"/git/ref/heads/main "*) printf '%s\\n' "$FAKE_BASE" ;;
  *"/git/ref/heads/"*) printf '%s\\n' "$FAKE_OTHER_BASE" ;;
  *"/pulls/"*) printf '%s\\n' "$FAKE_PR" ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 1 ;;
esac
`,
  { mode: 0o755 },
);

const head = "a".repeat(40);
const base = "b".repeat(40);
const otherBase = "c".repeat(40);
const merge = "d".repeat(40);
const otherMerge = "e".repeat(40);
const repo = "owner/repo";
const status = (state, m = merge, b = base) => `${state} merge ${m} base ${b} node 24.22.3 rustc 1.100.0 61s`;

function runGate(args, fake) {
  fs.rmSync(calls, { force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("sh", [gate, ...args], {
    env: {
      ...env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_CALLS: calls,
      FAKE_PR: `${head} main ${repo} ${repo} ${merge}`,
      FAKE_BASE: base,
      FAKE_OTHER_BASE: otherBase,
      FAKE_STATUS: "null null",
      ...fake,
    },
    encoding: "utf8",
  });
  const ghCalls = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, ghCalls };
}

function fails(result, pattern) {
  assert.strictEqual(result.status, 1, result.stdout + result.stderr);
  if (pattern) assert.match(result.stderr, pattern);
}

const cases = [
  ["verify passes for a green status on the current merge candidate", () => {
    const result = runGate(["verify", "56"], { FAKE_STATUS: status("success") });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /is green on macOS/);
  }],
  ["verify fails when the base moved after a green run", () => {
    fails(runGate(["verify", "56"], { FAKE_STATUS: status("success"), FAKE_BASE: otherBase }), /another merge candidate/);
  }],
  ["verify fails for a green status on another merge commit with the same base", () => {
    fails(runGate(["verify", "56"], { FAKE_STATUS: status("success", otherMerge) }), /another merge candidate/);
  }],
  ["verify fails after a retarget that leaves the head and the old base tip unchanged", () => {
    fails(
      runGate(["verify", "56"], {
        FAKE_STATUS: status("success"),
        FAKE_PR: `${head} dev ${repo} ${repo} ${otherMerge}`,
      }),
      /another merge candidate/,
    );
  }],
  ["verify fails when only SHA prefixes match", () => {
    const prefixes = `success merge ${merge.slice(0, 12)} base ${base.slice(0, 12)} node 24.22.3 rustc 1.100.0 61s`;
    fails(runGate(["verify", "56"], { FAKE_STATUS: prefixes }));
  }],
  ["verify fails without a status", () => {
    fails(runGate(["verify", "56"], {}), /has no macOS status/);
  }],
  ["verify fails for a failure, error or pending status", () => {
    for (const state of ["failure", "error", "pending"]) {
      fails(runGate(["verify", "56"], { FAKE_STATUS: status(state) }), new RegExp(`macOS status: ${state}`));
    }
  }],
  ["verify fails when GitHub has no merge commit for the PR", () => {
    fails(runGate(["verify", "56"], { FAKE_PR: `${head} main ${repo} ${repo} null` }), /no merge commit/);
  }],
  ["verify treats a fork PR like any PR: only the gate status counts", () => {
    const fork = { FAKE_PR: `${head} main someone/fork ${repo} ${merge}` };
    const green = runGate(["verify", "56"], { ...fork, FAKE_STATUS: status("success") });
    assert.strictEqual(green.status, 0, green.stderr);
    fails(runGate(["verify", "56"], fork), /has no macOS status/);
    assert.doesNotMatch(green.ghCalls, /check-runs/);
  }],
  ["run refuses a fork PR without a reviewed head, before it fetches or posts anything", () => {
    const result = runGate(["56"], { FAKE_PR: `${head} main someone/fork ${repo} ${merge}` });
    fails(result, new RegExp(`comes from someone/fork.*--fork-reviewed ${head} 56`));
    assert.doesNotMatch(result.ghCalls, /statuses/);
  }],
  ["run refuses when the reviewed head is not the PR head", () => {
    const result = runGate(["--fork-reviewed", otherMerge, "56"], { FAKE_PR: `${head} main someone/fork ${repo} ${merge}` });
    fails(result, /not the reviewed/);
    assert.doesNotMatch(result.ghCalls, /statuses/);
  }],
  ["--fork-reviewed needs a full SHA and a PR number", () => {
    for (const args of [["--fork-reviewed", head.slice(0, 12), "56"], ["--fork-reviewed", "XYZ".repeat(13) + "x", "56"], ["--fork-reviewed", head]]) {
      const result = runGate(args, {});
      fails(result);
      assert.strictEqual(result.ghCalls, "", args.join(" "));
    }
  }],
  ["a PR number that is not a number is a usage error", () => {
    const result = runGate(["verify", "abc"], {});
    fails(result, /usage/);
    assert.strictEqual(result.ghCalls, "");
  }],
  ["no workflow can start a GitHub-hosted macOS runner", () => {
    const dir = path.join(repoRoot, ".github", "workflows");
    for (const file of fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      assert.doesNotMatch(text, /macos-[a-z0-9]/i, `${file} names a macOS runner`);
      for (const line of text.split("\n").filter((l) => /^\s*(runs-on|os):/.test(l))) {
        assert.doesNotMatch(line, /mac/i, `${file}: ${line.trim()}`);
      }
    }
    assert.match(fs.readFileSync(gate, "utf8"), /^context="ci-local \/ macOS"$/m);
  }],
];

for (const [name, fn] of cases) {
  fn();
  console.log(`ok - ${name}`);
}
console.log(`ci-mac-gate: ${cases.length} cases passed`);
