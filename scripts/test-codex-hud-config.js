#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const hudScript = path.join(repoRoot, "plugins", "codex-hud", "scripts", "codex-hud.js");

function run(args, env) {
  return spawnSync(process.execPath, [hudScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(env || {}) },
  });
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-config-"));
}

function writeConfig(dir, name, text) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

function printConfig(env) {
  const result = run(["--print-config"], env);
  assert.strictEqual(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const DEFAULT_SEGMENTS = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"];

// Isolated CODEX_HOME with no sessions/config so config resolution is deterministic.
const home = tmpdir();
const baseEnv = { CODEX_HOME: home };

try {
  // 1. No config -> built-in defaults (runtime not in default), nothing applied.
  {
    const config = printConfig(baseEnv);
    assert.deepStrictEqual(config.config.segments, DEFAULT_SEGMENTS);
    assert.deepStrictEqual(config.contributors, []);
    assert.deepStrictEqual(config.warnings, []);

    const line = run(["--line"], baseEnv);
    assert.strictEqual(line.status, 0, line.stderr);
    assert.doesNotMatch(line.stdout, /node v/);
    assert.match(line.stdout, /Ctx/);
    assert.match(line.stdout, /Tkn/);
  }

  // 2. Reorder + rename + recolor via the env-tier config (also proves the
  //    vendored TOML parser loads — a clean parse with no warnings).
  {
    const dir = tmpdir();
    const cfg = writeConfig(dir, "c.toml", 'segments = ["tkn","ctx"]\n[labels]\nctx = "CTX"\n[colors]\nctx = "coral"\n');
    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.deepStrictEqual(config.config.segments, ["tkn", "ctx"]);
    assert.strictEqual(config.config.labels.ctx, "CTX");
    assert.strictEqual(config.config.colors.ctx, "coral");
    assert.deepStrictEqual(config.contributors.map((c) => c.tier), ["env"]);
    assert.deepStrictEqual(config.warnings, []);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3. Threshold + format overrides.
  {
    const dir = tmpdir();
    const cfg = writeConfig(dir, "t.toml", "[thresholds.percent]\nwarn = 50\ncrit = 60\n[format]\ntokenParts = false\n");
    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.strictEqual(config.config.thresholds.percent.warn, 50);
    assert.strictEqual(config.config.thresholds.percent.crit, 60);
    assert.strictEqual(config.config.format.tokenParts, false);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 4. Alias expansion ("workspace" -> project/branch/runtime) + unknown id dropped.
  {
    const dir = tmpdir();
    const cfg = writeConfig(dir, "a.toml", 'segments = ["workspace","bogus","ctx"]\n');
    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.deepStrictEqual(config.config.segments, ["project", "branch", "runtime", "ctx"]);
    assert.ok(config.warnings.some((w) => /unknown segment "bogus"/.test(w)), "expected bogus warning");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 5. Malformed TOML -> exit 0, still renders, stderr note, defaults used.
  {
    const dir = tmpdir();
    const cfg = writeConfig(dir, "bad.toml", "segments = [unclosed\n");
    const line = run(["--line"], { ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.strictEqual(line.status, 0, "malformed config must not crash the status line");
    assert.ok(line.stdout.trim().length > 0, "should still render a footer");
    assert.match(line.stderr, /codex-hud:/);
    assert.strictEqual(line.stderr.trim().split("\n").length, 1, "config warning must be a single stderr line");

    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.deepStrictEqual(config.config.segments, DEFAULT_SEGMENTS, "defaults used on parse failure");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 6. Ill-typed values are dropped with a note; defaults survive.
  {
    const dir = tmpdir();
    const cfg = writeConfig(dir, "inv.toml", "[colors]\nmodel = true\n[thresholds.percent]\nwarn = 9000\n");
    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: cfg });
    assert.strictEqual(config.config.colors.model, "neonViolet", "invalid color dropped -> default kept");
    assert.strictEqual(config.config.thresholds.percent.warn, 100, "out-of-range threshold clamped to 100");
    assert.ok(config.warnings.length >= 1);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 7. Precedence: env tier overrides user tier (CODEX_HOME file).
  {
    writeConfig(home, "codex-hud.toml", 'separator = "USER"\n');
    const envDir = tmpdir();
    const envCfg = writeConfig(envDir, "e.toml", 'separator = "ENV"\n');
    const config = printConfig({ ...baseEnv, CODEX_HUD_CONFIG: envCfg });
    assert.strictEqual(config.config.separators.segment, "ENV");
    assert.deepStrictEqual(config.contributors.map((c) => c.tier), ["user", "env"]);
    fs.rmSync(path.join(home, "codex-hud.toml"));
    fs.rmSync(envDir, { recursive: true, force: true });
  }

  // 8. --config-path reports the three tiers.
  {
    const result = run(["--config-path"], baseEnv);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /user/);
    assert.match(result.stdout, /project/);
    assert.match(result.stdout, /env/);
  }

  // 9. --init-config scaffolds, refuses overwrite, then --force overwrites; the
  //    scaffold itself must load cleanly (no warnings).
  {
    const initHome = tmpdir();
    const target = path.join(initHome, "codex-hud.toml");

    const first = run(["--init-config"], { CODEX_HOME: initHome });
    assert.strictEqual(first.status, 0, first.stderr);
    assert.ok(fs.existsSync(target), "scaffold should be created");
    assert.match(fs.readFileSync(target, "utf8"), /\[thresholds\.percent\]/);
    assert.deepStrictEqual(printConfig({ CODEX_HOME: initHome }).warnings, [], "scaffold loads cleanly");

    const second = run(["--init-config"], { CODEX_HOME: initHome });
    assert.notStrictEqual(second.status, 0, "must refuse overwrite without --force");
    assert.match(second.stderr, /already exists/);

    fs.writeFileSync(target, "tampered", "utf8");
    const forced = run(["--init-config", "--force"], { CODEX_HOME: initHome });
    assert.strictEqual(forced.status, 0, forced.stderr);
    assert.notStrictEqual(fs.readFileSync(target, "utf8"), "tampered", "--force should overwrite");
    fs.rmSync(initHome, { recursive: true, force: true });
  }

  // 10. --json exposes the resolved hud.config.
  {
    const result = run(["--json"], baseEnv);
    assert.strictEqual(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.ok(data.hud && data.hud.config, "json should expose hud.config");
    assert.ok(Array.isArray(data.hud.config.segments));
  }
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}

console.log("codex-hud config tests passed");
