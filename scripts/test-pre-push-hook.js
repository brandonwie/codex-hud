#!/usr/bin/env node

// Runs .husky/pre-push against a throwaway Git repository with a stub
// scripts/ci-local.sh, so the hook's guards are checked without the real suite.
// The fixture copies the real scripts/run-isolated.sh, which the hook runs the
// checks through; the stub records the environment it sees.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hook = path.join(repoRoot, ".husky", "pre-push");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-pre-push-test-"));
process.on("exit", () => {
  fs.rmSync(root, { recursive: true, force: true });
});

const zero = "0".repeat(40);
const marker = path.join(root, "checks-ran");
const isolated = fs.readFileSync(path.join(repoRoot, "scripts", "run-isolated.sh"));

// npm test runs inside the pre-commit hook, where Git exports GIT_INDEX_FILE and
// other repository variables. Drop every GIT_* variable so the fixture's git
// commands never touch the caller's repository or index.
const parentEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const env = {
  ...parentEnv,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  CHECKS_MARKER: marker,
};

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
  assert.strictEqual(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// A repository with two commits and a stub check script that records its run.
function makeRepo(name, stubExit = 0) {
  const repo = path.join(root, name);
  fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "scripts", "ci-local.sh"),
    [
      "#!/bin/sh",
      'env > "$CHECKS_MARKER.env"',
      'ls -A "$HOME" > "$CHECKS_MARKER.home"',
      'ls -A "$CARGO_HOME" > "$CHECKS_MARKER.cargo-home"',
      'echo ran > "$CHECKS_MARKER"',
      `exit ${stubExit}`,
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(repo, "scripts", "run-isolated.sh"), isolated);
  git(repo, ["init", "-q"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "one"]);
  fs.writeFileSync(path.join(repo, "file.txt"), "two\n");
  git(repo, ["add", "file.txt"]);
  git(repo, ["commit", "-q", "-m", "two"]);
  return repo;
}

function runHook(repo, input, extraEnv = {}) {
  fs.rmSync(marker, { force: true });
  const result = spawnSync("sh", [hook, "origin", "https://example.invalid/repo.git"], {
    cwd: repo,
    env: { ...env, ...extraEnv },
    input,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, ran: fs.existsSync(marker) };
}

function pushLine(repo, rev) {
  return `refs/heads/main ${git(repo, ["rev-parse", rev])} refs/heads/main ${zero}\n`;
}

const cases = [];
function test(name, fn) {
  cases.push([name, fn]);
}

test("clean tree at HEAD runs the checks", () => {
  const repo = makeRepo("clean");
  const result = runHook(repo, pushLine(repo, "HEAD"));
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.ran, "checks did not run");
});

test("a failing check fails the push with its exit code", () => {
  const repo = makeRepo("failing", 3);
  const result = runHook(repo, pushLine(repo, "HEAD"));
  assert.strictEqual(result.status, 3);
  assert.ok(result.ran, "checks did not run");
});

test("an untracked file stops the push before the checks", () => {
  const repo = makeRepo("dirty");
  fs.writeFileSync(path.join(repo, "untracked.txt"), "x\n");
  const result = runHook(repo, pushLine(repo, "HEAD"));
  assert.strictEqual(result.status, 1);
  assert.ok(!result.ran, "checks ran on a dirty tree");
  assert.match(result.stderr, /uncommitted or untracked/);
});

test("a git status error stops the push before the checks", () => {
  const repo = makeRepo("status-error");
  fs.writeFileSync(path.join(repo, ".git", "index"), "not an index");
  const result = runHook(repo, pushLine(repo, "HEAD"));
  assert.strictEqual(result.status, 1);
  assert.ok(!result.ran, "checks ran although git status failed");
  assert.match(result.stderr, /git status failed/);
});

test("a pushed ref that is not HEAD stops the push", () => {
  const repo = makeRepo("not-head");
  const result = runHook(repo, pushLine(repo, "HEAD~1"));
  assert.strictEqual(result.status, 1);
  assert.ok(!result.ran, "checks ran for a commit that is not HEAD");
  assert.match(result.stderr, /not the checked-out HEAD/);
});

test("a delete-only push skips the checks", () => {
  const repo = makeRepo("delete");
  const result = runHook(repo, `(delete) ${zero} refs/heads/old ${git(repo, ["rev-parse", "HEAD"])}\n`);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!result.ran, "checks ran for a delete-only push");
});

