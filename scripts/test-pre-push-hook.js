#!/usr/bin/env node

// Runs .husky/pre-push against a throwaway Git repository with a stub
// scripts/ci-local.sh, so the hook's guards are checked without the real suite.

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
    `#!/bin/sh\necho ran > "$CHECKS_MARKER"\nexit ${stubExit}\n`,
  );
  git(repo, ["init", "-q"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "one"]);
  fs.writeFileSync(path.join(repo, "file.txt"), "two\n");
  git(repo, ["add", "file.txt"]);
  git(repo, ["commit", "-q", "-m", "two"]);
  return repo;
}

function runHook(repo, input) {
  fs.rmSync(marker, { force: true });
  const result = spawnSync("sh", [hook, "origin", "https://example.invalid/repo.git"], {
    cwd: repo,
    env,
    input,
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr, ran: fs.existsSync(marker) };
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
