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
env | sed -n 's/^\\([A-Za-z_]*[Pp][Rr][Oo][Xx][Yy][A-Za-z0-9_]*\\)=.*/proxy-env \\1/p' >> "$FAKE_GH_CALLS"
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

// Every git command here and every gate run uses an empty global Git config
// and no system config, so the maintainer's Git config (a conditional include,
// a URL rewrite holding a token) can neither change the tests nor reach their
// output. Fixture git failures report the command and exit code, never stderr.
const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
const isolatedGitConfig = path.join(root, "isolated.gitconfig");
fs.writeFileSync(isolatedGitConfig, "");
// Attributes too: an empty XDG_CONFIG_HOME (no default git/attributes) and no
// system attributes. A case that tests XDG attributes sets its own.
const isolatedXdg = path.join(root, "isolated-xdg");
fs.mkdirSync(isolatedXdg);
const baseEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: isolatedGitConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_ATTR_NOSYSTEM: "1",
  XDG_CONFIG_HOME: isolatedXdg,
});
function fixtureGit(args, { cwd, input, env = {} } = {}) {
  const result = spawnSync(realGit, args, { cwd, input, encoding: "utf8", env: { ...baseEnv(), ...env } });
  assert.strictEqual(result.status, 0, `fixture git ${args[0] === "-C" ? args[2] : args[0]} failed (exit ${result.status})`);
  return result.stdout.trim();
}

// Fixture clones that hold the gate and its helper files, with a chosen origin.
function gateClone(name, origin) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const file of ["ci-mac-gate.sh", "run-with-deadline.js", "run-isolated.sh", "ci-mac-gate-maintainers.txt"]) {
    fs.copyFileSync(path.join(repoRoot, "scripts", file), path.join(dir, "scripts", file));
  }
  fixtureGit(["init", "-q"], { cwd: dir });
  fixtureGit(["remote", "add", "origin", origin], { cwd: dir });
  return path.join(dir, "scripts", "ci-mac-gate.sh");
}
const trustedGate = gateClone("clone-ssh", "git@github.com:brandonwie/codex-hud.git");
const status = (state, m = merge, b = base, ref = "main") => `${state} merge ${m} base ${b} ref ${ref} node 24.22.3 rustc 1.100.0 61s`;
// PR commit lines as the gate's jq prints them: sha, verified, committer, author.
const commitLines = (...rows) => rows.map((row) => row.join(" ")).join("\n");
const trustedCommits = commitLines([firstCommit, "true", "brandonwie", "brandonwie"], [head, "true", "brandonwie", "brandonwie"]);