test("the checks see no proxy, Cargo, npm or command-level Git config", () => {
  const repo = makeRepo("isolated");
  const secret = "hookpw-R16-01-synthetic";
  const proxy = `http://user:${secret}/x@proxy.invalid:8080`;
  const cargoHome = path.join(root, "poison-cargo-home");
  fs.mkdirSync(cargoHome, { recursive: true });
  fs.writeFileSync(path.join(cargoHome, "config.toml"), `[http]\nproxy = "${proxy}"\n`);
  // A Cargo config, a credentials file and a HOME file left in the reused state
  // directory by an earlier run must not reach the next run.
  const state = path.join(repo, ".git", "codex-hud-ci-local");
  fs.mkdirSync(path.join(state, "cargo-home"), { recursive: true });
  fs.mkdirSync(path.join(state, "home"), { recursive: true });
  fs.writeFileSync(path.join(state, "cargo-home", "config.toml"), `[http]\nproxy = "${proxy}"\n`);
  fs.writeFileSync(path.join(state, "cargo-home", "credentials.toml"), `token = "${secret}"\n`);
  fs.writeFileSync(path.join(state, "home", ".gitconfig"), `[http]\n\tproxy = ${proxy}\n`);
  fs.writeFileSync(path.join(state, "cargo-home", "kept-crate-cache"), "x\n");
  const result = runHook(repo, pushLine(repo, "HEAD"), {
    http_proxy: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    no_proxy: "example.invalid",
    CARGO_HTTP_PROXY: proxy,
    CARGO_HOME: cargoHome,
    npm_config_https_proxy: proxy,
    NPM_CONFIG_PROXY: proxy,
    NODE_OPTIONS: `--title=${secret}`,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.proxy",
    GIT_CONFIG_VALUE_0: proxy,
    GIT_CONFIG_PARAMETERS: `'http.proxy'='${proxy}'`,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.ran, "checks did not run");
  const seen = fs.readFileSync(`${marker}.env`, "utf8");
  assert.ok(!seen.includes(secret), "a configured secret reached the checks' environment");
  const names = seen.split("\n").map((line) => line.split("=")[0]);
  const leaked = names.filter((name) => /proxy/i.test(name) || /^GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS)/.test(name) || /^npm_config_.*proxy/i.test(name));
  assert.deepStrictEqual(leaked, [], "proxy or command-level Git config variables reached the checks");
  const realState = fs.realpathSync(state);
  assert.ok(names.includes("HOME") && seen.includes(`\nHOME=${path.join(realState, "home")}\n`), "HOME is not the isolated home");
  assert.ok(seen.includes(`\nCARGO_HOME=${path.join(realState, "cargo-home")}\n`), "CARGO_HOME is not the isolated Cargo home");
  assert.ok(seen.includes(`\nGIT_CONFIG_NOSYSTEM=1\n`), "system Git config is not disabled");
  assert.strictEqual(fs.readFileSync(`${marker}.home`, "utf8"), "", "the isolated HOME was not empty");
  assert.strictEqual(fs.readFileSync(`${marker}.cargo-home`, "utf8"), "kept-crate-cache\n", "Cargo config or credentials stayed in the isolated Cargo home, or its cache was lost");
  assert.ok(!(result.stdout + result.stderr).includes(secret), "a configured secret reached the hook output");
});

// Runs this file again, once, with Git variables that point at a sentinel
// repository, as a commit hook would. The sentinel's index and HEAD must not change.
const childFlag = "CODEX_HUD_PRE_PUSH_TEST_CHILD";
if (!process.env[childFlag]) {
  test("inherited Git variables leave the caller's repository alone", () => {
    const sentinel = makeRepo("sentinel");
    fs.writeFileSync(path.join(sentinel, "staged.txt"), "staged\n");
    git(sentinel, ["add", "staged.txt"]);
    const indexPath = path.join(sentinel, ".git", "index");
    const indexBefore = fs.readFileSync(indexPath);
    const headBefore = git(sentinel, ["rev-parse", "HEAD"]);
    const child = spawnSync(process.execPath, [__filename], {
      env: {
        ...process.env,
        [childFlag]: "1",
        GIT_DIR: path.join(sentinel, ".git"),
        GIT_WORK_TREE: sentinel,
        GIT_INDEX_FILE: indexPath,
      },
      encoding: "utf8",
    });
    assert.strictEqual(child.status, 0, child.stdout + child.stderr);
    assert.ok(fs.readFileSync(indexPath).equals(indexBefore), "the sentinel index changed");
    assert.strictEqual(git(sentinel, ["rev-parse", "HEAD"]), headBefore, "the sentinel HEAD moved");
  });
}

for (const [name, fn] of cases) {
  fn();
  console.log(`ok - ${name}`);
}
console.log(`pre-push hook: ${cases.length} cases passed`);
