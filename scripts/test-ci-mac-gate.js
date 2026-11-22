#!/usr/bin/env node

// Runs scripts/ci-mac-gate.sh with a fake `gh` on PATH, so the verify mode and
// the fork rules are checked without GitHub and without running any checks. The
// gate runs from fixture clones whose origin each test controls.

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
// records every call. It never calls gh itself. It fails any call that does not
// name the trusted host and repository, or that still sees GH_REPO or GH_HOST.
const bin = path.join(root, "bin");
const calls = path.join(root, "gh-calls");
fs.mkdirSync(bin);
fs.writeFileSync(
  path.join(bin, "gh"),
  `#!/bin/sh
echo "$*" >> "$FAKE_GH_CALLS"
if [ -n "\${GH_REPO:-}\${GH_HOST:-}" ]; then echo "fake gh: GH_REPO or GH_HOST reached gh" >&2; exit 1; fi
case "$*" in
  "api --hostname github.com "*"repos/brandonwie/codex-hud/"*) ;;
  *) echo "fake gh: call not bound to github.com brandonwie/codex-hud: $*" >&2; exit 1 ;;
esac
case "$*" in
  *"/statuses"*) printf '%s\\n' "$FAKE_STATUS" ;;
  *"/pulls/"*"/commits"*) printf '%s\\n' "$FAKE_COMMITS" ;;
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
const firstCommit = "f".repeat(40);
const repo = "brandonwie/codex-hud";
const trustedUrl = "https://github.com/brandonwie/codex-hud.git";

// Fixture clones that hold the gate and its helper files, with a chosen origin.
function gateClone(name, origin) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const file of ["ci-mac-gate.sh", "run-with-deadline.js", "ci-mac-gate-maintainers.txt"]) {
    fs.copyFileSync(path.join(repoRoot, "scripts", file), path.join(dir, "scripts", file));
  }
  for (const args of [["init", "-q"], ["remote", "add", "origin", origin]]) {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.strictEqual(result.status, 0, result.stderr);
  }
  return path.join(dir, "scripts", "ci-mac-gate.sh");
}
const trustedGate = gateClone("clone-ssh", "git@github.com:brandonwie/codex-hud.git");
const status = (state, m = merge, b = base, ref = "main") => `${state} merge ${m} base ${b} ref ${ref} node 24.22.3 rustc 1.100.0 61s`;
// PR commit lines as the gate's jq prints them: sha, verified, committer, author.
const commitLines = (...rows) => rows.map((row) => row.join(" ")).join("\n");
const trustedCommits = commitLines([firstCommit, "true", "brandonwie", "brandonwie"], [head, "true", "brandonwie", "brandonwie"]);

function runGate(args, fake, { gatePath = trustedGate, pathPrefix = "" } = {}) {
  fs.rmSync(calls, { force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("sh", [gatePath, ...args], {
    env: {
      ...env,
      // The gate must ignore these: the fake gh fails when it sees them.
      GH_REPO: "someone/codex-hud",
      GH_HOST: "example.com",
      PATH: `${pathPrefix}${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_CALLS: calls,
      FAKE_PR: `${head} main ${repo} ${repo} ${merge} 2 main`,
      FAKE_COMMITS: trustedCommits,
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
// label. Each job is checked on its own: its runs-on value, or for
// `${{ matrix.os }}` its own static matrix os values (flow lists only) and
// include entries; reusable workflows must be pinned to a commit SHA. Keys may
// be plain or quoted. Anything this line reader cannot resolve the way a YAML
// parser would counts as a problem: escaped or explicit keys, flow mappings,
// anchors, aliases and merge keys, a dynamic matrix, a job with no runner, a
// "runs-on" it cannot read as a key, and any "mac" outside a comment.
const ubuntuLabel = /^ubuntu-(latest|\d+\.\d+)$/;
const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");
const keyLine = (key) => new RegExp(`^\\s*(?:-\\s*)?(["']?)${key}\\1\\s*:(?:\\s+(.*))?$`);
const runsOnKey = keyLine("runs-on");
const osKey = keyLine("os");
const usesKey = keyLine("uses");
const matrixKey = keyLine("(?:matrix|include|exclude)");
const jobsKey = /^(["']?)jobs\1\s*:\s*$/;

function runnerProblems(name, text) {
  const problems = [];
  // Drop block-scalar bodies (`key: |` or `key: >` text, such as run scripts):
  // they are strings, not workflow keys. Then drop comments: whole-line ones and
  // " #" tails (YAML needs the space).
  const lines = [];
  let blockIndent = -1;
  for (const raw of text.split("\n")) {
    const indent = raw.match(/^ */)[0].length;
    if (blockIndent >= 0 && (raw.trim() === "" || indent > blockIndent)) {
      lines.push("");
      continue;
    }
    blockIndent = -1;
    const line = raw.replace(/^\s*#.*$/, "").replace(/\s+#.*$/, "");
    if (/:\s*[|>][-+0-9]*\s*$/.test(line)) blockIndent = indent;
    lines.push(line);
  }
  for (const line of lines) {
    const bare = line.replace(/\$\{\{[^}]*\}\}/g, "");
    if (/mac/i.test(line)) problems.push(`${name}: mentions mac: ${line.trim()}`);
    if (/[{}]/.test(bare)) problems.push(`${name}: flow mapping not checked: ${line.trim()}`);
    if (/^\s*(?:-\s*)?"[^"]*\\[^"]*"\s*:/.test(line)) problems.push(`${name}: escaped key: ${line.trim()}`);
    if (/^\s*(?:-\s*)?[?:](\s|$)/.test(line)) problems.push(`${name}: explicit key: ${line.trim()}`);
    if (/runs-on/.test(line) && !runsOnKey.test(line)) problems.push(`${name}: unreadable runs-on: ${line.trim()}`);
    if (/(^|[\s:[,-])[&*][\w-]/.test(bare) || /^\s*(?:-\s*)?<<\s*:/.test(line)) {
      problems.push(`${name}: anchor, alias or merge key not checked: ${line.trim()}`);
    }
    const uses = line.match(usesKey);
    const target = uses ? unquote(uses[2] || "") : "";
    if (target.includes(".github/workflows/") && !/@[0-9a-f]{40}$/.test(target)) {
      problems.push(`${name}: reusable workflow ${target} is not pinned to a commit SHA`);
    }
  }

  // Split the top-level `jobs:` mapping into jobs. Runner keys anywhere else
  // count as problems.
  const jobs = [];
  let inJobs = false;
  let jobIndent = -1;
  let job = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const indent = line.match(/^ */)[0].length;
    if (indent === 0) {
      inJobs = jobsKey.test(line);
      jobIndent = -1;
      job = null;
    } else if (!inJobs || indent < jobIndent) {
      if (runsOnKey.test(line) || osKey.test(line) || matrixKey.test(line)) {
        problems.push(`${name}: runner key outside a job: ${line.trim()}`);
      }
    } else if (jobIndent < 0 || indent === jobIndent) {
      jobIndent = indent;
      job = { name: line.trim().replace(/:.*$/, ""), lines: [] };
      jobs.push(job);
    } else {
      job.lines.push(line);
    }
  }

  for (const { name: jobName, lines: jobLines } of jobs) {
    const where = `${name} job ${jobName}`;
    const runsOn = [];
    const osValues = [];
    let matrix = false;
    let reusable = false;
    for (const line of jobLines) {
      const runsOnLine = line.match(runsOnKey);
      if (runsOnLine) runsOn.push(unquote(runsOnLine[2] || ""));
      const matrixLine = line.match(matrixKey);
      if (matrixLine) {
        matrix = true;
        if ((matrixLine[2] || "").trim()) problems.push(`${where}: dynamic or inline matrix not checked: ${line.trim()}`);
      }
      const os = line.match(osKey);
      if (os) {
        const value = (os[2] || "").trim();
        const list = value.match(/^\[(.*)\]$/);
        if (list) osValues.push(...list[1].split(",").map(unquote));
        else if (value) osValues.push(unquote(value));
        else problems.push(`${where}: matrix os is not a one-line list: ${line.trim()}`);
      }
      const uses = line.match(usesKey);
      if (uses && unquote(uses[2] || "").includes(".github/workflows/")) reusable = true;
    }
    for (const value of osValues) {
      if (!ubuntuLabel.test(value)) problems.push(`${where}: matrix os ${value} is not an allowed Ubuntu label`);
    }
    if (runsOn.length === 0 && !reusable) problems.push(`${where}: no runs-on`);
    if (runsOn.length > 1) problems.push(`${where}: more than one runs-on`);
    for (const value of runsOn) {
      if (value === "${{ matrix.os }}") {
        if (!matrix || osValues.length === 0) problems.push(`${where}: runs-on uses matrix.os without its own static os list`);
      } else if (!ubuntuLabel.test(value)) {
        problems.push(`${where}: runs-on ${value || "(block)"} is not an allowed Ubuntu label`);
      }
    }
  }
  return problems;
}

function fails(result, pattern) {
  assert.strictEqual(result.status, 1, result.stdout + result.stderr);
  if (pattern) assert.match(result.stderr, pattern);
}

// Runs the internal worker directly. A worker that passes every trust check
// stops at its next step without touching GitHub or the network: on macOS the
// run-state directory does not exist, elsewhere the macOS check stops it.
const missingRunDir = path.join(root, "no-run-dir");
let lastRunDir = "";
function runWorker(trust, fake, runDir = missingRunDir, trustBase = "", options = {}) {
  lastRunDir = runDir;
  return runGate(["__worker", runDir, trust, trustBase, "56"], fake, options);
}

function passedTrust(result) {
  fails(result, /cannot write the run state|run this on macOS/);
  assert.doesNotMatch(result.ghCalls, /statuses/);
}

function refusedBeforeCheckout(result, pattern) {
  fails(result, pattern);
  assert.doesNotMatch(result.stderr, /cannot write the run state|run this on macOS/);
  assert.doesNotMatch(result.ghCalls, /statuses/);
  assert.ok(!fs.existsSync(lastRunDir), "the worker wrote run state");
}

// For the fetch tests: a fake uname that reports macOS, and a fake git that
// records each call, fetches from a local fixture instead of GitHub and fails
// every checkout. The fixture holds base, head and a merge of the two. Global
// and system Git config are replaced by fetchConfig, so URL rewrites in the
// machine's own config do not leak into the tests.
const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
function fetchHarness() {
  const fake = path.join(root, "fetch-bin");
  const gitCalls = path.join(root, "git-calls");
  const runDir = path.join(root, "fetch-run");
  fs.rmSync(gitCalls, { force: true });
  fs.mkdirSync(runDir, { recursive: true });
  if (!fs.existsSync(fake)) {
    fs.mkdirSync(fake);
    fs.writeFileSync(path.join(fake, "uname"), `#!/bin/sh\n[ "$1" = -s ] && { echo Darwin; exit 0; }\nexec /usr/bin/uname "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(
      path.join(fake, "git"),
      `#!/bin/sh
echo "$*" >> "$FAKE_GIT_CALLS"
if [ "$1" = -C ] && { [ "$3" = fetch ] || [ "$5" = fetch ]; }; then exec "${realGit}" -C "$2" fetch -q "$FAKE_FETCH_REPO" HEAD; fi
if [ "$1" = -C ] && [ "$3" = checkout ]; then echo "fake git: checkout refused" >&2; exit 1; fi
if [ "$1" = -C ] && [ "$5" = config ] && [ -n "\${FAKE_REDIRECTS:-}" ]; then echo "$FAKE_REDIRECTS"; exit 0; fi
exec "${realGit}" "$@"
`,
      { mode: 0o755 },
    );
  }
  const dir = path.join(root, "fetch-src");
  const git = (...args) => {
    const result = spawnSync(realGit, ["-C", dir, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" },
    });
    assert.strictEqual(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    git("init", "-q");
    const tree = git("hash-object", "-t", "tree", "-w", "/dev/null");
    const b = git("commit-tree", tree, "-m", "base");
    const h = git("commit-tree", tree, "-p", b, "-m", "head");
    const m = git("commit-tree", tree, "-p", b, "-p", h, "-m", "merge");
    git("update-ref", "HEAD", m);
  }
  const merge = git("rev-parse", "HEAD");
  const [base, head] = git("rev-parse", "HEAD^1", "HEAD^2").split("\n");
  const fetchConfig = (text = "") => {
    const file = path.join(root, "fetch-gitconfig");
    fs.writeFileSync(file, text);
    return { GIT_CONFIG_GLOBAL: file, GIT_CONFIG_NOSYSTEM: "1" };
  };
  return { prefix: `${fake}${path.delimiter}`, gitCalls, runDir, fixture: { dir, base, head, merge }, fetchConfig };
}

// Wraps job-level YAML lines (4-space indent) in a workflow with one job.
const inJob = (body) => `jobs:\n  build:\n${body}`;

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
  ["the worker refuses a fork PR before it fetches, writes state or posts anything", () => {
    const result = runWorker("", { FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2 main` });
    refusedBeforeCheckout(result, /comes from someone\/fork.*never runs fork code/);
  }],
  ["the gate has no option to run fork code", () => {
    fails(runGate(["--fork-reviewed", head, "56"], {}), /usage/);
    assert.doesNotMatch(fs.readFileSync(gate, "utf8"), /fork-reviewed/);
    const trusted = runWorker(head, { FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2 main` });
    refusedBeforeCheckout(trusted, /comes from someone\/fork/);
  }],
  ["maintainer-signed commits pass the trust checks", () => {
    const result = runWorker("", {});
    passedTrust(result);
  }],
  ["the same untrusted commit is refused as a fork PR and on a repository branch", () => {
    const imported = commitLines([firstCommit, "true", "brandonwie", "brandonwie"], [head, "true", "someone", "someone"]);
    const asFork = runWorker("", { FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2 main`, FAKE_COMMITS: imported });
    refusedBeforeCheckout(asFork, /comes from someone\/fork/);
    const onBranch = runWorker("", { FAKE_COMMITS: imported });
    refusedBeforeCheckout(onBranch, new RegExp(`outside the maintainer provenance rule[\\s\\S]*${head} \\(verified: true, committer: someone`));
    assert.match(onBranch.stderr, new RegExp(`--trust-head ${head} 56`));
  }],
  ["--trust-head for the exact head lets a reviewed branch PR through", () => {
    const imported = commitLines([firstCommit, "true", "brandonwie", "brandonwie"], [head, "true", "someone", "someone"]);
    const result = runWorker(head, { FAKE_COMMITS: imported });
    passedTrust(result);
    assert.match(result.stdout, /--trust-head .* given/);
    refusedBeforeCheckout(runWorker(otherMerge, { FAKE_COMMITS: imported }), /not the trusted/);
    fails(runGate(["--trust-head", head.slice(0, 12), "56"], {}), /full 40-character/);
  }],
  ["provenance needs a verified signature and a listed committer", () => {
    const rule = [
      [[head, "false", "brandonwie", "brandonwie"], false],
      [[head, "true", "null", "null"], false],
      [[head, "true", "web-flow", "brandonwie"], true],
      [[head, "true", "web-flow", "someone"], false],
      [[head, "false", "web-flow", "brandonwie"], false],
    ];
    for (const [row, ok] of rule) {
      const result = runWorker("", { FAKE_PR: `${head} main ${repo} ${repo} ${merge} 1 main`, FAKE_COMMITS: commitLines(row) });
      if (ok) passedTrust(result);
      else refusedBeforeCheckout(result, /outside the maintainer provenance rule/);
    }
  }],
  ["provenance refuses a commit list that does not match the PR", () => {
    refusedBeforeCheckout(runWorker("", { FAKE_PR: `${head} main ${repo} ${repo} ${merge} 3 main` }), /does not match the PR/);
    const wrongLast = commitLines([head, "true", "brandonwie", "brandonwie"], [firstCommit, "true", "brandonwie", "brandonwie"]);
    refusedBeforeCheckout(runWorker("", { FAKE_COMMITS: wrongLast }), /does not match the PR/);
    refusedBeforeCheckout(runWorker("", { FAKE_PR: `${head} main ${repo} ${repo} ${merge} 251 main` }), /at most 250/);
  }],
  ["a signed PR head over an untrusted target branch is refused without --trust-candidate", () => {
    // Every PR commit passes provenance, but the target branch is not the
    // default branch, so its contents are not vetted.
    const imported = { FAKE_PR: `${head} imported ${repo} ${repo} ${merge} 2 main`, FAKE_OTHER_BASE: otherBase };
    const result = runWorker("", imported);
    refusedBeforeCheckout(result, /targets imported, not the default branch main/);
    assert.match(result.stderr, new RegExp(`--trust-candidate ${head} ${otherBase} 56`));
    // --trust-head covers the PR's commits only, not the target.
    refusedBeforeCheckout(runWorker(head, imported), /targets imported, not the default branch main/);
    // A repository whose default branch is not main: main is untrusted there.
    refusedBeforeCheckout(runWorker("", { FAKE_PR: `${head} main ${repo} ${repo} ${merge} 2 trunk` }), /targets main, not the default branch trunk/);
  }],
  ["--trust-candidate for the exact head and target tip lets a reviewed candidate through", () => {
    const untrustedCommits = commitLines([firstCommit, "true", "brandonwie", "brandonwie"], [head, "true", "someone", "someone"]);
    const imported = { FAKE_PR: `${head} imported ${repo} ${repo} ${merge} 2 main`, FAKE_OTHER_BASE: otherBase };
    const result = runWorker(head, { ...imported, FAKE_COMMITS: untrustedCommits }, missingRunDir, otherBase);
    passedTrust(result);
    assert.match(result.stdout, /--trust-candidate given; running target imported/);
    refusedBeforeCheckout(runWorker(head, imported, missingRunDir, base), new RegExp(`target imported is at ${otherBase}, not the trusted ${base}`));
    refusedBeforeCheckout(runWorker(otherMerge, imported, missingRunDir, otherBase), /not the trusted/);
    const fork = { FAKE_PR: `${head} imported someone/fork ${repo} ${merge} 2 main`, FAKE_OTHER_BASE: otherBase };
    refusedBeforeCheckout(runWorker(head, fork, missingRunDir, otherBase), /comes from someone\/fork/);
    fails(runGate(["--trust-candidate", head, otherBase.slice(0, 12), "56"], {}), /full 40-character/);
    fails(runGate(["--trust-candidate", head, "56"], {}), /usage/);
  }],
  ["the worker refuses when it cannot read the default branch", () => {
    for (const value of ["", " null"]) {
      refusedBeforeCheckout(runWorker("", { FAKE_PR: `${head} main ${repo} ${repo} ${merge} 2${value}` }), /cannot read the default branch/);
    }
  }],
  ["every GitHub call names the trusted host and repository, whatever GH_REPO says", () => {
    const result = runWorker("", {});
    passedTrust(result);
    const lines = result.ghCalls.trim().split("\n");
    assert.ok(lines.length >= 3, result.ghCalls);
    for (const line of lines) assert.match(line, /^api --hostname github\.com .*repos\/brandonwie\/codex-hud\//);
    assert.strictEqual(runGate(["verify", "56"], { FAKE_STATUS: status("success") }).status, 0);
  }],
  ["verified maintainer commits in a different repository are refused", () => {
    const other = { FAKE_PR: `${head} main someone/codex-hud someone/codex-hud ${merge} 2 main` };
    refusedBeforeCheckout(runWorker("", other), /belongs to someone\/codex-hud, not brandonwie\/codex-hud/);
    refusedBeforeCheckout(runWorker(head, other, missingRunDir, base), /belongs to someone\/codex-hud/);
    fails(runGate(["verify", "56"], { ...other, FAKE_STATUS: status("success") }), /belongs to someone\/codex-hud/);
  }],
  ["the worker refuses a clone whose origin is another repository", () => {
    const forkClone = gateClone("clone-fork", "git@github.com:someone/codex-hud.git");
    const result = runWorker("", {}, missingRunDir, "", { gatePath: forkClone });
    refusedBeforeCheckout(result, /origin \(remote\.origin\.url\) is not brandonwie\/codex-hud on github\.com/);
    assert.doesNotMatch(result.stdout + result.stderr, /someone/);
    // A credential in a rejected origin never reaches the output.
    const secret = "SYNTHETIC-ORIGIN-TOKEN-7f3a";
    const tokenClone = gateClone("clone-token", `https://x-access-token:${secret}@github.com/someone/codex-hud.git`);
    const leaked = runWorker("", {}, missingRunDir, "", { gatePath: tokenClone });
    refusedBeforeCheckout(leaked, /origin \(remote\.origin\.url\) is not/);
    assert.ok(!(leaked.stdout + leaked.stderr).includes(secret), "the origin credential reached the output");
    for (const [name, origin] of [["clone-https", trustedUrl], ["clone-https-bare", "https://github.com/brandonwie/codex-hud"]]) {
      passedTrust(runWorker("", {}, missingRunDir, "", { gatePath: gateClone(name, origin) }));
    }
  }],
  ["a stale fetched merge commit is refused before any checkout", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const env = { FAKE_GIT_CALLS: gitCalls, FAKE_FETCH_REPO: fixture.dir, ...fetchConfig() };
    // GitHub's PR still names merge d…d while the fetched ref is a newer merge.
    const stale = runWorker("", env, runDir, "", { pathPrefix: prefix });
    fails(stale, /merge commit is not main \+ PR head yet/);
    const git = fs.readFileSync(gitCalls, "utf8");
    const limit = `-c http\\.${trustedUrl.replace(/\./g, "\\.")}\\.followRedirects=initial`;
    assert.match(git, new RegExp(`${limit} config --get-urlmatch http\\.followRedirects`));
    assert.match(git, new RegExp(`${limit} fetch -q --depth=1 ${trustedUrl.replace(/\./g, "\\.")} refs/pull/56/merge`));
    assert.doesNotMatch(git, /checkout/);
    assert.doesNotMatch(stale.ghCalls, /statuses/);
    // The same fetch with a matching PR passes the checks and only then checks out.
    fs.rmSync(gitCalls, { force: true });
    const matching = runWorker("", {
      ...env,
      FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
      FAKE_BASE: fixture.base,
      FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
    }, runDir, "", { pathPrefix: prefix });
    fails(matching, /checkout failed/);
    assert.match(fs.readFileSync(gitCalls, "utf8"), new RegExp(`checkout -q --detach ${fixture.merge}`));
  }],
  ["an inherited URL rewrite of the trusted fetch URL is refused before any fetch", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    // The clone's origin is the approved SSH URL; the inherited global config
    // rewrites the HTTPS URL the gate fetches from.
    // The rewrite target carries a synthetic credential that must never reach
    // the output; the refusal names only the trusted URL and the rule's source.
    const secret = "SYNTHETIC-REWRITE-TOKEN-91c2";
    const env = {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      ...fetchConfig(`[url "https://user:${secret}@evil.example/"]\n\tinsteadOf = https://github.com/\n`),
    };
    const result = runWorker("", env, runDir, "", { pathPrefix: prefix });
    fails(result, /rewrites https:\/\/github\.com\/brandonwie\/codex-hud\.git with a url\.<base>\.insteadOf rule \(defined in: file:.*fetch-gitconfig/);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(secret), "the rewrite credential reached the output");
    assert.doesNotMatch(output, /evil\.example/);
    const git = fs.readFileSync(gitCalls, "utf8");
    assert.match(git, /ls-remote --get-url/);
    assert.doesNotMatch(git, /fetch|checkout/);
    assert.doesNotMatch(result.ghCalls, /statuses/);
  }],
  ["a URL-specific redirect setting cannot widen the fetch's redirect limit", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const conflicting = fetchConfig(`[http "${trustedUrl}"]\n\tfollowRedirects = true\n`);
    // Git prefers the URL-specific true over a generic command-line limit, and
    // the exact-URL limit the gate sets over the inherited one.
    const urlmatch = (...extra) =>
      spawnSync(realGit, ["-C", fixture.dir, ...extra, "config", "--get-urlmatch", "http.followRedirects", trustedUrl], {
        encoding: "utf8",
        env: { ...process.env, ...conflicting },
      }).stdout.trim();
    assert.strictEqual(urlmatch("-c", "http.followRedirects=initial"), "true");
    assert.strictEqual(urlmatch("-c", `http.${trustedUrl}.followRedirects=initial`), "initial");
    // With that inherited setting the gate's effective limit is initial: it
    // fetches and reaches the stale-merge check.
    const env = { FAKE_GIT_CALLS: gitCalls, FAKE_FETCH_REPO: fixture.dir, ...conflicting };
    fails(runWorker("", env, runDir, "", { pathPrefix: prefix }), /merge commit is not main \+ PR head yet/);
    // If Git still resolved another value, the gate refuses before fetching.
    fs.rmSync(gitCalls, { force: true });
    const widened = runWorker("", { ...env, FAKE_REDIRECTS: "true" }, runDir, "", { pathPrefix: prefix });
    fails(widened, /effective http\.followRedirects for https:\/\/github\.com\/brandonwie\/codex-hud\.git is not 'initial'/);
    assert.doesNotMatch(fs.readFileSync(gitCalls, "utf8"), /fetch|checkout/);
    assert.doesNotMatch(widened.ghCalls, /statuses/);
  }],
  ["an inherited run directory cannot skip the deadline", () => {
    // The public command always takes the bounded path: on macOS it announces
    // the deadline and starts the worker under it; elsewhere it stops first.
    assert.doesNotMatch(fs.readFileSync(gate, "utf8"), /CI_MAC_GATE_RUN_DIR/);
    const runDir = fs.mkdtempSync(path.join(root, "inherited-"));
    const result = runGate(["56"], {
      CI_MAC_GATE_RUN_DIR: runDir,
      FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2`,
    });
    fails(result);
    if (process.platform === "darwin") {
      assert.match(result.stdout, /under a 360-minute deadline/);
      assert.match(result.stderr, /comes from someone\/fork/);
    } else {
      assert.match(result.stderr, /run this on macOS/);
    }
    assert.deepStrictEqual(fs.readdirSync(runDir), []);
    fails(runGate(["__worker", runDir, "56"], {}), /usage/);
    fails(runGate(["__worker", runDir, "", "56"], {}), /usage/);
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
      "double-quoted runs-on key": '    "runs-on": macos-latest\n',
      "single-quoted runs-on key": "    'runs-on': macos-latest\n",
      "quoted key, indirect value": '    "runs-on": ${{ vars.RUNNER }}\n',
      "escaped key": '    "runs\\u002don": ubuntu-latest\n    other: x\n',
      "flow mapping": "    steps: {runs-on: ubuntu-latest}\n",
      "explicit key": "    ? runs-on\n    : ubuntu-latest\n",
      "quoted os key": '        "os": [ubuntu-latest, windows-latest]\n',
      "anchor value": "    runs-on: &r ubuntu-latest\n",
      "quoted reusable key": "    'uses': someone/repo/.github/workflows/x.yml@v1\n",
      "alias runs-on": "    runs-on: *runner\n",
      "merge key": "    <<: *defaults\n",
      "no runs-on": "    steps:\n      - run: true\n",
      "dynamic matrix": "    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix: ${{ fromJSON(vars.MATRIX) }}\n",
      "dynamic include": "    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest]\n        include: ${{ fromJSON(vars.EXTRA) }}\n",
    };
    // Quoted keys with allowed values are fine: the reader normalizes them.
    assert.deepStrictEqual(runnerProblems("quoted ok", inJob('    "runs-on": "ubuntu-latest"\n')), []);
    for (const [name, text] of Object.entries(bad)) {
      assert.notDeepStrictEqual(runnerProblems(name, inJob(text)), [], name);
    }
    const round3 = spawnSync("git", ["show", "b9396f31568f6b9ad0c025f56668c1d7d64c0fe6:.github/workflows/ci.yml"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (round3.status === 0) assert.notDeepStrictEqual(runnerProblems("round 3 ci.yml", round3.stdout), []);
  }],
  ["the runner check resolves matrix.os within each job", () => {
    const staticJob = "  test:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        os: [ubuntu-latest]\n";
    assert.deepStrictEqual(runnerProblems("one job", `jobs:\n${staticJob}`), []);
    // A second job takes its matrix from a repository variable: the first
    // job's static os list must not cover it.
    const dynamicJob = "  other:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix: ${{ fromJSON(vars.MATRIX) }}\n";
    const dynamic = runnerProblems("two jobs", `jobs:\n${staticJob}${dynamicJob}`);
    assert.ok(dynamic.some((problem) => /job other: dynamic or inline matrix/.test(problem)), dynamic.join("\n"));
    assert.ok(dynamic.some((problem) => /job other: runs-on uses matrix.os without its own static os list/.test(problem)), dynamic.join("\n"));
    assert.ok(!dynamic.some((problem) => /job test:/.test(problem)), dynamic.join("\n"));
    // A second job with a static matrix but no os list of its own.
    const noOs = "  other:\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        node: [24]\n";
    assert.notDeepStrictEqual(runnerProblems("borrowed os", `jobs:\n${staticJob}${noOs}`), []);
    // A runner key outside the jobs mapping.
    assert.notDeepStrictEqual(runnerProblems("top level", "on: push\nenv:\n  os: [ubuntu-latest]\n"), []);
  }],
  ["the gate's deadline is no wider than the old hosted job's 360 minutes", () => {
    const script = fs.readFileSync(gate, "utf8");
    const match = script.match(/^deadline_seconds=(\d+)$/m);
    assert.ok(match, "no deadline_seconds in the gate");
    assert.ok(Number(match[1]) > 0 && Number(match[1]) <= 360 * 60, `deadline ${match[1]}s`);
    // One deadline around the whole run: the gate restarts itself under it
    // before its first GitHub read.
    const wrap = script.indexOf(
      'node scripts/run-with-deadline.js "$deadline_seconds" sh "$self" __worker "$run_dir" "$trust_head" "$trust_base" "$pr"',
    );
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