function runGate(args, fake, { gatePath = trustedGate, pathPrefix = "", shellArgs = [], cwd } = {}) {
  fs.rmSync(calls, { force: true });
  const result = spawnSync("sh", [...shellArgs, gatePath, ...args], {
    cwd,
    env: {
      ...baseEnv(),
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
function fetchHarness() {
  const fake = path.join(root, "fetch-bin");
  const gitCalls = path.join(root, "git-calls");
  const runDir = path.join(root, "fetch-run");
  fs.rmSync(gitCalls, { force: true });
  fs.mkdirSync(runDir, { recursive: true });
  if (!fs.existsSync(fake)) {
    fs.mkdirSync(fake);
    fs.writeFileSync(path.join(fake, "uname"), `#!/bin/sh\n[ "$1" = -s ] && { echo Darwin; exit 0; }\nexec /usr/bin/uname "$@"\n`, { mode: 0o755 });
    // No network: the fake curl records the proxy variable names it sees and
    // fails as if the host were unreachable (curl exit 7).
    fs.writeFileSync(
      path.join(fake, "curl"),
      `#!/bin/sh\necho "curl $*" >> "\${FAKE_CURL_CALLS:-/dev/null}"\nenv | sed -n 's/^\\([A-Za-z_]*[Pp][Rr][Oo][Xx][Yy][A-Za-z0-9_]*\\)=.*/proxy-env \\1/p' >> "\${FAKE_CURL_CALLS:-/dev/null}"\nexit 7\n`,
      { mode: 0o755 },
    );
    // The fake sleep records its argument and returns at once.
    fs.writeFileSync(path.join(fake, "sleep"), `#!/bin/sh\necho "sleep $*" >> "\${FAKE_SLEEP_CALLS:-/dev/null}"\n`, { mode: 0o755 });
    fs.writeFileSync(
      path.join(fake, "git"),
      `#!/bin/sh
echo "$*" >> "$FAKE_GIT_CALLS"
env | sed -n 's/^\\(GIT_TRACE[A-Za-z0-9_]*=.*\\)/trace-env \\1/p; s/^\\(GIT_CURL_VERBOSE=.*\\)/trace-env \\1/p' >> "$FAKE_GIT_CALLS"
env | sed -n 's/^\\([A-Za-z_]*[Pp][Rr][Oo][Xx][Yy][A-Za-z0-9_]*\\)=.*/proxy-env \\1/p' >> "$FAKE_GIT_CALLS"
# The subcommand is the first word that is not a -C or -c option or its value.
sub=; skip=
for word in "$@"; do
  if [ -n "$skip" ]; then skip=; continue; fi
  case "$word" in -C|-c) skip=1 ;; *) sub=$word; break ;; esac
done
# A fetch keeps the gate's -C and -c options and fetches from the local fixture.
if [ "$1" = -C ] && [ "$sub" = fetch ]; then
  # FAKE_FETCH_FAILS: how many fetch attempts fail first (counted in FAKE_FETCH_COUNTER).
  if [ -n "\${FAKE_FETCH_FAILS:-}" ]; then
    n=$(cat "$FAKE_FETCH_COUNTER" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$FAKE_FETCH_COUNTER"
    [ "$n" -gt "$FAKE_FETCH_FAILS" ] || exit 128
  fi
  total=$#
  for word in "$@"; do [ "$word" = fetch ] && break; set -- "$@" "$word"; done
  shift "$total"
  exec "${realGit}" "$@" fetch -q "$FAKE_FETCH_REPO" HEAD
fi
if [ "$1" = -C ] && [ "$sub" = checkout ]; then
  [ -n "\${FAKE_ALLOW_CHECKOUT:-}" ] || { echo "fake git: checkout refused" >&2; exit 1; }
  "${realGit}" "$@" || exit
  # FAKE_CHECKOUT_PLANT: a file the checkout leaves behind, as a hook could.
  if [ -n "\${FAKE_CHECKOUT_PLANT:-}" ]; then mkdir -p "$2/.cargo" && echo "$FAKE_CHECKOUT_PLANT" > "$2/.cargo/config.toml"; fi
  # FAKE_RECORD_CHECKOUT: record the checked-out ci.yml bytes (od -c) and the
  # Git settings the checkout saw.
  if [ -n "\${FAKE_RECORD_CHECKOUT:-}" ]; then
    printf 'bytes %s\n' "$(od -An -c "$2/.github/workflows/ci.yml" | tr -d ' \n')" >> "$FAKE_GIT_CALLS"
    env | sed -n 's/^\\(GIT_[A-Z_0-9]*\\)=.*/checkout-env \\1/p; s/^\\(XDG_CONFIG_HOME\\)=.*/checkout-env \\1/p' >> "$FAKE_GIT_CALLS"
  fi
  exit 0
fi
if [ "$1" = -C ] && [ "$sub" = config ] && [ -n "\${FAKE_REDIRECTS:-}" ]; then
  case " $* " in *" --get-urlmatch "*) echo "$FAKE_REDIRECTS"; exit 0 ;; esac
fi
exec "${realGit}" "$@"
`,
      { mode: 0o755 },
    );
  }
  const dir = path.join(root, "fetch-src");
  const author = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
  const git = (...args) => fixtureGit(["-C", dir, ...args], { env: author });
  const gitIn = (input, ...args) => fixtureGit(["-C", dir, ...args], { env: author, input });
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    git("init", "-q");
    // The merge tree holds .github/workflows/ci.yml with this Node major, so a
    // run that is allowed to check out reaches the toolchain steps.
    const ciYml = gitIn(`      - uses: actions/setup-node@x\n        with:\n          node-version: ${process.versions.node.split(".")[0]}\n`, "hash-object", "-w", "--stdin");
    const workflows = gitIn(`100644 blob ${ciYml}\tci.yml\n`, "mktree");
    const github = gitIn(`040000 tree ${workflows}\tworkflows\n`, "mktree");
    const tree = gitIn(`040000 tree ${github}\t.github\n`, "mktree");
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
    const noProxy = `-c http\\.${trustedUrl.replace(/\./g, "\\.")}\\.proxy=`;
    assert.match(git, new RegExp(`${limit} config --get-urlmatch http\\.followRedirects`));
    assert.match(git, new RegExp(`${noProxy} config --get-urlmatch http\\.proxy`));
    assert.match(git, new RegExp(`${limit} ${noProxy} fetch -q --depth=1 ${trustedUrl.replace(/\./g, "\\.")} refs/pull/56/merge`));
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
  ["the maintainer's Git templates, hooks and fsmonitor cannot add files to the checkout", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const marker = "SYNTHETIC-HOOK-PROXY-c19d";
    const hookRan = path.join(root, "hook-ran");
    fs.rmSync(hookRan, { force: true });
    // Each hook records that it ran and writes a Cargo config with a proxy
    // URL into the checkout's ignored .cargo directory.
    const hook = `#!/bin/sh\necho "$0" >> "${hookRan}"\nmkdir -p .cargo && printf '[http]\\nproxy = "http://u:${marker}@x"\\n' > .cargo/config.toml\n`;
    const template = path.join(root, "evil-template");
    const hooksDir = path.join(root, "evil-hooks");
    for (const dir of [path.join(template, "hooks"), hooksDir]) {
      fs.mkdirSync(dir, { recursive: true });
      for (const name of ["post-checkout", "reference-transaction", "post-index-change"]) {
        fs.writeFileSync(path.join(dir, name), hook, { mode: 0o755 });
      }
    }
    fs.writeFileSync(path.join(hooksDir, "fsmonitor"), hook, { mode: 0o755 });
    const config = `[init]\n\ttemplateDir = ${template}\n[core]\n\thooksPath = ${hooksDir}\n\tfsmonitor = ${path.join(hooksDir, "fsmonitor")}\n`;
    // Control: plain git with this config runs the hooks and leaves the file.
    const control = path.join(root, "hook-control");
    fs.rmSync(control, { recursive: true, force: true });
    const controlEnv = { ...fetchConfig(config), GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
    fixtureGit(["init", "-q", control], { env: controlEnv });
    fixtureGit(["-C", control, "fetch", "-q", fixture.dir, "HEAD"], { env: controlEnv });
    fixtureGit(["-C", control, "checkout", "-q", "--detach", "FETCH_HEAD"], { env: controlEnv });
    assert.ok(fs.existsSync(path.join(control, ".cargo", "config.toml")), "control: the hook did not write the Cargo config");
    assert.ok(fs.existsSync(hookRan), "control: no hook ran");
    fs.rmSync(hookRan, { force: true });
    const env = {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      FAKE_ALLOW_CHECKOUT: "1",
      FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
      FAKE_BASE: fixture.base,
      FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
      ...fetchConfig(config),
    };
    // Through the gate: no hook runs, the checkout is clean, and the run reaches
    // the (offline) Rust channel step.
    const result = runWorker("", env, runDir, "", { pathPrefix: prefix });
    fails(result, /cannot read the current Rust stable version/);
    assert.ok(!fs.existsSync(hookRan), "a maintainer hook ran in the gate's repository");
    assert.ok(!(result.stdout + result.stderr).includes(marker), "the hook's proxy value reached the gate output");
    const calls = fs.readFileSync(gitCalls, "utf8");
    assert.match(calls, /^-c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false init -q --template=\S+git-template \S+$/m);
    // Every call into the temporary repository runs with hooks and fsmonitor off.
    const srcCalls = calls.split("\n").filter((line) => line.startsWith("-C "));
    assert.ok(srcCalls.length >= 8, "too few git calls recorded");
    for (const line of srcCalls) assert.match(line, /^-C \S+ -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false /, line);
    assert.match(calls, /-c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false -c http\.\S+ -c http\.\S+ fetch -q /);
    assert.match(calls, /-c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false checkout -q --detach /);
    assert.match(calls, /-c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false status --porcelain --ignored --untracked-files=all/);
    // A file left in the checkout by any other route stops the run before the checks.
    fs.rmSync(gitCalls, { force: true });
    const planted = runWorker("", { ...env, FAKE_CHECKOUT_PLANT: `[http]\nproxy = "http://u:${marker}@x"` }, runDir, "", { pathPrefix: prefix });
    fails(planted, /^ci-mac-gate: the checkout holds files that are not in the merge commit, or Git cannot list them; check your Git hooks and templates and rerun$/m);
    assert.ok(!(planted.stdout + planted.stderr).includes(marker), "the planted proxy value reached the gate output");
    assert.doesNotMatch(planted.stderr, /Rust stable/);
  }],
  ["the maintainer's Git config, attributes and command-level settings cannot change the checked-out files", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const xdg = path.join(root, "crlf-xdg");
    fs.mkdirSync(path.join(xdg, "git"), { recursive: true });
    fs.writeFileSync(path.join(xdg, "git", "attributes"), "* text eol=crlf\n");
    const autocrlf = path.join(root, "crlf-gitconfig");
    fs.writeFileSync(autocrlf, "[core]\n\tautocrlf = true\n");
    const plain = fetchConfig();
    const settings = [
      ["global core.autocrlf", { ...plain, GIT_CONFIG_GLOBAL: autocrlf }],
      ["XDG attributes", { ...plain, XDG_CONFIG_HOME: xdg }],
      ["GIT_CONFIG_PARAMETERS", { ...plain, GIT_CONFIG_PARAMETERS: "'core.autocrlf'='true'" }],
      ["GIT_CONFIG_COUNT", { ...plain, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "true" }],
    ];
    settings.forEach(([name, setting], index) => {
      // Control: plain git with the setting checks ci.yml out with CRLF.
      const control = path.join(root, `crlf-control-${index}`);
      fs.rmSync(control, { recursive: true, force: true });
      const controlEnv = { ...baseEnv(), ...setting };
      for (const args of [["init", "-q", control], ["-C", control, "fetch", "-q", fixture.dir, "HEAD"], ["-C", control, "checkout", "-q", "--detach", "FETCH_HEAD"]]) {
        const r = spawnSync(realGit, args, { encoding: "utf8", env: controlEnv });
        assert.strictEqual(r.status, 0, `control git ${args[0] === "-C" ? args[2] : args[0]} failed for ${name} (exit ${r.status})`);
      }
      assert.ok(fs.readFileSync(path.join(control, ".github", "workflows", "ci.yml"), "utf8").includes("\r\n"), `control: ${name} did not change the line endings`);
      // Through the gate the checkout holds the merge commit's bytes (LF only).
      fs.rmSync(gitCalls, { force: true });
      const result = runWorker("", {
        FAKE_GIT_CALLS: gitCalls,
        FAKE_FETCH_REPO: fixture.dir,
        FAKE_ALLOW_CHECKOUT: "1",
        FAKE_RECORD_CHECKOUT: "1",
        FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
        FAKE_BASE: fixture.base,
        FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
        ...setting,
      }, runDir, "", { pathPrefix: prefix });
      fails(result, /cannot read the current Rust stable version/);
      const calls = fs.readFileSync(gitCalls, "utf8");
      const bytes = calls.match(/^bytes (.*)$/m);
      assert.ok(bytes, `no checkout recorded for ${name}`);
      assert.match(bytes[1], /\\n/, `no line ending recorded for ${name}`);
      assert.doesNotMatch(bytes[1], /\\r/, `${name} changed the checked-out line endings`);
      const seen = [...calls.matchAll(/^checkout-env (\S+)$/gm)].map((m) => m[1]).sort();
      assert.deepStrictEqual(seen.filter((v) => /^GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)|^GIT_TEMPLATE_DIR$|^GIT_ATTR_SOURCE$/.test(v)), [], `${name}: command-level Git config reached the checkout`);
      for (const want of ["GIT_ATTR_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "XDG_CONFIG_HOME"]) assert.ok(seen.includes(want), `${name}: checkout ran without ${want}`);
    });
  }],
  ["an inherited GIT_DEFAULT_HASH cannot change the gate's repository format", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const setting = { ...fetchConfig(), GIT_DEFAULT_HASH: "sha256" };
    // Control: plain git creates a SHA-256 repository that cannot fetch the SHA-1 fixture.
    const control = path.join(root, "sha256-control");
    fs.rmSync(control, { recursive: true, force: true });
    const controlEnv = { ...baseEnv(), ...setting };
    assert.strictEqual(spawnSync(realGit, ["init", "-q", control], { env: controlEnv }).status, 0, "control git init failed");
    assert.notStrictEqual(spawnSync(realGit, ["-C", control, "fetch", "-q", fixture.dir, "HEAD"], { env: controlEnv }).status, 0, "control: a SHA-256 repository fetched the SHA-1 fixture");
    // Through the gate the fetch, the commit checks and the checkout succeed.
    fs.rmSync(gitCalls, { force: true });
    const result = runWorker("", {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      FAKE_ALLOW_CHECKOUT: "1",
      FAKE_RECORD_CHECKOUT: "1",
      FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
      FAKE_BASE: fixture.base,
      FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
      ...setting,
    }, runDir, "", { pathPrefix: prefix });
    fails(result, /cannot read the current Rust stable version/);
    assert.doesNotMatch(fs.readFileSync(gitCalls, "utf8"), /^checkout-env GIT_DEFAULT_HASH$/m);
  }],
  ["CDPATH cannot send a relative invocation to another checkout", () => {
    // Another directory with a scripts/ folder, first in CDPATH: if the gate's
    // relative cd followed it, its scripts would run and leave the marker.
    const { prefix } = fetchHarness();
    const alt = path.join(root, "cdpath-alt");
    const marker = path.join(root, "cdpath-marker");
    fs.mkdirSync(path.join(alt, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(alt, "scripts", "run-with-deadline.js"), 'require("fs").writeFileSync(process.env.CDPATH_MARKER, "alt\\n");\n');
    fs.writeFileSync(path.join(alt, "scripts", "ci-mac-gate.sh"), 'echo alt > "$CDPATH_MARKER"\n');
    fs.rmSync(marker, { force: true });
    const result = runGate(["56"], {
      CDPATH: alt,
      CDPATH_MARKER: marker,
      FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2`,
    }, { gatePath: "scripts/ci-mac-gate.sh", cwd: path.dirname(path.dirname(trustedGate)), pathPrefix: prefix });
    fails(result, /comes from someone\/fork/);
    assert.match(result.stdout, /under a 360-minute deadline/);
    assert.ok(!fs.existsSync(marker), "the relative invocation ran another checkout's scripts");
    // ci-local.sh and run-isolated.sh clear CDPATH before their first cd too.
    for (const file of ["ci-local.sh", "run-isolated.sh", "ci-mac-gate.sh"]) {
      const text = fs.readFileSync(path.join(repoRoot, "scripts", file), "utf8");
      const unset = text.search(/^unset CDPATH$/m);
      const firstCd = text.search(/^[^#\n]*\bcd /m);
      assert.ok(unset > 0 && unset < firstCd, `${file} does not unset CDPATH before its first cd`);
    }
  }],
  ["the merge-ref fetch makes up to three attempts, 10 and 20 seconds apart", () => {
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const counter = path.join(root, "fetch-counter");
    const sleeps = path.join(root, "sleep-calls");
    const candidate = {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      FAKE_FETCH_COUNTER: counter,
      FAKE_SLEEP_CALLS: sleeps,
      FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
      FAKE_BASE: fixture.base,
      FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
      ...fetchConfig(),
    };
    const fetches = () => fs.readFileSync(gitCalls, "utf8").split("\n").filter((line) => / fetch -q --depth=1 /.test(line)).length;
    // Two failures, then the third attempt fetches and the run goes on to checkout.
    for (const file of [counter, sleeps, gitCalls]) fs.rmSync(file, { force: true });
    const recovered = runWorker("", { ...candidate, FAKE_FETCH_FAILS: "2" }, runDir, "", { pathPrefix: prefix });
    fails(recovered, /checkout failed/);
    assert.strictEqual(fetches(), 3);
    assert.strictEqual(fs.readFileSync(sleeps, "utf8"), "sleep 10\nsleep 20\n");
    // Three failures stop the run with the fixed message, after two waits.
    for (const file of [counter, sleeps, gitCalls]) fs.rmSync(file, { force: true });
    const failed = runWorker("", { ...candidate, FAKE_FETCH_FAILS: "3" }, runDir, "", { pathPrefix: prefix });
    fails(failed, /^ci-mac-gate: cannot fetch refs\/pull\/56\/merge from https:\/\/github\.com\/brandonwie\/codex-hud\.git \(3 attempts\); the gate uses no proxy, so check the direct network connection and that the PR has no merge conflict, then rerun$/m);
    assert.strictEqual(fetches(), 3);
    assert.strictEqual(fs.readFileSync(sleeps, "utf8"), "sleep 10\nsleep 20\n");
    assert.doesNotMatch(fs.readFileSync(gitCalls, "utf8"), /checkout/);
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
  ["inherited shell and Git tracing never print a credential", () => {
    // Every Git trace switch the environment and Git config offer, on top of
    // shell xtrace (sh -x).
    const traces = {
      GIT_TRACE: "2",
      GIT_TRACE_SETUP: "2",
      GIT_TRACE_PACKET: "2",
      GIT_TRACE_CURL: "2",
      GIT_CURL_VERBOSE: "1",
      GIT_TRACE2: "2",
      GIT_TRACE2_PERF: "2",
      GIT_TRACE2_EVENT: "2",
      GIT_TRACE2_CONFIG_PARAMS: "*",
      GIT_TRACE2_ENV_VARS: "*",
    };
    const traceConfig = "[trace2]\n\tnormalTarget = /dev/stderr\n\tperfTarget = /dev/stderr\n\teventTarget = /dev/stderr\n\tconfigParams = *\n";
    const xtrace = { shellArgs: ["-x"] };
    // A rejected origin with a token.
    const originSecret = "SYNTHETIC-TRACE-ORIGIN-4d1e";
    const tokenClone = gateClone("clone-trace-token", `https://x-access-token:${originSecret}@github.com/someone/codex-hud.git`);
    const origin = runWorker("", traces, missingRunDir, "", { ...xtrace, gatePath: tokenClone });
    refusedBeforeCheckout(origin, /origin \(remote\.origin\.url\) is not/);
    assert.ok(!(origin.stdout + origin.stderr).includes(originSecret), "a trace printed the origin credential");
    // A fetch URL rewrite with a token, with trace2 targets also set in Git config.
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const rewriteSecret = "SYNTHETIC-TRACE-REWRITE-b07c";
    const env = {
      ...traces,
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      ...fetchConfig(`[url "https://user:${rewriteSecret}@evil.example/"]\n\tinsteadOf = https://github.com/\n${traceConfig}`),
    };
    const rewrite = runWorker("", env, runDir, "", { ...xtrace, pathPrefix: prefix });
    fails(rewrite, /with a url\.<base>\.insteadOf rule/);
    assert.match(rewrite.stderr, /^\+ /m, "sh -x did not trace the gate's first lines");
    assert.ok(!(rewrite.stdout + rewrite.stderr).includes(rewriteSecret), "a trace printed the rewrite credential");
    const calls = fs.readFileSync(gitCalls, "utf8");
    assert.doesNotMatch(calls, /fetch|checkout/);
    // Every git call saw no inherited trace switch, only the trace2 disables.
    const seen = new Set(calls.split("\n").filter((line) => line.startsWith("trace-env ")).map((line) => line.slice(10)));
    assert.deepStrictEqual([...seen].sort(), ["GIT_TRACE2=0", "GIT_TRACE2_EVENT=0", "GIT_TRACE2_PERF=0"]);
  }],
  ["malformed Git config keys never print a credential, with tracing off", () => {
    // Git prints a malformed or valueless config key, URL and token included,
    // in its own error messages. No tracing is enabled here.
    const marker = "SYNTHETIC-CONFIG-KEY-e5a9";
    const noOutput = (result, label) =>
      assert.ok(!(result.stdout + result.stderr).includes(marker), `${label}: a Git error printed the credential`);
    // 1. An invalid key from the environment: every git call fails.
    const envKey = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.https://u:${marker}@evil.example/.bad key`,
      GIT_CONFIG_VALUE_0: "x",
    };
    const run = runWorker("", envKey);
    refusedBeforeCheckout(run, /cannot read this clone's origin \(remote\.origin\.url\)/);
    noOutput(run, "run, invalid key");
    // verify reaches git only for a long base branch (its refid).
    const longRef = `release/${"x".repeat(60)}`;
    const verify = runGate(["verify", "56"], { ...envKey, FAKE_PR: `${head} ${longRef} ${repo} ${repo} ${merge}`, FAKE_OTHER_BASE: base });
    fails(verify, /cannot build the candidate record/);
    noOutput(verify, "verify, invalid key");
    // 2. A valueless insteadOf key in the global config.
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const harness = { FAKE_GIT_CALLS: gitCalls, FAKE_FETCH_REPO: fixture.dir };
    const valueless = runWorker("", { ...harness, ...fetchConfig(`[url "https://u:${marker}@evil.example/"]\n\tinsteadOf\n`) }, runDir, "", { pathPrefix: prefix });
    fails(valueless, /cannot read this clone's origin/);
    noOutput(valueless, "run, valueless key");
    // 3. The same key only inside the temporary fetch repository, through a
    // conditional include: the origin read passes, the URL resolver fails.
    const include = path.join(root, "fetch-include.gitconfig");
    fs.writeFileSync(include, `[url "https://u:${marker}@evil.example/"]\n\tinsteadOf\n`);
    fs.rmSync(gitCalls, { force: true });
    const scoped = runWorker("", { ...harness, ...fetchConfig(`[includeIf "gitdir:**/src/"]\n\tpath = ${include}\n`) }, runDir, "", { pathPrefix: prefix });
    fails(scoped, /Git cannot resolve the fetch URL https:\/\/github\.com\/brandonwie\/codex-hud\.git/);
    noOutput(scoped, "run, valueless key in the fetch repository");
    const calls = fs.readFileSync(gitCalls, "utf8");
    assert.match(calls, /ls-remote --get-url/);
    assert.doesNotMatch(calls, /fetch -q|checkout/);
    assert.doesNotMatch(scoped.ghCalls, /statuses/);
  }],
  ["every proxy variable is removed before any tool runs, so a proxy password never reaches the gate log", () => {
    // Offline: the fake curl fails as if the host were unreachable. The values
    // hold a synthetic password, one with an unescaped slash in it.
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const marker = "SYNTHETIC-PROXY-PASSWORD-a42b";
    const curlCalls = path.join(root, "curl-calls");
    fs.rmSync(curlCalls, { force: true });
    const proxies = {
      HTTPS_PROXY: `http://u:pa/ss${marker}@proxy.example:8080`,
      https_proxy: `http://[${marker}`,
      HTTP_PROXY: `u:${marker}@proxy.example:8080`,
      all_proxy: `socks5://u:${marker}@proxy.example`,
      NO_PROXY: `${marker}.example`,
      CARGO_HTTP_PROXY: `http://u:${marker}@proxy.example`,
      npm_config_https_proxy: `http://u:${marker}@proxy.example`,
      GIT_PROXY_COMMAND: `/nonexistent/${marker}`,
    };
    const result = runWorker("", {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_CURL_CALLS: curlCalls,
      FAKE_FETCH_REPO: fixture.dir,
      FAKE_ALLOW_CHECKOUT: "1",
      FAKE_PR: `${fixture.head} main ${repo} ${repo} ${fixture.merge} 1 main`,
      FAKE_BASE: fixture.base,
      FAKE_COMMITS: commitLines([fixture.head, "true", "brandonwie", "brandonwie"]),
      ...proxies,
      ...fetchConfig(),
    }, runDir, "", { pathPrefix: prefix });
    fails(result, /^ci-mac-gate: cannot read the current Rust stable version from https:\/\/static\.rust-lang\.org\/dist\/channel-rust-stable\.toml; the gate uses no proxy, so check the direct network connection and rerun$/m);
    assert.ok(!(result.stdout + result.stderr).includes(marker), "a proxy value reached the gate output");
    // gh, git and curl ran, and none of them saw a proxy variable.
    const curl = fs.readFileSync(curlCalls, "utf8");
    assert.match(curl, /^curl -q -fsL /m);
    assert.doesNotMatch(curl, /proxy-env/);
    assert.match(fs.readFileSync(gitCalls, "utf8"), /fetch -q/);
    assert.doesNotMatch(fs.readFileSync(gitCalls, "utf8"), /proxy-env/);
    assert.match(result.ghCalls, /repos\/brandonwie\/codex-hud\/pulls\/56/);
    assert.doesNotMatch(result.ghCalls, /proxy-env|statuses/);
    // verify strips them too and still works.
    const verify = runGate(["verify", "56"], { ...proxies, FAKE_STATUS: status("success") });
    assert.strictEqual(verify.status, 0, "verify failed with proxy variables set");
    assert.match(verify.stdout, /is green on macOS/);
    assert.ok(!(verify.stdout + verify.stderr).includes(marker), "verify printed a proxy value");
    assert.doesNotMatch(verify.ghCalls, /proxy-env/);
    // The scan code is gone: nothing reads a proxy value.
    const script = fs.readFileSync(gate, "utf8");
    assert.doesNotMatch(script, /printenv|proxy_names|proxy_creds/);
  }],
  ["the PR's checks run with an empty global Git config and no system config", () => {
    // The probes and both checks run through run-isolated.sh; the probes also
    // discard stderr.
    const script = fs.readFileSync(gate, "utf8");
    assert.match(script, /\nnice -n 10 sh "\$isolated" "\$iso" "\$src" npm ci \|\| state=failure\n/);
    assert.match(script, /\n {2}nice -n 10 sh "\$isolated" "\$iso" "\$src" sh "\$src\/scripts\/ci-local\.sh" \|\| state=failure\n/);
    assert.match(script, /node_version=\$\(sh "\$isolated" "\$iso" "\$src" node -p process\.versions\.node 2>\/dev\/null\)/);
    assert.match(script, /rustc_line=\$\(sh "\$isolated" "\$iso" "\$src" rustc -V 2>\/dev\/null\)/);
    assert.match(script, /\nsh "\$isolated" "\$iso" "\$src" cargo fmt --version >\/dev\/null 2>&1 \|\|/);
    assert.match(script, /\nsh "\$isolated" "\$iso" "\$src" cargo clippy --version >\/dev\/null 2>&1 \|\|/);
    assert.doesNotMatch(script, /\(cd "\$src" && (npm|cargo|rustc|node) /);
    const helper = fs.readFileSync(path.join(repoRoot, "scripts", "run-isolated.sh"), "utf8");
    // The command gets a new environment (env -i) with the listed variables only.
    assert.match(helper, /\nexec env -i \\\n {2}"PATH=\$sysroot\/bin:\$node_bin:\$PATH" \\\n {2}"HOME=\$state\/home" \\\n {2}"CARGO_HOME=\$state\/cargo-home" \\\n {2}"GIT_CONFIG_GLOBAL=\$state\/gitconfig" \\\n {2}GIT_CONFIG_NOSYSTEM=1 \\\n {2}GIT_ATTR_NOSYSTEM=1 \\\n/);
    assert.match(helper, /\n {2}"\$@"\n$/);
    assert.doesNotMatch(helper, /^export /m);
  }],
  ["the maintainer's Cargo, npm, Node and Git config cannot reach the probes or the checks", () => {
    // Offline. Each control shows that the poisoned setting reaches the tool and
    // prints its marker; run-isolated.sh keeps it out, with the expected status.
    const marker = "SYNTHETIC-TOOL-CONFIG-5e1d";
    const poison = path.join(root, "tool-poison");
    fs.mkdirSync(path.join(poison, "cargo-home"), { recursive: true });
    fs.mkdirSync(path.join(poison, "xdg", "git"), { recursive: true });
    const badCargo = `[http]\nproxy = "http://u:${marker}@proxy.example" junk\n`;
    fs.writeFileSync(path.join(poison, "cargo-home", "config.toml"), badCargo);
    fs.writeFileSync(path.join(poison, "xdg", "git", "config"), `[core]\n\tbigFileThreshold = ${marker}\n`);
    fs.writeFileSync(path.join(poison, "global.gitconfig"), `[core]\n\tbigFileThreshold = ${marker}\n`);
    fs.writeFileSync(path.join(poison, "npmrc"), `proxy=http://u:${marker}@[bad\n//registry.npmjs.org/:_authToken=${marker}\n`);
    const project = (dir) => {
      fs.mkdirSync(dir, { recursive: true });
      for (const file of ["Cargo.toml", "Cargo.lock"]) fs.copyFileSync(path.join(repoRoot, "rust", file), path.join(dir, file));
      fs.cpSync(path.join(repoRoot, "rust", "src"), path.join(dir, "src"), { recursive: true });
      return dir;
    };
    const proj = project(path.join(root, "tool-project"));
    const env = {
      ...process.env,
      CARGO_HOME: path.join(poison, "cargo-home"),
      XDG_CONFIG_HOME: path.join(poison, "xdg"),
      GIT_CONFIG_GLOBAL: path.join(poison, "global.gitconfig"),
      NODE_OPTIONS: `--require /nonexistent/${marker}`,
      npm_config_userconfig: path.join(poison, "npmrc"),
    };
    delete env.GIT_CONFIG_NOSYSTEM;
    const run = (cwd, cmd, args, extraEnv = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...env, ...extraEnv } });
    const leaked = (r) => (r.stdout + r.stderr).includes(marker);
    const sysroot = spawnSync("rustc", ["--print", "sysroot"], { cwd: proj, encoding: "utf8" }).stdout.trim();
    const directCargo = path.join(sysroot, "bin", "cargo");
    const helper = path.join(repoRoot, "scripts", "run-isolated.sh");
    const isolated = (cwd, args) => run(cwd, "sh", [helper, path.join(root, `tool-state-${path.basename(cwd)}`), cwd, ...args]);
    // Controls: the poisoned config reaches each tool.
    for (const [cmd, args] of [
      [directCargo, ["fmt", "--version"]],
      [directCargo, ["clippy", "--version"]],
      [directCargo, ["fmt", "--manifest-path", "Cargo.toml", "--", "--check"]],
      [process.execPath, ["-p", "1"]],
      ["git", ["hash-object", "--path=a", "Cargo.toml"]],
    ]) {
      const control = run(proj, cmd, args);
      assert.notStrictEqual(control.status, 0, `control ${path.basename(cmd)} ${args.join(" ")} passed`);
      assert.ok(leaked(control), `control ${path.basename(cmd)} ${args.join(" ")} did not show the marker`);
    }
    // The version probes and the format check pass and print no marker.
    for (const args of [
      ["rustc", "-V"],
      ["cargo", "fmt", "--version"],
      ["cargo", "clippy", "--version"],
      ["cargo", "fmt", "--manifest-path", "Cargo.toml", "--", "--check"],
      ["node", "-p", "1"],
      ["npm", "config", "get", "proxy"],
      ["git", "hash-object", "--path=a", "Cargo.toml"],
    ]) {
      const result = isolated(proj, args);
      assert.strictEqual(result.status, 0, `isolated ${args.join(" ")} failed (exit ${result.status})`);
      assert.ok(!leaked(result), `isolated ${args.join(" ")} printed the marker`);
    }
    assert.strictEqual(isolated(proj, ["npm", "config", "get", "proxy"]).stdout.trim(), "null");
    // Command-level Git config (GIT_CONFIG_COUNT, GIT_CONFIG_PARAMETERS) and
    // proxy variables do not reach the checks either.
    const commandLevel = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bigFileThreshold",
      GIT_CONFIG_VALUE_0: marker,
      GIT_CONFIG_PARAMETERS: `'core.bigfilethreshold'='${marker}'`,
      HTTPS_PROXY: `http://u:pa/ss${marker}@proxy.example`,
      no_proxy: marker,
      GIT_PROXY_COMMAND: `/nonexistent/${marker}`,
      GIT_TEMPLATE_DIR: path.join(poison, "template"),
    };
    // Control: a Git template with a malformed key breaks a plain git init + add.
    fs.mkdirSync(path.join(poison, "template"), { recursive: true });
    fs.writeFileSync(path.join(poison, "template", "config"), `[core]\n\tbigFileThreshold = ${marker}\n`);
    const templateScript = "git init -q t && cd t && echo x > f && git add f";
    const templateRepo = (name) => {
      const dir = path.join(root, name);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir);
      return dir;
    };
    const templateControl = run(templateRepo("template-control"), "sh", ["-c", templateScript], { GIT_CONFIG_GLOBAL: "/dev/null", GIT_TEMPLATE_DIR: commandLevel.GIT_TEMPLATE_DIR });
    assert.ok(templateControl.status !== 0 && leaked(templateControl), "control: git ignored GIT_TEMPLATE_DIR");
    const templateDir = templateRepo("template-isolated");
    const templateIsolated = run(templateDir, "sh", [helper, path.join(root, "tool-state-template"), templateDir, "sh", "-c", templateScript], commandLevel);
    assert.strictEqual(templateIsolated.status, 0, `isolated git init + add with GIT_TEMPLATE_DIR failed (exit ${templateIsolated.status})`);
    assert.ok(!leaked(templateIsolated), "GIT_TEMPLATE_DIR reached the isolated git");
    for (const [key, value] of [["GIT_CONFIG_COUNT", "1"], ["GIT_CONFIG_PARAMETERS", commandLevel.GIT_CONFIG_PARAMETERS]]) {
      const only = key === "GIT_CONFIG_COUNT"
        ? { GIT_CONFIG_COUNT: value, GIT_CONFIG_KEY_0: "core.bigFileThreshold", GIT_CONFIG_VALUE_0: marker }
        : { GIT_CONFIG_PARAMETERS: value };
      const control = run(proj, "git", ["hash-object", "--path=a", "Cargo.toml"], { GIT_CONFIG_GLOBAL: "/dev/null", ...only });
      assert.ok(control.status !== 0 && leaked(control), `control: git ignored ${key}`);
    }
    const commandRun = (args) => run(proj, "sh", [helper, path.join(root, "tool-state-command"), proj, ...args], commandLevel);
    const hashed = commandRun(["git", "hash-object", "--path=a", "Cargo.toml"]);
    assert.strictEqual(hashed.status, 0, `isolated git with command-level config failed (exit ${hashed.status})`);
    assert.ok(!leaked(hashed), "command-level Git config reached the isolated git");
    const childEnv = commandRun(["env"]);
    assert.strictEqual(childEnv.status, 0);
    assert.doesNotMatch(childEnv.stdout, /^(GIT_CONFIG_(COUNT|KEY_0|VALUE_0|PARAMETERS)=|[^=\n]*[Pp][Rr][Oo][Xx][Yy][^=\n]*=)/m);
    // Of the Git variables only the helper's own three remain.
    const gitVars = [...childEnv.stdout.matchAll(/^(GIT_[A-Za-z0-9_]*)=/gm)].map((m) => m[1]).sort();
    assert.deepStrictEqual(gitVars, ["GIT_ATTR_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"]);
    assert.ok(!leaked(childEnv), "a stripped value reached the child environment");
    // Every variable the child sees is on the helper's list; the inherited rest
    // (CARGO_HOME, XDG_CONFIG_HOME, NODE_OPTIONS, the proxy variables) is gone.
    const allowed = [
      "PATH", "HOME", "CARGO_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_ATTR_NOSYSTEM",
      "npm_config_userconfig", "npm_config_globalconfig", "npm_config_cache",
      "CARGO_BUILD_JOBS", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME",
    ];
    const names = [...childEnv.stdout.matchAll(/^([^=\n]+)=/gm)].map((m) => m[1]);
    assert.deepStrictEqual(names.filter((name) => !allowed.includes(name)), []);
    assert.ok(names.includes("HOME") && names.includes("PATH"));
    // The home the checks see is empty and inside the state directory.
    const homes = isolated(proj, ["sh", "-c", 'printf "%s\\n%s\\n" "$HOME" "$CARGO_HOME"; ls -A "$HOME"']);
    const state = fs.realpathSync(path.join(root, "tool-state-tool-project"));
    assert.strictEqual(homes.stdout, `${state}/home\n${state}/cargo-home\n`);
    // A Cargo config above the project stops the run with a fixed message.
    const ancestor = path.join(root, "tool-ancestor");
    fs.mkdirSync(path.join(ancestor, ".cargo"), { recursive: true });
    fs.writeFileSync(path.join(ancestor, ".cargo", "config.toml"), badCargo);
    const nested = project(path.join(ancestor, "proj"));
    const control = run(nested, directCargo, ["fmt", "--version"], { CARGO_HOME: path.join(root, "tool-empty-cargo-home") });
    assert.ok(control.status !== 0 && leaked(control), "control: the ancestor Cargo config did not apply");
    const refused = isolated(nested, ["cargo", "fmt", "--version"]);
    assert.strictEqual(refused.status, 1);
    assert.match(refused.stderr, /^run-isolated: Cargo, rustfmt or Clippy would read .*\/tool-ancestor\/\.cargo\/config\.toml, which is above the project directory/);
    assert.ok(!leaked(refused), "the refusal printed the marker");
  }],
  ["inherited Rust tool settings and Rust tool config above the project cannot reach the checks", () => {
    // Offline, on a one-file crate whose source is not formatted. Each control
    // shows that the setting changes the tool's result or output; through
    // run-isolated.sh the checks run as on the hosted runner.
    const marker = "SYNTHETIC-RUST-TOOL-8b2d";
    const markerKey = "SYNTHETIC_RUST_TOOL_8b2d";
    const base = path.join(root, "rust-tool");
    const crate = (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Cargo.toml"), '[package]\nname = "probe"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n');
      fs.writeFileSync(path.join(dir, "src", "lib.rs"), "pub fn f( ) -> u8 {   1 }\n");
      return dir;
    };
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["RUSTFMT", "CLIPPY_CONF_DIR", "NODE_DEBUG"].includes(key)));
    const run = (cwd, cmd, args, extraEnv = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...env, CARGO_BUILD_JOBS: "2", ...extraEnv } });
    const output = (r) => r.stdout + r.stderr;
    const sysroot = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" }).stdout.trim();
    const directCargo = path.join(sysroot, "bin", "cargo");
    const helper = path.join(repoRoot, "scripts", "run-isolated.sh");
    const isolated = (cwd, args, extraEnv = {}) => run(cwd, "sh", [helper, path.join(base, `state-${path.basename(path.dirname(cwd))}`), cwd, ...args], extraEnv);
    const proj = crate(path.join(base, "plain", "proj"));
    // RUSTFMT selects another formatter: the control's format check passes.
    const fakeFmt = path.join(base, "fake-rustfmt");
    fs.writeFileSync(fakeFmt, `#!/bin/sh\necho ${marker} >&2\nexit 0\n`, { mode: 0o755 });
    const fmtControl = run(proj, directCargo, ["fmt", "--", "--check"], { RUSTFMT: fakeFmt });
    assert.ok(fmtControl.status === 0 && output(fmtControl).includes(marker), "control: cargo fmt ignored RUSTFMT");
    const fmt = isolated(proj, ["cargo", "fmt", "--", "--check"], { RUSTFMT: fakeFmt });
    assert.strictEqual(fmt.status, 1, `isolated format check with RUSTFMT exited ${fmt.status}, not 1`);
    assert.match(fmt.stdout, /^Diff in /m);
    assert.ok(!output(fmt).includes(marker), "RUSTFMT reached the isolated format check");
    // CLIPPY_CONF_DIR points Clippy at a config file elsewhere.
    const confDir = path.join(base, "clippy-conf");
    fs.mkdirSync(confDir, { recursive: true });
    fs.writeFileSync(path.join(confDir, "clippy.toml"), `${markerKey} = 1\n`);
    const clippyControl = run(proj, directCargo, ["clippy", "-q"], { CLIPPY_CONF_DIR: confDir });
    assert.ok(clippyControl.status !== 0 && output(clippyControl).includes(markerKey), "control: Clippy ignored CLIPPY_CONF_DIR");
    const clippy = isolated(proj, ["cargo", "clippy", "-q"], { CLIPPY_CONF_DIR: confDir });
    assert.strictEqual(clippy.status, 0, `isolated Clippy with CLIPPY_CONF_DIR failed (exit ${clippy.status})`);
    assert.ok(!output(clippy).includes(markerKey), "CLIPPY_CONF_DIR reached the isolated Clippy");
    // NODE_DEBUG=child_process prints each child's environment.
    const spawnTrue = ["-e", 'require("child_process").spawnSync("true")'];
    const nodeControl = run(proj, process.execPath, spawnTrue, { NODE_DEBUG: "child_process" });
    assert.match(nodeControl.stderr, /CHILD_PROCESS/, "control: node ignored NODE_DEBUG");
    const node = isolated(proj, ["node", ...spawnTrue], { NODE_DEBUG: "child_process" });
    assert.strictEqual(node.status, 0);
    assert.doesNotMatch(output(node), /CHILD_PROCESS/);
    // A rustfmt or Clippy config file above the project stops the run.
    for (const [name, args] of [
      ["rustfmt.toml", ["fmt", "--", "--check"]],
      [".rustfmt.toml", ["fmt", "--", "--check"]],
      ["clippy.toml", ["clippy", "-q"]],
      [".clippy.toml", ["clippy", "-q"]],
    ]) {
      const ancestor = path.join(base, `ancestor${name}`);
      const nested = crate(path.join(ancestor, "proj"));
      fs.writeFileSync(path.join(ancestor, name), `${markerKey} = 1\n`);
      const control = run(nested, directCargo, args);
      assert.ok(output(control).includes(markerKey), `control: cargo ${args[0]} did not read ${name} above the project`);
      const refused = isolated(nested, ["cargo", ...args]);
      assert.strictEqual(refused.status, 1);
      assert.strictEqual(refused.stderr, `run-isolated: Cargo, rustfmt or Clippy would read ${fs.realpathSync(ancestor)}/${name}, which is above the project directory; move the project or that file and rerun\n`);
      assert.strictEqual(refused.stdout, "");
    }
  }],
  ["the maintainer's Git config, even an include for the test clones only, cannot reach the tests", () => {
    // A maintainer home whose Git config includes a valueless URL rewrite with
    // a token, only for repositories under the test clone directory.
    const marker = "SYNTHETIC-MAINTAINER-INCLUDE-3c6f";
    const home = path.join(root, "maintainer-home");
    fs.mkdirSync(home, { recursive: true });
    const include = path.join(home, "clones.gitconfig");
    fs.writeFileSync(include, `[url "https://u:${marker}@evil.example/"]\n\tinsteadOf\n`);
    const cloneDir = path.join(fs.realpathSync(root), "clone-include");
    fs.writeFileSync(path.join(home, ".gitconfig"), `[includeIf "gitdir:${cloneDir}/"]\n\tpath = ${include}\n`);
    const savedHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const gatePath = gateClone("clone-include", "git@github.com:brandonwie/codex-hud.git");
      // Control: plain git with that home fails in the clone and prints the token.
      const plainEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))), GIT_CONFIG_NOSYSTEM: "1" };
      const plain = spawnSync(realGit, ["remote", "get-url", "origin"], { cwd: path.dirname(path.dirname(gatePath)), encoding: "utf8", env: plainEnv });
      assert.notStrictEqual(plain.status, 0, "the include did not apply to the clone");
      assert.ok(plain.stderr.includes(marker), "the control did not show the token");
      // The tests' git and the gate run ignore it.
      const result = runWorker("", {}, missingRunDir, "", { gatePath });
      passedTrust(result);
      assert.ok(!(result.stdout + result.stderr).includes(marker), "the maintainer config reached the gate output");
    } finally {
      process.env.HOME = savedHome;
    }
  }],
  ["a rewrite to the bare repository URL is refused before any fetch", () => {
    // The bare form names the same repository, but the redirect limit is keyed
    // to the literal URL: an endpoint setting for the bare URL would win.
    const { prefix, gitCalls, runDir, fixture, fetchConfig } = fetchHarness();
    const bare = "https://github.com/brandonwie/codex-hud";
    const env = {
      FAKE_GIT_CALLS: gitCalls,
      FAKE_FETCH_REPO: fixture.dir,
      ...fetchConfig(`[url "${bare}"]\n\tinsteadOf = ${trustedUrl}\n[http "${bare}"]\n\tfollowRedirects = true\n`),
    };
    const result = runWorker("", env, runDir, "", { pathPrefix: prefix });
    fails(result, /rewrites https:\/\/github\.com\/brandonwie\/codex-hud\.git with a url\.<base>\.insteadOf rule/);
    assert.doesNotMatch(fs.readFileSync(gitCalls, "utf8"), /fetch|checkout/);
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
        env: { ...baseEnv(), ...conflicting },
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
  ["an inherited NODE_OPTIONS cannot reach the deadline runner's output", () => {
    // node prints a bad --require path in its error; the gate unsets
    // NODE_OPTIONS before it starts run-with-deadline.js (macOS only).
    const marker = "SYNTHETIC-NODE-OPTIONS-0f3a";
    const control = spawnSync(process.execPath, ["-p", "1"], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: `--require /nonexistent/${marker}` } });
    assert.ok(control.status !== 0 && control.stderr.includes(marker), "control: node ignored NODE_OPTIONS");
    const result = runGate(["56"], {
      NODE_OPTIONS: `--require /nonexistent/${marker}`,
      FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2`,
    });
    fails(result);
    if (process.platform === "darwin") {
      assert.match(result.stdout, /under a 360-minute deadline/);
      assert.match(result.stderr, /comes from someone\/fork/);
    }
    assert.ok(!(result.stdout + result.stderr).includes(marker), "NODE_OPTIONS reached the gate output");
  }],
  ["an inherited NODE_DEBUG cannot print the gate's environment", () => {
    // NODE_DEBUG=child_process makes node print each child's environment; the
    // gate unsets every NODE_* variable before it starts run-with-deadline.js.
    const tokenMarker = "SYNTHETIC-GH-TOKEN-4d7e";
    const configMarker = "SYNTHETIC-GIT-CONFIG-4d7e";
    const secrets = { GH_TOKEN: tokenMarker, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: configMarker };
    const leaks = (r) => [tokenMarker, configMarker].filter((m) => (r.stdout + r.stderr).includes(m));
    const deadline = path.join(repoRoot, "scripts", "run-with-deadline.js");
    const control = spawnSync(process.execPath, [deadline, "60", "true"], { encoding: "utf8", env: { ...baseEnv(), ...secrets, NODE_DEBUG: "child_process" } });
    assert.deepStrictEqual(leaks(control), [tokenMarker, configMarker], "control: NODE_DEBUG did not print the environment");
    const result = runGate(["56"], {
      ...secrets,
      NODE_DEBUG: "child_process",
      NODE_DEBUG_NATIVE: "child_process",
      FAKE_PR: `${head} main someone/fork ${repo} ${merge} 2`,
    });
    fails(result);
    if (process.platform === "darwin") {
      assert.match(result.stdout, /under a 360-minute deadline/);
      assert.match(result.stderr, /comes from someone\/fork/);
    }
    assert.deepStrictEqual(leaks(result), [], "NODE_DEBUG printed the gate's environment");
    assert.doesNotMatch(result.stdout + result.stderr, /CHILD_PROCESS/);
  }],
  ["verify matches a long base branch by its fixed-length ID", () => {
    const longRef = `release/${"x".repeat(60)}`;
    const otherLongRef = `release/${"y".repeat(60)}`;
    const refId = (name) =>
      spawnSync(realGit, ["hash-object", "--stdin"], { input: name, encoding: "utf8", env: baseEnv() }).stdout.trim().slice(0, 24);
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
    const round3 = spawnSync(realGit, ["show", "b9396f31568f6b9ad0c025f56668c1d7d64c0fe6:.github/workflows/ci.yml"], {
      env: baseEnv(),
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
    const init = script.indexOf("init -q --template=");
    assert.ok(init > 0, "no git init in the gate");
    assert.ok(wrap < init, "the deadline starts after the checkout");
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
