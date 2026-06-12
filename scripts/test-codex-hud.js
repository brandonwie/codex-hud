#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hudScript = path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js");
const expectedVersion = require(path.join(repoRoot, "package.json")).version;

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
assert.strictEqual(parsed.codexHudVersion, expectedVersion);
assert.strictEqual(typeof parsed.cwd, "string");
assert.strictEqual(typeof parsed.config, "object");
assert.strictEqual(typeof parsed.git, "object");
assert.strictEqual(Array.isArray(parsed.config.nativeStatusItems), true);
assert.strictEqual(parsed.config.projectPath, null);
assert.strictEqual(typeof parsed.usage, "object");

// Every render assertion below runs against a deterministic fixture CODEX_HOME,
// so usage / rate-limit / token values never depend on the developer's live
// ~/.codex sessions (CI-safe on a machine with no Codex history). Git state
// (branch / dirty) is still the live cwd repo and is matched loosely.
// CODEX_HUD_NOW_MS pins "now" so rate-window and pace math are deterministic.
const tmpCodexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-test-"));
try {
  const nowMs = Date.parse("2026-06-08T00:00:00.000Z");
  fs.writeFileSync(
    path.join(tmpCodexHome, "config.toml"),
    'model = "gpt-5.5"\nmodel_reasoning_effort = "xhigh"\n',
    "utf8"
  );
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
            input_tokens: 533000,
            cached_input_tokens: 366000,
            output_tokens: 5000,
            total_tokens: 904000,
          },
          last_token_usage: {
            input_tokens: 210,
            cached_input_tokens: 0,
            output_tokens: 0,
            total_tokens: 210,
          },
          model_context_window: 1000,
        },
        rate_limits: {
          primary: {
            used_percent: 17,
            window_minutes: 300,
            resets_at: Math.floor(nowMs / 1000),
          },
          secondary: {
            used_percent: 16,
            window_minutes: 10080,
            resets_at: Math.floor((nowMs + 5.1 * 24 * 3600000) / 1000),
          },
        },
      },
    }) + "\n",
    "utf8"
  );

  const fixtureEnv = { CODEX_HOME: tmpCodexHome, CODEX_HUD_NOW_MS: String(nowMs) };

  const text = run([], { env: fixtureEnv });
  assert.strictEqual(text.status, 0, text.stderr);
  assert.match(text.stdout, new RegExp(`Codex HUD ${expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(text.stdout, /Workspace/);
  assert.match(text.stdout, /usage: .+\|.+\|git\(.+\*?\)\|Ctx:.+\|5h:.+\|7d:.+\|Tkn:.+/);
  const textLines = text.stdout.trimEnd().split(/\r?\n/);
  assert(textLines.length > 8, "default HUD output should stay multiline");
  assert(textLines.some((line) => line === "Codex"), "default HUD should include a Codex section");
  assert(textLines.some((line) => line === "Workspace"), "default HUD should include a Workspace section");

  const line = run(["--line"], { env: fixtureEnv });
  assert.strictEqual(line.status, 0, line.stderr);
  assert.strictEqual(line.stdout.trimEnd().split(/\r?\n/).length, 1, "--line output should stay single-line");
  assert.match(line.stdout, /5\.5xhigh/);
  assert.doesNotMatch(line.stdout, /git:\(/);
  assert.doesNotMatch(line.stdout, /·/);
  assert.doesNotMatch(line.stdout, /node v/);
  assert.doesNotMatch(line.stdout, / \| /);
  assert.doesNotMatch(line.stdout, /: /);
  // Fixture-driven, so the usage/token/rate values are exact; git(...) stays
  // loose for the live branch and optional dirty marker.
  assert.match(
    line.stdout.trim(),
    /^5\.5xhigh\|codex-hud\|git\(.+\*?\)\|Ctx:21%\|5h:17%\(5h,🐢100%\)\|7d:16%\(5\.1d,🤖27%\)\|Tkn:904k\(I:533k,O:5k,C:366k\)$/
  );
  assert.doesNotMatch(line.stdout, /now/);

  const formatCfg = path.join(tmpCodexHome, "format.toml");
  fs.writeFileSync(
    formatCfg,
    '[format]\neffortShort = true\npaceSlowPrefix = "slow-"\npaceNormalPrefix = "ok-"\npaceFastPrefix = "fast-"\n',
    "utf8"
  );
  const shortLine = run(["--line"], { env: { ...fixtureEnv, CODEX_HUD_CONFIG: formatCfg } });
  assert.strictEqual(shortLine.status, 0, shortLine.stderr);
  assert.match(
    shortLine.stdout.trim(),
    /^5\.5xh\|codex-hud\|git\(.+\*?\)\|Ctx:21%\|5h:17%\(5h,slow-100%\)\|7d:16%\(5\.1d,ok-27%\)\|Tkn:904k\(I:533k,O:5k,C:366k\)$/
  );

  const spacedCfg = path.join(tmpCodexHome, "spaced.toml");
  fs.writeFileSync(spacedCfg, "space = true\n", "utf8");
  const spacedLine = run(["--line"], { env: { ...fixtureEnv, CODEX_HUD_CONFIG: spacedCfg } });
  assert.strictEqual(spacedLine.status, 0, spacedLine.stderr);
  assert.match(spacedLine.stdout, /^5\.5 xhigh \| /);

  const colorLine = run(["--line", "--color"], { env: fixtureEnv });
  assert.strictEqual(colorLine.status, 0, colorLine.stderr);
  assert.strictEqual(colorLine.stdout.trimEnd().split(/\r?\n/).length, 1, "--line --color output should stay single-line");
  assert.match(colorLine.stdout, /\x1b\[38;5;135m/);
  assert.match(colorLine.stdout, /\x1b\[38;5;245m/);
  assert.match(colorLine.stdout, /\|\x1b\[0m\x1b\[38;5;45mcodex-hud\x1b\[0m\x1b\[38;5;245m\|/);
  assert.match(colorLine.stdout, /git\(\x1b\[0m\x1b\[38;5;135m/);
  // Dirty-star color is covered deterministically by the golden harness
  // (scripts/test-golden.js, "dirty-repo" case). Against the live repo it is
  // only asserted when the working tree is actually dirty, so a clean checkout
  // (e.g. CI or a post-commit tree) does not fail here.
  if (/git\([^)]*\*/.test(colorLine.stdout.replace(/\x1b\[[0-9;]*m/g, ""))) {
    assert.match(colorLine.stdout, /\x1b\[38;5;215m\*\x1b\[0m/);
  }
  assert.match(colorLine.stdout, /Tkn\x1b\[0m\x1b\[38;5;245m:\x1b\[0m\x1b\[38;5;215m[^(\n]+\x1b\[0m/);
  assert.match(colorLine.stdout, /\(I:\x1b\[0m\x1b\[38;5;45m[^,\n]+\x1b\[0m/);
  assert.match(colorLine.stdout, /,O:\x1b\[0m\x1b\[38;5;45m[^,\n]+\x1b\[0m/);
  assert.match(colorLine.stdout, /,C:\x1b\[0m\x1b\[38;5;45m[^)\n]+\x1b\[0m/);
  assert.match(colorLine.stdout, /\x1b\[38;5;245m,\x1b\[0m\x1b\[38;5;85m(?:🐢|🤖|🔥)\d+%\x1b\[0m\x1b\[38;5;245m\)\x1b\[0m/);
  assert.match(
    colorLine.stdout.replace(/\x1b\[[0-9;]*m/g, "").trim(),
    /^.+\|.+\|git\(.+\*?\)\|Ctx:.+\|5h:.+\|7d:.+\|Tkn:.+$/
  );
} finally {
  fs.rmSync(tmpCodexHome, { recursive: true, force: true });
}

console.log("codex-hud smoke tests passed");
