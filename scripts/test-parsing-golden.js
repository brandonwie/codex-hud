#!/usr/bin/env node
"use strict";

// Golden parity harness for the Codex HUD *parsing* layer (collect()).
//
// Where scripts/test-golden.js locks the formatting layer (synthetic data ->
// formatUsageLine/formatText), this harness locks the INPUT layer: it drives the
// real collect() over controlled inputs and captures the parsed `data` object.
//
//   - git porcelain parsing: a throwaway temp git repo is mutated into a known
//     state (modified / staged-add / staged-delete / staged-rename / untracked)
//     so git.counts and git.dirty are deterministic.
//   - rollout-JSONL parsing: a fixture CODEX_HOME with a canned token_count
//     rollout exercises context %, token totals, and rate-limit parsing.
//   - CODEX_HUD_NOW_MS pins "now" so rate-window math is deterministic.
//
// Volatile fields (temp paths, generatedAt, nodeVersion) are redacted; the
// parsed values are kept and diffed against scripts/golden/collect-parsing.golden.
//
//   node scripts/test-parsing-golden.js            # check (CI)
//   node scripts/test-parsing-golden.js --update    # re-capture

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hudScript = path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js");
const GOLDEN = path.join(__dirname, "golden", "collect-parsing.golden");
const NOW_MS = Date.parse("2026-06-08T00:00:00.000Z");

function git(cwd, args) {
  const r = spawnSync(
    "git",
    [
      "-c", "user.email=test@codex-hud.test",
      "-c", "user.name=codex-hud test",
      "-c", "commit.gpgsign=false",
      "-c", "init.defaultBranch=trunk",
      ...args,
    ],
    { cwd, encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + (r.stderr || ""));
  return r.stdout;
}

// Build a temp git repo in a known state. "clean" = committed, no changes;
// "dirty" = one of each porcelain category.
function makeGitRepo(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cph-git-"));
  git(dir, ["init"]);
  fs.writeFileSync(path.join(dir, "tracked.txt"), "base\n");
  fs.writeFileSync(path.join(dir, "to-delete.txt"), "delete me\n");
  fs.writeFileSync(path.join(dir, "to-rename.txt"), "rename me\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "base"]);
  if (state === "dirty") {
    fs.appendFileSync(path.join(dir, "tracked.txt"), "modified\n"); // " M" modified
    fs.writeFileSync(path.join(dir, "added.txt"), "new\n");
    git(dir, ["add", "added.txt"]); // "A " added
    git(dir, ["rm", "to-delete.txt"]); // "D " deleted
    git(dir, ["mv", "to-rename.txt", "renamed.txt"]); // "R " renamed
    fs.writeFileSync(path.join(dir, "untracked.txt"), "u\n"); // "??" untracked
  }
  return dir;
}

// Build a fixture CODEX_HOME with config + a single token_count rollout.
function makeCodexHome(rollout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cph-home-"));
  fs.writeFileSync(
    path.join(dir, "config.toml"),
    'model = "gpt-5.5"\nmodel_reasoning_effort = "xhigh"\n',
    "utf8"
  );
  const sessionDir = path.join(dir, "sessions", "2026", "06", "08");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "rollout-2026-06-08T00-00-00-test.jsonl"),
    JSON.stringify({
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: { type: "token_count", info: rollout.info, rate_limits: rollout.rates },
    }) + "\n",
    "utf8"
  );
  return dir;
}

const ROLLOUTS = {
  full: {
    info: {
      total_token_usage: { input_tokens: 533000, cached_input_tokens: 366000, output_tokens: 5000, total_tokens: 904000 },
      last_token_usage: { input_tokens: 210, cached_input_tokens: 0, output_tokens: 0, total_tokens: 210 },
      model_context_window: 1000,
    },
    rates: {
      primary: { used_percent: 17, window_minutes: 300, resets_at: Math.floor(NOW_MS / 1000) },
      secondary: { used_percent: 16, window_minutes: 10080, resets_at: Math.floor((NOW_MS + 5.1 * 24 * 3600000) / 1000) },
    },
  },
  noRates: {
    info: {
      total_token_usage: { input_tokens: 533000, cached_input_tokens: 366000, output_tokens: 5000, total_tokens: 904000 },
      last_token_usage: { input_tokens: 210, cached_input_tokens: 0, output_tokens: 0, total_tokens: 210 },
      model_context_window: 1000,
    },
    rates: {},
  },
  nearFull: {
    info: {
      total_token_usage: { input_tokens: 1200000, cached_input_tokens: 250000, output_tokens: 50000, total_tokens: 1500000 },
      last_token_usage: { input_tokens: 990, cached_input_tokens: 0, output_tokens: 0, total_tokens: 990 },
      model_context_window: 1000,
    },
    rates: {
      primary: { used_percent: 93, window_minutes: 300, resets_at: Math.floor(NOW_MS / 1000) },
      secondary: { used_percent: 71, window_minutes: 10080, resets_at: Math.floor((NOW_MS + 2 * 24 * 3600000) / 1000) },
    },
  },
};

