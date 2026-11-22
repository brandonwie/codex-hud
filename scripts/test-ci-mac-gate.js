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
const deadlineRunner = path.join(repoRoot, "scripts", "run-with-deadline.js");
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
const status = (state, m = merge, b = base, ref = "main") => `${state} merge ${m} base ${b} ref ${ref} node 24.22.3 rustc 1.100.0 61s`;

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

// Lists every way a workflow could pick a runner that is not an allowed Ubuntu
// label: runs-on values, matrix os values (flow lists only) and include entries,
// and reusable workflows that are not pinned to a commit SHA. Any selector this
// simple reader cannot resolve counts as a problem.
const ubuntuLabel = /^ubuntu-(latest|\d+\.\d+)$/;
const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");

function runnerProblems(name, text) {
  const problems = [];
  const lines = text.split("\n");
  const osValues = [];
  let osLines = 0;
  for (const line of lines) {
    const os = line.match(/^\s*(?:-\s*)?os:\s*(.*)$/);
    if (!os) continue;
    osLines++;
    const list = os[1].trim().match(/^\[(.*)\]$/);
    if (list) osValues.push(...list[1].split(",").map(unquote));
    else if (os[1].trim()) osValues.push(unquote(os[1]));
    else problems.push(`${name}: matrix os is not a one-line list: ${line.trim()}`);
  }
  for (const value of osValues) {
    if (!ubuntuLabel.test(value)) problems.push(`${name}: matrix os ${value} is not an allowed Ubuntu label`);
  }
  for (const line of lines) {
    const runsOn = line.match(/^\s*runs-on:\s*(.*)$/);
    if (runsOn) {
      const value = unquote(runsOn[1]);
      if (value === "${{ matrix.os }}") {
        if (!osLines) problems.push(`${name}: runs-on uses matrix.os without a matrix os list`);
      } else if (!ubuntuLabel.test(value)) {
        problems.push(`${name}: runs-on ${value || "(block)"} is not an allowed Ubuntu label`);
      }
    }
    const uses = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (uses && uses[1].includes(".github/workflows/") && !/@[0-9a-f]{40}$/.test(uses[1])) {
      problems.push(`${name}: reusable workflow ${uses[1]} is not pinned to a commit SHA`);
    }
  }
  return problems;
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
  ["verify fails after a retarget to a branch with the same tip and merge commit", () => {
    fails(
      runGate(["verify", "56"], {
        FAKE_STATUS: status("success"),
        FAKE_PR: `${head} dev ${repo} ${repo} ${merge}`,
        FAKE_OTHER_BASE: base,
      }),
      /another merge candidate/,
    );
  }],
  ["verify fails when the recorded base branch only starts with the current one", () => {
    fails(runGate(["verify", "56"], { FAKE_STATUS: status("success", merge, base, "main2") }), /another merge candidate/);
  }],
  ["verify accepts the bare record when the extras did not fit", () => {
    const result = runGate(["verify", "56"], { FAKE_STATUS: `success merge ${merge} base ${base} ref main` });
    assert.strictEqual(result.status, 0, result.stderr);
  }],
  ["verify fails when only SHA prefixes match", () => {
    const prefixes = `success merge ${merge.slice(0, 12)} base ${base.slice(0, 12)} ref main node 24.22.3 rustc 1.100.0 61s`;
    fails(runGate(["verify", "56"], { FAKE_STATUS: prefixes }));
  }],
  ["verify fails for a status without the base branch (round 3 format)", () => {
    fails(runGate(["verify", "56"], { FAKE_STATUS: `success merge ${merge} base ${base} node 24.22.3 rustc 1.100.0 61s` }));
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
  ["verify fails for a fork PR even with a green status: its macOS leg stays unchecked", () => {
    const fork = { FAKE_PR: `${head} main someone/fork ${repo} ${merge}` };
    fails(runGate(["verify", "56"], { ...fork, FAKE_STATUS: status("success") }), /never runs fork code.*recreate the change/);
  }],
  ["run refuses a fork PR before it fetches, writes state or posts anything", () => {
    // The inner run (normally started under the deadline) holds the fork check.
    const runDir = fs.mkdtempSync(path.join(root, "run-"));
    const result = runGate(["56"], { FAKE_PR: `${head} main someone/fork ${repo} ${merge}`, CI_MAC_GATE_RUN_DIR: runDir });
    fails(result, /comes from someone\/fork.*never runs fork code/);
    assert.doesNotMatch(result.ghCalls, /statuses/);
    assert.deepStrictEqual(fs.readdirSync(runDir), []);
  }],
  ["the gate has no option to run fork code", () => {
    fails(runGate(["--fork-reviewed", head, "56"], {}), /usage/);
    assert.doesNotMatch(fs.readFileSync(gate, "utf8"), /fork-reviewed/);
  }],
  ["verify matches a long base branch by its fixed-length ID", () => {
    const longRef = `release/${"x".repeat(60)}`;
    const otherLongRef = `release/${"y".repeat(60)}`;
    const refId = (name) =>
      spawnSync("git", ["hash-object", "--stdin"], { input: name, encoding: "utf8" }).stdout.trim().slice(0, 24);
    const record = `success merge ${merge} base ${base} refid ${refId(longRef)}`;
    const pr = (ref) => ({ FAKE_PR: `${head} ${ref} ${repo} ${repo} ${merge}`, FAKE_OTHER_BASE: base });
    const green = runGate(["verify", "56"], { ...pr(longRef), FAKE_STATUS: record });
    assert.strictEqual(green.status, 0, green.stderr);
    fails(runGate(["verify", "56"], { ...pr(otherLongRef), FAKE_STATUS: record }), /another merge candidate/);
    assert.ok(record.length - "success ".length <= 140);
  }],
  ["a PR number that is not a number is a usage error", () => {
    const result = runGate(["verify", "abc"], {});
    fails(result, /usage/);
    assert.strictEqual(result.ghCalls, "");
  }],
  ["every workflow runner selector resolves to an allowed Ubuntu label", () => {
    const dir = path.join(repoRoot, ".github", "workflows");
    for (const file of fs.readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
      assert.deepStrictEqual(runnerProblems(file, fs.readFileSync(path.join(dir, file), "utf8")), []);
    }
    assert.match(fs.readFileSync(gate, "utf8"), /^context="ci-local \/ macOS"$/m);
  }],
  ["the runner check rejects macOS, indirect and unpinned selectors", () => {
    const bad = {
      "literal macOS": "    runs-on: macos-latest\n",
      "Apple Silicon label": "    runs-on: macos-15-xlarge\n",
      "matrix with macOS": "    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n",
      "matrix include": "    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest]\n        include:\n          - os: macos-14\n",
      "block matrix list": "    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os:\n          - ubuntu-latest\n",
      "repository variable": "    runs-on: ${{ vars.RUNNER }}\n",
      "label list": "    runs-on: [self-hosted, macOS]\n",
      "block runs-on": "    runs-on:\n      - ubuntu-latest\n",
      "group runner": "    runs-on:\n      group: mac-runners\n",
      "unpinned reusable workflow": "    uses: someone/repo/.github/workflows/x.yml@main\n",
    };
    for (const [name, text] of Object.entries(bad)) {
      assert.notDeepStrictEqual(runnerProblems(name, text), [], name);
    }
    const round3 = spawnSync("git", ["show", "b9396f31568f6b9ad0c025f56668c1d7d64c0fe6:.github/workflows/ci.yml"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (round3.status === 0) assert.notDeepStrictEqual(runnerProblems("round 3 ci.yml", round3.stdout), []);
  }],
  ["the gate's deadline is no wider than the old hosted job's 360 minutes", () => {
    const script = fs.readFileSync(gate, "utf8");
    const match = script.match(/^deadline_seconds=(\d+)$/m);
    assert.ok(match, "no deadline_seconds in the gate");
    assert.ok(Number(match[1]) > 0 && Number(match[1]) <= 360 * 60, `deadline ${match[1]}s`);
    // One deadline around the whole run: the gate restarts itself under it
    // before its first GitHub read.
    const wrap = script.indexOf('node scripts/run-with-deadline.js "$deadline_seconds" sh "$self" "$pr"');
    assert.ok(wrap > 0, "the run is not wrapped in the deadline");
    assert.ok(wrap < script.indexOf("read_candidate || die"), "the deadline starts after the first GitHub read");
    assert.ok(wrap < script.indexOf("git init -q"), "the deadline starts after the checkout");
  }],
  ["run-with-deadline passes the command's exit code through", () => {
    const result = spawnSync(process.execPath, [deadlineRunner, "5", "sh", "-c", "exit 3"], { encoding: "utf8" });
    assert.strictEqual(result.status, 3, result.stderr);
  }],
  ["run-with-deadline stops the whole process group at the deadline and exits 124", () => {
    const pids = path.join(root, "deadline-pids");
    const started = Date.now();
    const result = spawnSync(
      process.execPath,
      [deadlineRunner, "1", "sh", "-c", 'sleep 30 & echo "$$ $!" > "$1"; wait', "_", pids],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.strictEqual(result.status, 124, result.stderr);
    assert.ok(Date.now() - started < 15_000, "the runner did not stop at its deadline");
    assert.match(result.stderr, /passed its 1s deadline/);
    // An orphaned child can stay a zombie for a moment until init reaps it.
    const running = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (const pid of fs.readFileSync(pids, "utf8").trim().split(" ").map(Number)) {
      for (let i = 0; i < 30 && running(pid); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      assert.ok(!running(pid), `process ${pid} is still running`);
    }
  }],
  ["run-with-deadline rejects a missing or bad deadline", () => {
    for (const args of [[], ["0", "true"], ["1.5", "true"], ["x", "true"], ["5"]]) {
      const result = spawnSync(process.execPath, [deadlineRunner, ...args], { encoding: "utf8" });
      assert.strictEqual(result.status, 2, args.join(" "));
    }
  }],
];

for (const [name, fn] of cases) {
  fn();
  console.log(`ok - ${name}`);
}
console.log(`ci-mac-gate: ${cases.length} cases passed`);
