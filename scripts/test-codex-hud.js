#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const expectedVersion = require(path.join(repoRoot, "package.json")).version;
const sessionEnvKeys = [
  "CODEX_HUD_MODEL",
  "CODEX_HUD_EFFORT",
  "CODEX_HUD_SERVICE_TIER",
  "CODEX_HUD_ROLLOUT_PATH",
];

function rustBinaryName() {
  return process.platform === "win32" ? "codex-hud.exe" : "codex-hud";
}

function resolveBinary() {
  const binName = rustBinaryName();
  const candidates = [
    process.argv[2],
    process.env.CODEX_HUD_RUST_BIN,
    path.join(repoRoot, "rust", "target", "release", binName),
    path.join(repoRoot, "rust", "target", "debug", binName),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error("codex-hud binary not found - run: npm run build:rust");
}

const hudBin = resolveBinary();

function run(args, options = {}) {
  const env = { ...process.env, ...(options.env || {}) };
  for (const key of options.unsetEnv || []) delete env[key];
  return spawnSync(hudBin, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
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
  function writeRollout(filePath, event) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  fs.writeFileSync(
    path.join(tmpCodexHome, "config.toml"),
    'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"\nservice_tier = "fast"\n',
    "utf8"
  );
  const rolloutA = path.join(tmpCodexHome, "sessions", "2026", "06", "07", "rollout-2026-06-07T00-00-00-a.jsonl");
  const rolloutB = path.join(tmpCodexHome, "sessions", "2026", "06", "08", "rollout-2026-06-08T00-00-00-b.jsonl");
  writeRollout(
    rolloutA,
    {
      timestamp: "2026-06-07T00:00:00.000Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100000,
            cached_input_tokens: 20000,
            output_tokens: 3000,
            total_tokens: 123000,
          },
          last_token_usage: {
            input_tokens: 750,
            cached_input_tokens: 0,
            output_tokens: 0,
            total_tokens: 750,
          },
          model_context_window: 1000,
        },
        rate_limits: {
          primary: {
            used_percent: 3,
            window_minutes: 300,
            resets_at: Math.floor(nowMs / 1000),
          },
        },
      },
    }
  );
  writeRollout(
    rolloutB,
    {
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
    }
  );
  fs.utimesSync(rolloutA, new Date(nowMs - 1000), new Date(nowMs - 1000));
  fs.utimesSync(rolloutB, new Date(nowMs), new Date(nowMs));

  const fixtureEnv = { CODEX_HOME: tmpCodexHome, CODEX_HUD_NOW_MS: String(nowMs) };
  function runJsonWithEnv(env) {
    const explicitKeys = new Set(Object.keys(env));
    const unsetEnv = sessionEnvKeys.filter((key) => !explicitKeys.has(key));
    const result = run(["--json"], { env, unsetEnv });
    assert.strictEqual(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }

  const envIdentityLine = run(["--line"], {
    env: {
      ...fixtureEnv,
      CODEX_HUD_MODEL: "gpt-5.7-env",
      CODEX_HUD_EFFORT: "xhigh",
      CODEX_HUD_SERVICE_TIER: "",
    },
  });
  assert.strictEqual(envIdentityLine.status, 0, envIdentityLine.stderr);
  assert.match(envIdentityLine.stdout, /^5\.7-env\|xh\|codex-hud\|/);
  assert.doesNotMatch(envIdentityLine.stdout, /^5\.7-env\|xh\|f\|/);

  const tierIdentityLine = run(["--line"], {
    env: {
      ...fixtureEnv,
      CODEX_HUD_MODEL: "gpt-5.7-env",
      CODEX_HUD_EFFORT: "xhigh",
      CODEX_HUD_SERVICE_TIER: "priority",
    },
  });
  assert.strictEqual(tierIdentityLine.status, 0, tierIdentityLine.stderr);
  assert.match(tierIdentityLine.stdout, /^5\.7-env\|xh\|p\|codex-hud\|/);

  const newestUsage = runJsonWithEnv(fixtureEnv).usage;
  assert.strictEqual(newestUsage.context.usedTokens, 210, "absent rollout env should use newest context");
  assert.strictEqual(newestUsage.tokens.total, 904000, "absent rollout env should use newest tokens");
  assert.strictEqual(newestUsage.rateLimits.primary.usedPercent, 17);

  const requestedUsage = runJsonWithEnv({ ...fixtureEnv, CODEX_HUD_ROLLOUT_PATH: rolloutA }).usage;
  assert.strictEqual(requestedUsage.sourceFile, rolloutA);
  assert.strictEqual(requestedUsage.context.usedTokens, 750);
  assert.strictEqual(requestedUsage.tokens.total, 123000);
  assert.strictEqual(requestedUsage.rateLimits.primary.usedPercent, 17, "rate limits should still use newest rollout");

  const invalidUsage = runJsonWithEnv({ ...fixtureEnv, CODEX_HUD_ROLLOUT_PATH: "/nonexistent/codex-hud-rollout.jsonl" }).usage;
  assert.strictEqual(invalidUsage.context, null);
  assert.strictEqual(invalidUsage.tokens, null);
  assert.strictEqual(invalidUsage.rateLimits.primary.usedPercent, 17, "invalid rollout path should not suppress global rate limits");

  const emptyPresentUsage = runJsonWithEnv({ ...fixtureEnv, CODEX_HUD_ROLLOUT_PATH: "" }).usage;
  assert.strictEqual(emptyPresentUsage.context, null);
  assert.strictEqual(emptyPresentUsage.tokens, null);
  assert.strictEqual(emptyPresentUsage.rateLimits.primary.usedPercent, 17, "empty-present rollout path should not suppress global rate limits");

  // issue #30 regression rows: session-env identity semantics

  // literal `max` must render verbatim (no alias); the stale-renderer incident
  // showed the config effort (`xh`) instead.
  const maxEffortLine = run(["--line"], {
    env: {
      ...fixtureEnv,
      CODEX_HUD_MODEL: "gpt-5.7-env",
      CODEX_HUD_EFFORT: "max",
      CODEX_HUD_SERVICE_TIER: "",
    },
  });
  assert.strictEqual(maxEffortLine.status, 0, maxEffortLine.stderr);
  assert.match(maxEffortLine.stdout, /^5\.7-env\|max\|/, "effort max must render literally in session mode");
  assert.doesNotMatch(maxEffortLine.stdout, /^5\.7-env\|xh\|/, "effort max must never alias to xh");

  // session mode with EFFORT absent must HIDE the effort atom, never fall back
  // to config.toml effort (the identity-side symptom of issue #30).
  const absentEffortLine = run(["--line"], {
    env: { ...fixtureEnv, CODEX_HUD_MODEL: "gpt-5.7-env" },
    unsetEnv: ["CODEX_HUD_EFFORT", "CODEX_HUD_SERVICE_TIER", "CODEX_HUD_ROLLOUT_PATH"],
  });
  assert.strictEqual(absentEffortLine.status, 0, absentEffortLine.stderr);
  assert.match(absentEffortLine.stdout, /^5\.7-env\|codex-hud\|/, "absent session effort must hide the effort atom");

  // EFFORT="" (present-but-empty) and EFFORT=none both hide the atom.
  for (const hiddenEffort of ["", "none"]) {
    const hiddenEffortLine = run(["--line"], {
      env: {
        ...fixtureEnv,
        CODEX_HUD_MODEL: "gpt-5.7-env",
        CODEX_HUD_EFFORT: hiddenEffort,
        CODEX_HUD_SERVICE_TIER: "",
      },
      unsetEnv: ["CODEX_HUD_ROLLOUT_PATH"],
    });
    assert.strictEqual(hiddenEffortLine.status, 0, hiddenEffortLine.stderr);
    assert.match(
      hiddenEffortLine.stdout,
      /^5\.7-env\|codex-hud\|/,
      `EFFORT=${JSON.stringify(hiddenEffort)} must hide the effort atom`,
    );
  }

  // concurrent-session simulation: two invocations against the same
  // CODEX_HOME, each pinned to its own rollout with its own effort. Each line
  // must show its own identity + context while 5h/7d stay account-global.
  const sessionOneLine = run(["--line"], {
    env: {
      ...fixtureEnv,
      CODEX_HUD_MODEL: "gpt-5.7-env",
      CODEX_HUD_EFFORT: "max",
      CODEX_HUD_SERVICE_TIER: "",
      CODEX_HUD_ROLLOUT_PATH: rolloutA,
    },
  });
  const sessionTwoLine = run(["--line"], {
    env: {
      ...fixtureEnv,
      CODEX_HUD_MODEL: "gpt-5.7-env",
      CODEX_HUD_EFFORT: "xhigh",
      CODEX_HUD_SERVICE_TIER: "",
      CODEX_HUD_ROLLOUT_PATH: rolloutB,
    },
  });
  assert.strictEqual(sessionOneLine.status, 0, sessionOneLine.stderr);
  assert.strictEqual(sessionTwoLine.status, 0, sessionTwoLine.stderr);
  assert.match(sessionOneLine.stdout, /^5\.7-env\|max\|/, "session one must show its own effort despite rolloutB being newer");
  assert.match(sessionOneLine.stdout, /Ctx:75%/, "session one must use rolloutA context (750/1000)");
  assert.match(sessionTwoLine.stdout, /^5\.7-env\|xh\|/, "session two must show its own effort");
  assert.match(sessionTwoLine.stdout, /Ctx:21%/, "session two must use rolloutB context (210/1000)");
  assert.match(sessionOneLine.stdout, /5h:17%/, "rate limits stay account-global (newest rollout) for session one");
  assert.match(sessionTwoLine.stdout, /5h:17%/, "rate limits stay account-global (newest rollout) for session two");

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
  assert.match(line.stdout, /^5\.6-sol\|h\|f\|/);
  assert.doesNotMatch(line.stdout, /git:\(/);
  assert.doesNotMatch(line.stdout, /·/);
  assert.doesNotMatch(line.stdout, /node v/);
  assert.doesNotMatch(line.stdout, / \| /);
  assert.doesNotMatch(line.stdout, /: /);
  // Fixture-driven, so the usage/token/rate values are exact; git(...) stays
  // loose for the live branch and optional dirty marker.
  assert.match(
    line.stdout.trim(),
    /^5\.6-sol\|h\|f\|codex-hud\|git\(.+\*?\)\|Ctx:21%\|5h:17%\(5h,🐢100%\)\|7d:16%\(5\.1d,👾27%\)\|Tkn:904k\(I:533k,O:5k,C:366k\)$/
  );
  assert.doesNotMatch(line.stdout, /now/);

  const formatCfg = path.join(tmpCodexHome, "format.toml");
  fs.writeFileSync(
    formatCfg,
    '[format]\nidentityShort = false\npaceSlowPrefix = "slow-"\npaceNormalPrefix = "ok-"\npaceFastPrefix = "fast-"\n',
    "utf8"
  );
  const shortLine = run(["--line"], { env: { ...fixtureEnv, CODEX_HUD_CONFIG: formatCfg } });
  assert.strictEqual(shortLine.status, 0, shortLine.stderr);
  assert.match(
    shortLine.stdout.trim(),
    /^gpt-5\.6-sol\|high\|fast\|codex-hud\|git\(.+\*?\)\|Ctx:21%\|5h:17%\(5h,slow-100%\)\|7d:16%\(5\.1d,ok-27%\)\|Tkn:904k\(I:533k,O:5k,C:366k\)$/
  );

  const spacedCfg = path.join(tmpCodexHome, "spaced.toml");
  fs.writeFileSync(spacedCfg, "space = true\n", "utf8");
  const spacedLine = run(["--line"], { env: { ...fixtureEnv, CODEX_HUD_CONFIG: spacedCfg } });
  assert.strictEqual(spacedLine.status, 0, spacedLine.stderr);
  assert.match(spacedLine.stdout, /^5\.6-sol \| h \| f \| /);

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
  assert.match(colorLine.stdout, /\x1b\[38;5;245m,\x1b\[0m\x1b\[38;5;85m(?:🐢|👾|🔥)\d+%\x1b\[0m\x1b\[38;5;245m\)\x1b\[0m/);
  assert.match(
    colorLine.stdout.replace(/\x1b\[[0-9;]*m/g, "").trim(),
    /^.+\|.+\|git\(.+\*?\)\|Ctx:.+\|5h:.+\|7d:.+\|Tkn:.+$/
  );
} finally {
  fs.rmSync(tmpCodexHome, { recursive: true, force: true });
}

console.log("codex-hud smoke tests passed");