// Drive collect() via --json under the fixture inputs and return a normalized,
// parsing-only view (volatile fields redacted).
function collectParsed(gitState, rolloutKey) {
  const gitDir = makeGitRepo(gitState);
  const homeDir = makeCodexHome(ROLLOUTS[rolloutKey]);
  try {
    const r = spawnSync(process.execPath, [hudScript, "--json"], {
      cwd: gitDir,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: homeDir, CODEX_HUD_NOW_MS: String(NOW_MS) },
    });
    if (r.status !== 0) throw new Error("--json failed: " + (r.stderr || ""));
    const data = JSON.parse(r.stdout);
    // On macOS, git/realpath resolve /var/folders/... to /private/var/folders/...,
    // so redact the realpath form too — keeps the golden stable across macOS/Linux.
    const realGit = fs.realpathSync(gitDir);
    const realHome = fs.realpathSync(homeDir);
    const redact = (s) =>
      typeof s !== "string"
        ? s
        : s
            .split(realGit).join("<GIT>")
            .split(gitDir).join("<GIT>")
            .split(realHome).join("<HOME>")
            .split(homeDir).join("<HOME>")
            .split(os.homedir()).join("<~>")
            .split(repoRoot).join("<REPO>");
    return {
      git: {
        available: data.git.available,
        branch: data.git.branch,
        dirty: data.git.dirty,
        counts: data.git.counts,
        root: redact(data.git.root),
      },
      config: { model: data.config.model, reasoning: data.config.reasoning },
      usage: {
        context: data.usage.context,
        tokens: data.usage.tokens,
        rateLimits: data.usage.rateLimits,
        sourceFile: redact(data.usage.sourceFile),
      },
      project: { name: data.project && data.project.package ? data.project.package.name : null },
    };
  } finally {
    fs.rmSync(gitDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

const CASES = [
  { name: "clean-git + full-rollout", git: "clean", rollout: "full" },
  { name: "dirty-git + full-rollout", git: "dirty", rollout: "full" },
  { name: "clean-git + no-rate-limits", git: "clean", rollout: "noRates" },
  { name: "clean-git + near-full-context", git: "clean", rollout: "nearFull" },
];

const splitBlocks = (s) => s.trim().split(/\n\n(?=### )/);

function build() {
  const blocks = CASES.map((c) => "### " + c.name + "\n" + JSON.stringify(collectParsed(c.git, c.rollout), null, 2));
  return blocks.join("\n\n") + "\n";
}

function main() {
  const update = process.argv.includes("--update");
  const built = build();
  const count = splitBlocks(built).length;

  if (update) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, built);
    console.log("parsing golden updated: " + path.relative(process.cwd(), GOLDEN) + " (" + count + " cases)");
    return;
  }
  if (!fs.existsSync(GOLDEN)) {
    console.error("parsing golden missing — run: node scripts/test-parsing-golden.js --update");
    process.exit(1);
  }
  const expected = fs.readFileSync(GOLDEN, "utf8");
  if (expected === built) {
    console.log("collect() parsing parity OK (" + count + " cases)");
    return;
  }
  const a = splitBlocks(expected);
  const b = splitBlocks(built);
  let at = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { at = i; break; }
  }
  console.error("PARSING GOLDEN MISMATCH at case " + at);
  console.error("--- expected ---\n" + (a[at] || "(missing)"));
  console.error("--- actual ---\n" + (b[at] || "(missing)"));
  console.error("\nIf intentional: npm run golden:update");
  process.exit(1);
}

main();
