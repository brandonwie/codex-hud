#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  detectCodexVersion,
  detectLegacyLayout,
  detectStockCodex,
  doctor,
  findStockCodexPath,
  checkPatchedRuntime,
  installBuiltBinary,
  installDefaultShim,
  installLauncher,
  installRustRenderer,
  isManagedDefaultShim,
  migrateLegacyLayout,
  parseArgs,
  parseLauncherMetadata,
  patchedRuntimeStatus,
  patchSource,
  pruneVersionDirs,
  pruneBuildCache,
  pruneBuildCacheAfterInstall,
  buildCacheReport,
  listSourceCacheDirs,
  dirSizeBytes,
  formatBytes,
  renderLauncherScript,
  rendererBinaryName,
  resolveRenderer,
  refreshPatchedLauncher,
  reviewLegacyBinEntry,
  statusLineCommandFor,
  syncPatchedRuntime,
  uninstallDefaultShim,
  verifyInstalledBinary,
  verifyRustRenderer,
} = require("./install-patched-codex");

function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeExecutable(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function fakeCodexScript(version) {
  return `#!/usr/bin/env bash\necho codex-cli ${version}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function captureConsoleLog(fn) {
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => {
    logs.push(args.join(" "));
  };
  try {
    return { result: fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-patch-test-"));
const repoPackageVersion = require("../package.json").version;

writeFile(root, "codex-rs/config/src/types.rs", `
pub struct Tui {
    #[serde(default)]
    pub status_line: Option<Vec<String>>,

    /// Color status line items with colors derived from the active syntax theme.
    #[serde(default = "default_true")]
    pub status_line_use_colors: bool,
}
`);

writeFile(root, "codex-rs/core/src/config/mod.rs", `
pub struct Config {
    pub tui_status_line: Option<Vec<String>>,

    /// Whether to color status line items with colors from the active syntax theme.
    pub tui_status_line_use_colors: bool,
}

fn build(cfg: ConfigToml) -> Config {
    Config {
            tui_status_line: cfg.tui.as_ref().and_then(|t| t.status_line.clone()),
            tui_status_line_use_colors: cfg
                .tui
                .as_ref()
                .map(|t| t.status_line_use_colors)
                .unwrap_or(true),
    }
}
`);

writeFile(root, "codex-rs/tui/src/chatwidget/status_surfaces.rs", `
impl ChatWidget {
    fn refresh_status_line_from_selections(&mut self, selections: &StatusSurfaceSelections) {
        let enabled = !selections.status_line_items.is_empty();
        self.bottom_pane.set_status_line_enabled(enabled);
    }

    fn refresh_builtin_status_line(&mut self) {
        self.set_status_line_hyperlink(hyperlink_url);
    }

    /// Clears the terminal title Codex most recently wrote, if any.
    fn clear_title(&self) {}
}
`);

writeFile(root, "codex-rs/tui/src/skills_helpers.rs", `
pub(crate) fn skill_display_name(skill: &SkillMetadata) -> String {
    if let Some(display_name) = skill
        .interface
        .as_ref()
        .and_then(|interface| interface.display_name.as_deref())
    {
        return display_name.to_string();
    }

    if let Some((plugin_name, skill_name)) = skill.name.split_once(':')
        && !plugin_name.is_empty()
        && !skill_name.is_empty()
    {
        return format!("{skill_name} ({plugin_name})");
    }

    skill.name.clone()
}
`);

const firstChanges = patchSource(root);
const secondChanges = patchSource(root);

const configTypes = fs.readFileSync(path.join(root, "codex-rs/config/src/types.rs"), "utf8");
const coreConfig = fs.readFileSync(path.join(root, "codex-rs/core/src/config/mod.rs"), "utf8");
const statusSurfaces = fs.readFileSync(path.join(root, "codex-rs/tui/src/chatwidget/status_surfaces.rs"), "utf8");
const skillsHelpers = fs.readFileSync(path.join(root, "codex-rs/tui/src/skills_helpers.rs"), "utf8");

assert(firstChanges.length >= 5, "expected patchSource to patch every anchor");
assert.deepStrictEqual(secondChanges, [], "patchSource should be idempotent");
assert(configTypes.includes("pub status_line_command: Option<String>"));
assert(coreConfig.includes("pub tui_status_line_command: Option<String>"));
assert(coreConfig.includes("tui_status_line_command: cfg"));
assert(statusSurfaces.includes("fn custom_status_line_from_command"));
assert(statusSurfaces.includes("std::process::Command::new"));
assert(statusSurfaces.includes("fn ansi_status_line_to_line"));
assert(statusSurfaces.includes("ratatui::style::Color::Indexed"));
assert(statusSurfaces.includes(".lines()"));
assert(statusSurfaces.includes(".next()"));
assert(
  skillsHelpers.includes('format!("{plugin_name}:{skill_name}")'),
  "skill_display_name must render plugin skills as plugin:skill",
);
assert(
  !skillsHelpers.includes('format!("{skill_name} ({plugin_name})")'),
  "old skill (plugin) formatter must be replaced",
);
assert(
  statusLineCommandFor({ kind: "rust", path: "/tmp/test-prefix/codex-hud" }).includes("--line --color"),
  "patched Codex footer command must use compact single-line HUD output",
);

// --- renderLauncherScript: stock mode ---
const stockScript = renderLauncherScript({
  mode: "stock",
  prefix: "/tmp/test-prefix",
  stockPath: "/opt/homebrew/bin/codex",
  stockRealpath: "/opt/homebrew/Cellar/codex/0.139.0/bin/codex",
  stockVersion: "0.139.0",
  builtAt: "2026-06-10T00:00:00.000Z",
});
assert(stockScript.includes("# codex-hud-launcher v2 mode=stock"), "stock launcher must carry v2 marker");
assert(stockScript.includes("# stock_path=/opt/homebrew/bin/codex"));
assert(stockScript.includes("# stock_realpath=/opt/homebrew/Cellar/codex/0.139.0/bin/codex"));
assert(stockScript.includes("# built_at=2026-06-10T00:00:00.000Z"));
assert(stockScript.includes('exec -a codex "$stock"'), "stock launcher must preserve argv[0] as codex");
assert(!stockScript.includes("status_line_command"), "stock launcher must not inject patched-only config");

// --- renderLauncherScript: patched mode ---
const patchedScript = renderLauncherScript({
  mode: "patched",
  prefix: "/tmp/test-prefix",
  patchedBinary: "/tmp/test-prefix/codex-hud-codex",
  patchedVersion: "0.139.0",
  stockPath: "/opt/homebrew/bin/codex",
  stockRealpath: "/opt/homebrew/Cellar/codex/0.139.0/bin/codex",
  stockVersion: "0.139.0",
  statusLineCommand: "'/tmp/test-prefix/codex-hud' --line --color",
  renderer: "rust",
  builtAt: "2026-06-10T00:00:00.000Z",
});
assert(patchedScript.includes("# codex-hud-launcher v2 mode=patched"));
assert(patchedScript.includes("# patched_version=0.139.0"));
assert(patchedScript.includes("# stock_realpath=/opt/homebrew/Cellar/codex/0.139.0/bin/codex"));
assert(patchedScript.includes("exec -a codex "), "patched launcher must preserve argv[0] as codex");
assert(patchedScript.includes("--line --color"));
assert(patchedScript.includes("stock Codex changed since this patched runtime was built"), "patched launcher must carry the staleness warning");

// --- parseLauncherMetadata ---
assert.deepStrictEqual(parseLauncherMetadata(stockScript), {
  format: "v2",
  mode: "stock",
  stockPath: "/opt/homebrew/bin/codex",
  stockRealpath: "/opt/homebrew/Cellar/codex/0.139.0/bin/codex",
  stockVersion: "0.139.0",
  builtAt: "2026-06-10T00:00:00.000Z",
});
const patchedMetadata = parseLauncherMetadata(patchedScript);
assert.strictEqual(patchedMetadata.format, "v2");
assert.strictEqual(patchedMetadata.mode, "patched");
assert.strictEqual(patchedMetadata.patchedVersion, "0.139.0");
const legacyScript = "#!/usr/bin/env bash\nset -euo pipefail\n\nexec -a codex '/x/codex-hud-codex' \\\n  -c 'tui.status_line_command=\"node hud.js\"' \\\n  \"$@\"\n";
assert.strictEqual(parseLauncherMetadata(legacyScript).format, "legacy");
assert.strictEqual(parseLauncherMetadata("echo hello\n").format, "foreign");
assert.strictEqual(parseLauncherMetadata("").format, "foreign");

// --- parseArgs ---
const shimRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-shim-test-"));
const launcher = path.join(shimRoot, "codex-hud-tui");
const shim = path.join(shimRoot, "codex");
fs.writeFileSync(launcher, "#!/usr/bin/env bash\nexit 0\n");
fs.chmodSync(launcher, 0o755);

const parsed = parseArgs(["--make-default", "--force-shim", "--prefix", shimRoot]);
assert.strictEqual(parsed.makeDefault, true);
assert.strictEqual(parsed.forceShim, true);
assert.strictEqual(parsed.prefix, shimRoot);
assert.strictEqual(parsed.mode, "stock", "default mode must be stock (safe-by-default)");
assert.strictEqual(parsed.keepVersions, 2);
assert.strictEqual(parseArgs(["--mode", "patched"]).mode, "patched");
assert.strictEqual(parseArgs(["--doctor"]).doctor, true);
assert.strictEqual(parseArgs(["--check-patched"]).checkPatched, true);
assert.strictEqual(parseArgs(["--sync-patched"]).syncPatched, true);
assert.strictEqual(parseArgs(["--keep-versions", "3"]).keepVersions, 3);
assert.strictEqual(parseArgs(["--version", "0.139.0-beta.1+build.2"]).version, "0.139.0-beta.1+build.2");
assert.throws(() => parseArgs(["--mode", "yolo"]), /--mode must be stock or patched/);
assert.throws(() => parseArgs(["--keep-versions", "0"]), /--keep-versions/);
assert.throws(() => parseArgs(["--bin-name", "../codex"]), /--bin-name must contain only/);
assert.throws(() => parseArgs(["--launcher-name", "codex*"]), /--launcher-name must contain only/);
assert.throws(() => parseArgs(["--version", "../../0.139.0"]), /--version must be a semver-like/);
assert.strictEqual(parsed.renderer, "auto", "default renderer must be auto");
assert.strictEqual(parseArgs(["--renderer", "rust"]).renderer, "rust");
assert.throws(() => parseArgs(["--renderer", "js"]), /--renderer must be auto or rust/);
assert.throws(() => parseArgs(["--renderer", "python"]), /--renderer must be auto or rust/);
assert.throws(() => parseArgs(["--bin-name", "codex-hud"]), /Refusing to use codex-hud/);
assert.throws(() => parseArgs(["--launcher-name", "codex-hud"]), /Refusing to use codex-hud/);

// --- stock discovery: HUD-managed candidates skipped ---
const versionShimRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-version-shim-test-"));
const versionRealRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-version-real-test-"));
const versionLauncher = path.join(versionShimRoot, "codex-hud-tui");
const versionShim = path.join(versionShimRoot, "codex");
const versionRealCodex = path.join(versionRealRoot, "codex");
writeExecutable(versionLauncher, fakeCodexScript("0.137.0"));
fs.symlinkSync(versionLauncher, versionShim);
writeExecutable(versionRealCodex, fakeCodexScript("0.138.0"));

const detectedVersionCommands = [];
const detectedVersion = detectCodexVersion({
  env: { PATH: [versionShimRoot, versionRealRoot].join(path.delimiter) },
  runCommand(command) {
    detectedVersionCommands.push(command);
    return command === versionRealCodex ? "codex-cli 0.138.0\n" : "codex-cli 0.137.0\n";
  },
});
assert.strictEqual(detectedVersion, "0.138.0");
assert.deepStrictEqual(detectedVersionCommands, [versionRealCodex]);
assert.throws(
  () => detectCodexVersion({ env: { PATH: versionShimRoot }, includeKnownPaths: false, runCommand: () => "codex-cli 0.137.0\n" }),
  /No stock codex found for version detection/,
);

// --- stock discovery: payloads inside codex-hud-codex.d are skipped (recursion guard) ---
const recursionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-recursion-test-"));
const recursionPayload = path.join(recursionRoot, "codex-hud-codex.d", "1.2.3", "codex");
writeExecutable(recursionPayload, fakeCodexScript("1.2.3"));
const trapDir = path.join(recursionRoot, "trap-bin");
fs.mkdirSync(trapDir);
fs.symlinkSync(recursionPayload, path.join(trapDir, "codex"));
const realDir = path.join(recursionRoot, "real-bin");
const realCodex = path.join(realDir, "codex");
writeExecutable(realCodex, fakeCodexScript("0.140.0"));

const recursionStock = detectStockCodex({
  env: { PATH: [trapDir, realDir].join(path.delimiter) },
  runCommand(command) {
    assert(!command.includes("codex-hud-codex.d"), "must never run a HUD payload as stock codex");
    return "codex-cli 0.140.0\n";
  },
});
assert.strictEqual(recursionStock.path, realCodex);
assert.strictEqual(recursionStock.version, "0.140.0");
assert.strictEqual(findStockCodexPath({ PATH: [trapDir, realDir].join(path.delimiter) }), realCodex);

// --- verifyInstalledBinary ---
const healthCheckCodex = path.join(shimRoot, "health-check-codex");
writeExecutable(healthCheckCodex, fakeCodexScript("1.2.3"));
assert.strictEqual(verifyInstalledBinary(healthCheckCodex, { version: "1.2.3" }), "1.2.3");
assert.throws(() => verifyInstalledBinary(healthCheckCodex, { version: "1.2.4" }), /version mismatch/);

// --- staged install: success path (versioned layout + atomic swap over regular file) ---
const stagePrefix = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-stage-prefix-test-"));
const stageSource = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-stage-source-test-"));
const stageOutside = path.join(stagePrefix, "outside-codex");
fs.writeFileSync(stageOutside, "stock codex\n");
writeExecutable(path.join(stageSource, "codex-rs/target/release/codex"), fakeCodexScript("1.0.0"));
// pre-existing hand-written recovery script at the bin entry (regular file, not symlink)
writeExecutable(path.join(stagePrefix, "codex-hud-codex"), "#!/usr/bin/env bash\necho hand-rolled\n");

const stagedArgsV1 = { prefix: stagePrefix, binName: "codex-hud-codex", version: "1.0.0", keepVersions: 2 };
const stagedV1 = installBuiltBinary(stageSource, stagedArgsV1);
assert.strictEqual(stagedV1.version, "1.0.0");
assert.strictEqual(fs.lstatSync(stagedV1.target).isSymbolicLink(), true, "active entry must become a symlink even over a regular file");
assert.strictEqual(
  fs.realpathSync.native(stagedV1.target),
  fs.realpathSync.native(path.join(stagePrefix, "codex-hud-codex.d", "1.0.0", "codex")),
  "active entry must resolve into the versioned payload dir",
);
assert.strictEqual(fs.readFileSync(stageOutside, "utf8"), "stock codex\n", "unrelated files must be untouched");

// second version: previous version dir retained for rollback
writeExecutable(path.join(stageSource, "codex-rs/target/release/codex"), fakeCodexScript("2.0.0"));
const stagedV2 = installBuiltBinary(stageSource, { ...stagedArgsV1, version: "2.0.0" });
assert.strictEqual(stagedV2.version, "2.0.0");
assert(fs.realpathSync.native(stagedV2.target).includes(`${path.sep}2.0.0${path.sep}`));
assert(fs.existsSync(path.join(stagePrefix, "codex-hud-codex.d", "1.0.0", "codex")), "previous payload must be retained for rollback");

// --- staged install: failed health check must not touch the active runtime ---
const failLauncherPath = installLauncher(
  { prefix: stagePrefix, binName: "codex-hud-codex", launcherName: "codex-hud-tui" },
  {
    mode: "patched",
    patchedBinary: stagedV2.target,
    patchedVersion: "2.0.0",
    statusLineCommand: "'/tmp/test-prefix/codex-hud' --line --color",
    renderer: "rust",
  },
);
const launcherBytesBefore = fs.readFileSync(failLauncherPath, "utf8");

writeExecutable(path.join(stageSource, "codex-rs/target/release/codex"), "#!/usr/bin/env bash\nexit 1\n");
assert.throws(
  () => installBuiltBinary(stageSource, { ...stagedArgsV1, version: "3.0.0" }),
  /health check failed/,
);
assert(
  fs.realpathSync.native(path.join(stagePrefix, "codex-hud-codex")).includes(`${path.sep}2.0.0${path.sep}`),
  "active entry must still resolve to the previous good payload after a failed install",
);
assert.strictEqual(fs.readFileSync(failLauncherPath, "utf8"), launcherBytesBefore, "launcher must be untouched by a failed install");
assert(fs.existsSync(path.join(stagePrefix, "codex-hud-codex.d", "3.0.0.failed", "codex")), "failed payload must be kept for inspection");
assert(!fs.existsSync(path.join(stagePrefix, "codex-hud-codex.d", "3.0.0")), "failed payload must never be activated");

// failed health check: version mismatch variant
writeExecutable(path.join(stageSource, "codex-rs/target/release/codex"), fakeCodexScript("9.0.0"));
assert.throws(
  () => installBuiltBinary(stageSource, { ...stagedArgsV1, version: "4.0.0" }),
  /health check failed/,
);
assert(fs.realpathSync.native(path.join(stagePrefix, "codex-hud-codex")).includes(`${path.sep}2.0.0${path.sep}`));

// --- generated stock wrapper: executes stock codex, never recurses into HUD entries ---
const wrapperPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-wrapper-test-"));
const fakeStockDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-wrapper-stock-test-"));
const fakeStock = path.join(fakeStockDir, "codex");
const sentinel = path.join(wrapperPrefix, "recursion-happened");
writeExecutable(fakeStock, '#!/usr/bin/env bash\necho "STOCK-RAN $@"\n');
writeExecutable(path.join(wrapperPrefix, "codex-hud-codex.d", "1.0.0", "codex"), `#!/usr/bin/env bash\ntouch ${JSON.stringify(sentinel)}\n`);
const wrapperTrapDir = path.join(wrapperPrefix, "trap-bin");
fs.mkdirSync(wrapperTrapDir);
fs.symlinkSync(path.join(wrapperPrefix, "codex-hud-codex.d", "1.0.0", "codex"), path.join(wrapperTrapDir, "codex"));

const wrapperArgs = { prefix: wrapperPrefix, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
const wrapperPath = installLauncher(wrapperArgs, {
  mode: "stock",
  stockPath: fakeStock,
  stockRealpath: fakeStock,
  stockVersion: "0.139.0",
});
fs.symlinkSync(wrapperPath, path.join(wrapperPrefix, "codex"));

const wrapperEnv = {
  ...process.env,
  PATH: [wrapperPrefix, wrapperTrapDir, fakeStockDir, "/usr/bin", "/bin"].join(path.delimiter),
};
const bakedRun = spawnSync("bash", [wrapperPath, "hello", "world"], { encoding: "utf8", env: wrapperEnv });
assert.strictEqual(bakedRun.status, 0, `wrapper failed: ${bakedRun.stderr}`);
assert.match(bakedRun.stdout, /STOCK-RAN hello world/);
assert(!fs.existsSync(sentinel), "wrapper must never execute a HUD-managed payload");

// fallback discovery: baked path gone -> PATH discovery still finds stock, skips HUD entries
const fallbackWrapperPath = installLauncher(wrapperArgs, {
  mode: "stock",
  stockPath: path.join(wrapperPrefix, "does-not-exist", "codex"),
});
const fallbackRun = spawnSync("bash", [fallbackWrapperPath, "again"], { encoding: "utf8", env: wrapperEnv });
assert.strictEqual(fallbackRun.status, 0, `fallback wrapper failed: ${fallbackRun.stderr}`);
assert.match(fallbackRun.stdout, /STOCK-RAN again/);
assert(!fs.existsSync(sentinel), "fallback discovery must never execute a HUD-managed payload");

// --- rust renderer: verify / install / resolve ---
const rendererRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-renderer-test-"));
const rendererSource = path.join(rendererRoot, "source", "codex-hud");
const missingSource = path.join(rendererRoot, "source", "not-built");
writeExecutable(rendererSource, '#!/usr/bin/env bash\necho "codex-hud 0.2.0"\n');
const rendererPrefix = path.join(rendererRoot, "bin");
const rendererArgs = { prefix: rendererPrefix, renderer: "auto" };

assert.strictEqual(rendererBinaryName("darwin"), "codex-hud");
assert.strictEqual(rendererBinaryName("linux"), "codex-hud");
assert.strictEqual(rendererBinaryName("win32"), "codex-hud.exe");
assert.strictEqual(verifyRustRenderer(rendererSource), "0.2.0");
const crlfRenderer = path.join(rendererRoot, "source", "crlf");
writeExecutable(crlfRenderer, '#!/usr/bin/env bash\nprintf "codex-hud 0.2.0\\r\\nUsage\\r\\n"\n');
assert.strictEqual(verifyRustRenderer(crlfRenderer), "0.2.0");
const gibberishRenderer = path.join(rendererRoot, "source", "gibberish");
writeExecutable(gibberishRenderer, "#!/usr/bin/env bash\necho not-a-hud\n");
assert.throws(
  () => verifyRustRenderer(gibberishRenderer),
  new RegExp(`Could not parse ${escapeRegExp(rendererBinaryName())} version`),
);

const installedRenderer = installRustRenderer(rendererArgs, { sourcePath: rendererSource });
assert.deepStrictEqual(installedRenderer, {
  status: "installed",
  path: path.join(rendererPrefix, "codex-hud"),
  version: "0.2.0",
});
assert(fs.statSync(installedRenderer.path).mode & 0o111, "installed renderer must be executable");

const cleanupPrefix = path.join(rendererRoot, "cleanup-bin");
fs.mkdirSync(path.join(cleanupPrefix, "codex-hud"), { recursive: true });
const cleanupResult = installRustRenderer({ prefix: cleanupPrefix }, { sourcePath: rendererSource });
assert.strictEqual(cleanupResult.status, "broken");
assert(
  !fs.readdirSync(cleanupPrefix).some((name) => name.includes(".tmp-")),
  "failed renderer installs must remove their temp file",
);

const existingRenderer = installRustRenderer(rendererArgs, { sourcePath: missingSource });
assert.deepStrictEqual(existingRenderer, {
  status: "existing",
  path: path.join(rendererPrefix, "codex-hud"),
  version: "0.2.0",
});
assert.deepStrictEqual(resolveRenderer(rendererArgs, { sourcePath: missingSource }), {
  kind: "rust",
  path: path.join(rendererPrefix, "codex-hud"),
});

writeExecutable(path.join(rendererPrefix, "codex-hud"), "#!/usr/bin/env bash\nexit 1\n");
const brokenInstalled = installRustRenderer(rendererArgs, { sourcePath: missingSource });
assert.strictEqual(brokenInstalled.status, "broken");
assert.strictEqual(brokenInstalled.path, path.join(rendererPrefix, "codex-hud"));
assert.match(brokenInstalled.error, /--help/, "broken renderer result must carry the health-check failure cause");
assert.throws(
  () => resolveRenderer(rendererArgs, { sourcePath: missingSource }),
  /renderer unavailable: .*failed its --help health check/,
  "auto must fail loudly when the installed renderer is broken",
);
assert.throws(
  () => resolveRenderer({ prefix: rendererPrefix, renderer: "rust" }, { sourcePath: missingSource }),
  /failed its --help health check/,
  "explicit rust with a broken installed binary must surface the health check, not claim it is not built",
);

// broken build artifact must not abort an auto install (stock rollback path)
const brokenSource = path.join(rendererRoot, "source", "broken-build");
writeExecutable(brokenSource, "#!/usr/bin/env bash\nexit 1\n");
const brokenSourcePrefix = path.join(rendererRoot, "broken-source-bin");
const brokenSourceResult = installRustRenderer({ prefix: brokenSourcePrefix }, { sourcePath: brokenSource });
assert.strictEqual(brokenSourceResult.status, "broken-source");
assert.strictEqual(brokenSourceResult.path, brokenSource);
assert.match(brokenSourceResult.error, /--help/);
assert.throws(
  () => resolveRenderer({ prefix: brokenSourcePrefix, renderer: "auto" }, { sourcePath: brokenSource }),
  /renderer unavailable: .*failed its --help health check/,
  "auto must fail loudly when the built source binary is broken",
);
assert(!fs.existsSync(path.join(brokenSourcePrefix, "codex-hud")), "a broken source binary must never be installed");
assert.throws(
  () => resolveRenderer({ prefix: brokenSourcePrefix, renderer: "rust" }, { sourcePath: brokenSource }),
  /failed its --help health check/,
);

// broken source + healthy installed target: keep the working install
const keepPrefix = path.join(rendererRoot, "keep-bin");
writeExecutable(path.join(keepPrefix, "codex-hud"), '#!/usr/bin/env bash\necho "codex-hud 0.2.0"\n');
assert.deepStrictEqual(
  resolveRenderer({ prefix: keepPrefix, renderer: "auto" }, { sourcePath: brokenSource }),
  { kind: "rust", path: path.join(keepPrefix, "codex-hud") },
  "a broken build artifact must not downgrade a healthy installed renderer",
);

const emptyRendererPrefix = path.join(rendererRoot, "empty-bin");
assert.deepStrictEqual(installRustRenderer({ prefix: emptyRendererPrefix }, { sourcePath: missingSource }), {
  status: "missing",
  path: path.join(emptyRendererPrefix, "codex-hud"),
});
assert.throws(
  () => resolveRenderer({ prefix: emptyRendererPrefix, renderer: "auto" }, { sourcePath: missingSource }),
  /codex-hud is not built or installed/,
  "auto must fail loudly when nothing is built",
);
assert.deepStrictEqual(
  resolveRenderer({ prefix: emptyRendererPrefix, renderer: "auto" }, { sourcePath: missingSource, allowMissing: true }),
  { kind: "rust", path: path.join(emptyRendererPrefix, "codex-hud"), missing: true },
  "stock-mode metadata can tolerate a missing renderer without inventing another fallback",
);
assert.throws(
  () => resolveRenderer({ prefix: emptyRendererPrefix, renderer: "rust" }, { sourcePath: missingSource }),
  /npm run build:rust/,
);

// preview mode (install:false) must write nothing and track machine state
const previewPrefix = path.join(rendererRoot, "preview-bin");
assert.deepStrictEqual(
  resolveRenderer({ prefix: previewPrefix, renderer: "auto" }, { install: false, sourcePath: rendererSource }),
  { kind: "rust", path: path.join(previewPrefix, "codex-hud"), preview: true },
);
assert(!fs.existsSync(path.join(previewPrefix, "codex-hud")), "resolveRenderer install:false must not write to the prefix");
assert(!fs.existsSync(previewPrefix), "resolveRenderer install:false must not create the prefix");
assert.throws(
  () => resolveRenderer({ prefix: previewPrefix, renderer: "auto" }, { install: false, sourcePath: missingSource }),
  /codex-hud is not built or installed/,
);
assert.deepStrictEqual(
  resolveRenderer({ prefix: previewPrefix, renderer: "auto" }, { install: false, sourcePath: missingSource, allowMissing: true }),
  { kind: "rust", path: path.join(previewPrefix, "codex-hud"), missing: true },
);

// preview must health-check binaries so --print-config / the patched-install
// preview can never disagree with what the real install resolves.
assert.throws(
  () => resolveRenderer(rendererArgs, { install: false, sourcePath: missingSource }),
  /renderer unavailable: .*failed its --help health check/,
  "preview must fail for a broken installed renderer, matching the install path",
);
assert.throws(
  () => resolveRenderer({ prefix: rendererPrefix, renderer: "rust" }, { install: false, sourcePath: missingSource }),
  /failed its --help health check/,
);
assert.deepStrictEqual(
  resolveRenderer(rendererArgs, { install: false, sourcePath: rendererSource }),
  { kind: "rust", path: path.join(rendererPrefix, "codex-hud"), preview: true },
  "preview must offer the healthy source when the installed target is broken",
);
assert.deepStrictEqual(
  resolveRenderer({ prefix: keepPrefix, renderer: "auto" }, { install: false, sourcePath: brokenSource }),
  { kind: "rust", path: path.join(keepPrefix, "codex-hud") },
  "preview must keep a healthy installed renderer despite a broken build artifact",
);

// --- statusLineCommandFor ---
assert.strictEqual(
  statusLineCommandFor({ kind: "rust", path: "/x/bin/codex-hud" }),
  "'/x/bin/codex-hud' --line --color",
);
assert.throws(() => statusLineCommandFor({ kind: "js" }), /unsupported renderer kind/);

// --- launcher renderer marker round-trips; stock stays free of status_line_command ---
const rustStatusLineCommand = statusLineCommandFor({ kind: "rust", path: path.join(rendererPrefix, "codex-hud") });
const rustPatchedScript = renderLauncherScript({
  mode: "patched",
  prefix: rendererPrefix,
  patchedBinary: path.join(rendererPrefix, "codex-hud-codex"),
  patchedVersion: "0.139.0",
  statusLineCommand: rustStatusLineCommand,
  renderer: "rust",
});
assert(rustPatchedScript.includes("# renderer=rust"));
assert(rustPatchedScript.includes("exec -a codex "), "rust-renderer patched launcher must preserve argv[0] as codex");
assert(rustPatchedScript.includes("codex-hud"), "patched -c override must carry the rust renderer");
assert.strictEqual(parseLauncherMetadata(rustPatchedScript).renderer, "rust");

const rustStockScript = renderLauncherScript({
  mode: "stock",
  prefix: rendererPrefix,
  stockPath: "/opt/homebrew/bin/codex",
  renderer: "rust",
});
assert(rustStockScript.includes("# renderer=rust"));
assert(rustStockScript.includes('exec -a codex "$stock"'));
assert(!rustStockScript.includes("status_line_command"), "stock launcher must not inject patched-only config even with a renderer marker");
assert.strictEqual(parseLauncherMetadata(rustStockScript).renderer, "rust");
assert.strictEqual(parseLauncherMetadata(stockScript).renderer, undefined, "older launchers without the marker carry no renderer");

// --- generated patched wrapper: real exec carries the rust -c override and verbatim user args ---
const patchedExecPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-patched-exec-test-"));
const fakePatchedCodex = path.join(patchedExecPrefix, "fake-patched-codex");
writeExecutable(fakePatchedCodex, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\"\n");
const patchedExecCommand = statusLineCommandFor({ kind: "rust", path: path.join(patchedExecPrefix, "codex-hud") });
const patchedExecLauncher = installLauncher(
  { prefix: patchedExecPrefix, binName: "codex-hud-codex", launcherName: "codex-hud-tui" },
  {
    mode: "patched",
    patchedBinary: fakePatchedCodex,
    patchedVersion: "0.139.0",
    statusLineCommand: patchedExecCommand,
    renderer: "rust",
  },
);
assert.strictEqual(parseLauncherMetadata(fs.readFileSync(patchedExecLauncher, "utf8")).renderer, "rust");
const patchedExecRun = spawnSync("bash", [patchedExecLauncher, "resume", "--last"], { encoding: "utf8" });
assert.strictEqual(patchedExecRun.status, 0, `patched wrapper failed: ${patchedExecRun.stderr}`);
const patchedExecArgv = patchedExecRun.stdout.split("\n").filter(Boolean);
assert.strictEqual(patchedExecArgv[0], "-c");
assert.strictEqual(
  patchedExecArgv[1],
  `tui.status_line_command=${JSON.stringify(patchedExecCommand)}`,
  "layered quoting must survive bash and deliver the exact TOML override",
);
assert(patchedExecArgv[1].includes("codex-hud"));
assert.deepStrictEqual(patchedExecArgv.slice(2), ["resume", "--last"], "user args must arrive verbatim after the -c override");

// --- pruneVersionDirs ---
const pruneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-prune-test-"));
const pruneArgs = { prefix: pruneRoot, binName: "codex-hud-codex", keepVersions: 2 };
for (const version of ["0.9.0", "0.10.0", "0.11.0"]) {
  writeExecutable(path.join(pruneRoot, "codex-hud-codex.d", version, "codex"), fakeCodexScript(version));
}
fs.mkdirSync(path.join(pruneRoot, "codex-hud-codex.d", "1.0.0.staging"), { recursive: true });
fs.mkdirSync(path.join(pruneRoot, "codex-hud-codex.d", "0.7.0.failed"), { recursive: true });
fs.mkdirSync(path.join(pruneRoot, "codex-hud-codex.d", "0.8.0.failed"), { recursive: true });
fs.writeFileSync(path.join(pruneRoot, "codex-hud-codex.d", "codex.legacy-failed"), "");
fs.symlinkSync(path.join(pruneRoot, "codex-hud-codex.d", "0.11.0", "codex"), path.join(pruneRoot, "codex-hud-codex"));

pruneVersionDirs(pruneArgs);
assert(!fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "0.9.0")), "numeric semver sort must prune 0.9.0, not 0.10.0");
assert(fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "0.10.0")));
assert(fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "0.11.0")));
assert(!fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "1.0.0.staging")), "stale staging dirs must be swept");
assert(!fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "codex.legacy-failed")), "legacy failed files must be swept");
assert(fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "0.8.0.failed")), "latest failed payload must be kept");
assert(!fs.existsSync(path.join(pruneRoot, "codex-hud-codex.d", "0.7.0.failed")), "older failed payloads must be swept");

// active version is never pruned, even when oldest
const pruneRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-prune-active-test-"));
const pruneArgs2 = { prefix: pruneRoot2, binName: "codex-hud-codex", keepVersions: 1 };
for (const version of ["0.1.0", "0.2.0", "0.3.0"]) {
  writeExecutable(path.join(pruneRoot2, "codex-hud-codex.d", version, "codex"), fakeCodexScript(version));
}
fs.symlinkSync(path.join(pruneRoot2, "codex-hud-codex.d", "0.1.0", "codex"), path.join(pruneRoot2, "codex-hud-codex"));
pruneVersionDirs(pruneArgs2);
assert(fs.existsSync(path.join(pruneRoot2, "codex-hud-codex.d", "0.1.0")), "active payload must never be pruned");
assert(fs.existsSync(path.join(pruneRoot2, "codex-hud-codex.d", "0.3.0")));
assert(!fs.existsSync(path.join(pruneRoot2, "codex-hud-codex.d", "0.2.0")));

// release versions sort ahead of their prereleases when pruning
const pruneRoot3 = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-prune-prerelease-test-"));
const pruneArgs3 = { prefix: pruneRoot3, binName: "codex-hud-codex", keepVersions: 1 };
for (const version of ["0.139.0-beta.1", "0.139.0", "0.138.0"]) {
  writeExecutable(path.join(pruneRoot3, "codex-hud-codex.d", version, "codex"), fakeCodexScript(version));
}
pruneVersionDirs(pruneArgs3);
assert(fs.existsSync(path.join(pruneRoot3, "codex-hud-codex.d", "0.139.0")));
assert(!fs.existsSync(path.join(pruneRoot3, "codex-hud-codex.d", "0.139.0-beta.1")));
assert(!fs.existsSync(path.join(pruneRoot3, "codex-hud-codex.d", "0.138.0")));

// prerelease variants sort by semver precedence when no release is present
const pruneRoot4 = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-prune-prerelease-order-test-"));
const pruneArgs4 = { prefix: pruneRoot4, binName: "codex-hud-codex", keepVersions: 1 };
for (const version of ["0.139.0-alpha.1", "0.139.0-beta.1", "0.139.0-beta.2"]) {
  writeExecutable(path.join(pruneRoot4, "codex-hud-codex.d", version, "codex"), fakeCodexScript(version));
}
pruneVersionDirs(pruneArgs4);
assert(fs.existsSync(path.join(pruneRoot4, "codex-hud-codex.d", "0.139.0-beta.2")));
assert(!fs.existsSync(path.join(pruneRoot4, "codex-hud-codex.d", "0.139.0-beta.1")));
assert(!fs.existsSync(path.join(pruneRoot4, "codex-hud-codex.d", "0.139.0-alpha.1")));

// --- migration: legacy flat payload -> versioned layout ---
const migrateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-migrate-test-"));
const migrateArgs = { prefix: migrateRoot, binName: "codex-hud-codex" };
const flatPayload = path.join(migrateRoot, "codex-hud-codex.d", "codex");
writeExecutable(flatPayload, fakeCodexScript("0.138.0"));
fs.symlinkSync(flatPayload, path.join(migrateRoot, "codex-hud-codex"));

const legacyLayout = detectLegacyLayout(migrateArgs);
assert.strictEqual(legacyLayout.flatPayload, flatPayload);
assert.strictEqual(legacyLayout.binEntry.kind, "symlink");

const migrated = migrateLegacyLayout(migrateArgs);
assert.strictEqual(migrated.status, "migrated");
assert.strictEqual(migrated.version, "0.138.0");
assert(fs.existsSync(path.join(migrateRoot, "codex-hud-codex.d", "0.138.0", "codex")));
assert(!fs.existsSync(flatPayload));
assert.strictEqual(
  fs.realpathSync.native(path.join(migrateRoot, "codex-hud-codex")),
  fs.realpathSync.native(path.join(migrateRoot, "codex-hud-codex.d", "0.138.0", "codex")),
  "bin entry must be retargeted to the migrated payload",
);
assert.deepStrictEqual(migrateLegacyLayout(migrateArgs), { status: "none" }, "migration must be idempotent");

// broken flat payload is quarantined, not activated
const migrateRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-migrate-broken-test-"));
const brokenFlat = path.join(migrateRoot2, "codex-hud-codex.d", "codex");
writeExecutable(brokenFlat, "#!/usr/bin/env bash\nexit 1\n");
const quarantined = migrateLegacyLayout({ prefix: migrateRoot2, binName: "codex-hud-codex" });
assert.strictEqual(quarantined.status, "quarantined");
assert(fs.existsSync(`${brokenFlat}.legacy-failed`));
assert(!fs.existsSync(brokenFlat));

// --- stock-mode review of the legacy codex-hud-codex entry ---
const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-review-test-"));
const reviewArgs = { prefix: reviewRoot, binName: "codex-hud-codex" };
assert.strictEqual(reviewLegacyBinEntry(reviewArgs).status, "absent");

writeExecutable(path.join(reviewRoot, "codex-hud-codex"), fakeCodexScript("0.137.0"));
const reviewOk = reviewLegacyBinEntry(reviewArgs);
assert.strictEqual(reviewOk.status, "ok");
assert.strictEqual(reviewOk.version, "0.137.0");
assert(fs.existsSync(path.join(reviewRoot, "codex-hud-codex")), "healthy entry must be left in place");

const reviewDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-review-dir-test-"));
fs.mkdirSync(path.join(reviewDirRoot, "codex-hud-codex"), { recursive: true });
const reviewDir = reviewLegacyBinEntry({ prefix: reviewDirRoot, binName: "codex-hud-codex" });
assert.strictEqual(reviewDir.status, "skipped");
assert.strictEqual(reviewDir.reason, "directory");

const reviewRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-review-broken-test-"));
writeExecutable(path.join(reviewRoot2, "codex-hud-codex"), "#!/usr/bin/env bash\nexit 1\n");
writeExecutable(path.join(reviewRoot2, "codex-hud-codex.d", "codex"), "#!/usr/bin/env bash\nexit 1\n");
const reviewBroken = reviewLegacyBinEntry({ prefix: reviewRoot2, binName: "codex-hud-codex" });
assert.strictEqual(reviewBroken.status, "quarantined");
assert(!fs.existsSync(path.join(reviewRoot2, "codex-hud-codex")), "broken entry must fail fast as command-not-found");
assert(fs.existsSync(reviewBroken.quarantinePath));
assert(reviewBroken.quarantinedPayload && fs.existsSync(reviewBroken.quarantinedPayload), "broken flat payload must be quarantined too");

// --- doctor ---
const doctorStockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-stock-test-"));
const doctorStockBin = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-stock-bin-test-"));
const doctorFakeStock = path.join(doctorStockBin, "codex");
writeExecutable(doctorFakeStock, fakeCodexScript("0.139.0"));
const doctorFakeStockRealpath = fs.realpathSync.native(doctorFakeStock);
const doctorStockArgs = { prefix: doctorStockRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
const doctorStockLauncher = installLauncher(doctorStockArgs, {
  mode: "stock",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStockRealpath,
  stockVersion: "0.139.0",
});
fs.symlinkSync(doctorStockLauncher, path.join(doctorStockRoot, "codex"));

const stockReport = doctor(doctorStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(stockReport.launcher.mode, "stock");
assert.strictEqual(stockReport.shim.status, "managed");
assert.strictEqual(stockReport.stock.path, doctorFakeStock);
assert.strictEqual(stockReport.healthy, true);
assert.deepStrictEqual(stockReport.recommendations, []);

const doctorStaleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-stale-test-"));
const doctorStaleArgs = { prefix: doctorStaleRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
writeExecutable(path.join(doctorStaleRoot, "codex-hud-codex.d", "0.138.0", "codex"), fakeCodexScript("0.138.0"));
fs.symlinkSync(path.join(doctorStaleRoot, "codex-hud-codex.d", "0.138.0", "codex"), path.join(doctorStaleRoot, "codex-hud-codex"));
installLauncher(doctorStaleArgs, {
  mode: "patched",
  patchedBinary: path.join(doctorStaleRoot, "codex-hud-codex"),
  patchedVersion: "0.138.0",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStockRealpath,
  stockVersion: "0.138.0",
  statusLineCommand: `'${path.join(doctorStaleRoot, "codex-hud")}' --line --color`,
  renderer: "rust",
});
const staleReport = doctor(doctorStaleArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command === path.join(doctorStaleRoot, "codex-hud-codex") ? "codex-cli 0.138.0\n" : "codex-cli 0.139.0\n"),
});
assert.strictEqual(staleReport.launcher.mode, "patched");
assert.strictEqual(staleReport.healthy, true);
assert(
  staleReport.recommendations.some((entry) => entry.includes("0.139.0") && entry.includes("0.138.0")),
  "doctor must recommend a rebuild when stock moved past the patched runtime",
);
assert(
  staleReport.recommendations.some((entry) => entry.includes("npm run codex:sync")),
  "doctor must point stale patched runtimes at the post-update sync command",
);
const staleStatus = patchedRuntimeStatus(staleReport);
assert.strictEqual(staleStatus.needsSync, true);
assert.strictEqual(staleStatus.action, "rebuild");
assert.strictEqual(staleStatus.stockVersion, "0.139.0");
assert.strictEqual(staleStatus.patchedVersion, "0.138.0");

const stockStatus = patchedRuntimeStatus(stockReport);
assert.strictEqual(stockStatus.needsSync, false);
assert.strictEqual(stockStatus.action, "none");
assert.match(stockStatus.reason, /stock launcher delegates/);

const brokenReport = doctor(doctorStaleArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => {
    if (command === path.join(doctorStaleRoot, "codex-hud-codex")) {
      throw new Error("codex --version terminated by SIGKILL");
    }
    return "codex-cli 0.139.0\n";
  },
});
assert.strictEqual(brokenReport.healthy, false, "broken active payload must mark the chain unhealthy");
assert(brokenReport.anomalies.some((entry) => entry.includes("active patched payload is broken")));
const brokenStatus = patchedRuntimeStatus(brokenReport);
assert.strictEqual(brokenStatus.needsSync, true);
assert.strictEqual(brokenStatus.action, "rebuild");

// --- patched runtime check/sync ---
const checkResult = checkPatchedRuntime(doctorStaleArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command === path.join(doctorStaleRoot, "codex-hud-codex") ? "codex-cli 0.138.0\n" : "codex-cli 0.139.0\n"),
});
assert.strictEqual(checkResult.status.action, "rebuild");

let syncRebuilt = false;
const syncResult = syncPatchedRuntime(doctorStaleArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => {
    if (command === path.join(doctorStaleRoot, "codex-hud-codex")) {
      return syncRebuilt ? "codex-cli 0.139.0\n" : "codex-cli 0.138.0\n";
    }
    return "codex-cli 0.139.0\n";
  },
  runPatchedInstall(installArgs) {
    assert.strictEqual(installArgs.version, "0.139.0");
    writeExecutable(path.join(doctorStaleRoot, "codex-hud-codex.d", "0.139.0", "codex"), fakeCodexScript("0.139.0"));
    fs.unlinkSync(path.join(doctorStaleRoot, "codex-hud-codex"));
    fs.symlinkSync(path.join(doctorStaleRoot, "codex-hud-codex.d", "0.139.0", "codex"), path.join(doctorStaleRoot, "codex-hud-codex"));
    installLauncher(doctorStaleArgs, {
      mode: "patched",
      patchedBinary: path.join(doctorStaleRoot, "codex-hud-codex"),
      patchedVersion: "0.139.0",
      stockPath: doctorFakeStock,
      stockRealpath: doctorFakeStockRealpath,
      stockVersion: "0.139.0",
      statusLineCommand: `'${path.join(doctorStaleRoot, "codex-hud")}' --line --color`,
      renderer: "rust",
    });
    syncRebuilt = true;
  },
});
assert.strictEqual(syncResult.action, "rebuilt");
assert.strictEqual(syncResult.status.needsSync, false);

const realpathOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-realpath-sync-test-"));
const realpathOnlyArgs = { prefix: realpathOnlyRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
writeExecutable(path.join(realpathOnlyRoot, "codex-hud"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
writeExecutable(path.join(realpathOnlyRoot, "codex-hud-codex.d", "0.139.0", "codex"), fakeCodexScript("0.139.0"));
fs.symlinkSync(path.join(realpathOnlyRoot, "codex-hud-codex.d", "0.139.0", "codex"), path.join(realpathOnlyRoot, "codex-hud-codex"));
installLauncher(realpathOnlyArgs, {
  mode: "patched",
  patchedBinary: path.join(realpathOnlyRoot, "codex-hud-codex"),
  patchedVersion: "0.139.0",
  stockPath: doctorFakeStock,
  stockRealpath: "/old/codex/realpath",
  stockVersion: "0.139.0",
  statusLineCommand: `'${path.join(realpathOnlyRoot, "codex-hud")}' --line --color`,
  renderer: "rust",
});
const realpathOnlyReport = doctor(realpathOnlyArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
const realpathOnlyStatus = patchedRuntimeStatus(realpathOnlyReport);
assert.strictEqual(realpathOnlyStatus.needsSync, true);
assert.strictEqual(realpathOnlyStatus.action, "refresh-launcher");
const refreshed = refreshPatchedLauncher(realpathOnlyArgs, realpathOnlyReport, {
  resolveRenderer: () => ({ kind: "rust", path: path.join(realpathOnlyRoot, "codex-hud") }),
});
assert.strictEqual(refreshed.statusLineCommand, `'${path.join(realpathOnlyRoot, "codex-hud")}' --line --color`);
const refreshedMetadata = parseLauncherMetadata(fs.readFileSync(path.join(realpathOnlyRoot, "codex-hud-tui"), "utf8"));
assert.strictEqual(refreshedMetadata.stockRealpath, doctorFakeStockRealpath);

installLauncher(realpathOnlyArgs, {
  mode: "patched",
  patchedBinary: path.join(realpathOnlyRoot, "codex-hud-codex"),
  patchedVersion: "0.139.0",
  stockPath: doctorFakeStock,
  stockRealpath: "/old/codex/realpath",
  stockVersion: "0.139.0",
  statusLineCommand: `'${path.join(realpathOnlyRoot, "codex-hud")}' --line --color`,
  renderer: "rust",
});
const syncRefreshResult = syncPatchedRuntime(realpathOnlyArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
  resolveRenderer: () => ({ kind: "rust", path: path.join(realpathOnlyRoot, "codex-hud") }),
});
assert.strictEqual(syncRefreshResult.action, "refreshed");
assert.strictEqual(syncRefreshResult.status.needsSync, false);

// --- shim management ---
const shimArgs = {
  prefix: shimRoot,
  launcherName: "codex-hud-tui",
  forceShim: false,
};

const installedShim = installDefaultShim(launcher, shimArgs);
assert.deepStrictEqual(installedShim, { target: shim, status: "installed" });
assert.strictEqual(fs.readlinkSync(shim), launcher);
assert.strictEqual(isManagedDefaultShim(shim, launcher), true);

const unchangedShim = installDefaultShim(launcher, shimArgs);
assert.deepStrictEqual(unchangedShim, { target: shim, status: "unchanged" });

const removedShim = uninstallDefaultShim(shimArgs);
assert.deepStrictEqual(removedShim, { target: shim, status: "removed" });
assert.strictEqual(fs.existsSync(shim), false);

fs.writeFileSync(shim, "#!/usr/bin/env bash\nexit 1\n");
assert.throws(() => installDefaultShim(launcher, shimArgs), /Refusing to replace existing codex/);
assert.throws(() => uninstallDefaultShim(shimArgs), /not a Codex HUD-managed shim/);

const forcedShim = installDefaultShim(launcher, { ...shimArgs, forceShim: true });
assert.deepStrictEqual(forcedShim, { target: shim, status: "installed" });
assert.strictEqual(isManagedDefaultShim(shim, launcher), true);

// --- default-shim opt-in marker + drift detection/reclaim ---
function buildPatchedInstall(label, { defaultShim } = {}) {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), `codex-hud-${label}-`));
  const installArgs = { prefix: installRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
  writeExecutable(path.join(installRoot, "codex-hud-codex.d", "0.139.0", "codex"), fakeCodexScript("0.139.0"));
  fs.symlinkSync(
    path.join(installRoot, "codex-hud-codex.d", "0.139.0", "codex"),
    path.join(installRoot, "codex-hud-codex"),
  );
  writeExecutable(path.join(installRoot, "codex-hud"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
  const installLauncherPath = installLauncher(installArgs, {
    mode: "patched",
    patchedBinary: path.join(installRoot, "codex-hud-codex"),
    patchedVersion: "0.139.0",
    stockPath: doctorFakeStock,
    stockRealpath: doctorFakeStockRealpath,
    stockVersion: "0.139.0",
    statusLineCommand: `'${path.join(installRoot, "codex-hud")}' --line --color`,
    renderer: "rust",
    defaultShim,
  });
  return { root: installRoot, args: installArgs, launcher: installLauncherPath };
}

function patchedSyncOptions(installRoot) {
  return {
    env: { PATH: doctorStockBin },
    runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
    resolveRenderer: () => ({ kind: "rust", path: path.join(installRoot, "codex-hud") }),
  };
}

// (1) --make-default records default_shim=1, and a plain rebuild preserves it.
const optIn = buildPatchedInstall("default-shim-optin-test", { defaultShim: "1" });
assert.strictEqual(
  parseLauncherMetadata(fs.readFileSync(optIn.launcher, "utf8")).defaultShim,
  "1",
  "--make-default must record default_shim=1 in the launcher",
);
installLauncher(optIn.args, {
  mode: "patched",
  patchedBinary: path.join(optIn.root, "codex-hud-codex"),
  patchedVersion: "0.139.0",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStockRealpath,
  stockVersion: "0.139.0",
  statusLineCommand: `'${path.join(optIn.root, "codex-hud")}' --line --color`,
  renderer: "rust",
});
assert.strictEqual(
  parseLauncherMetadata(fs.readFileSync(optIn.launcher, "utf8")).defaultShim,
  "1",
  "a plain rebuild (no defaultShim) must preserve the opt-in marker",
);

// (2) Opted-in drift -> doctor reports 'drifted' + unhealthy; codex:sync reclaims
// even though the payload is current.
const optInShim = path.join(optIn.root, "codex");
fs.symlinkSync(doctorFakeStock, optInShim); // Codex self-updater hijack: codex -> stock
const driftReport = doctor(optIn.args, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(driftReport.shim.status, "drifted", "hijacked shim on an opted-in patched install must be 'drifted'");
assert.strictEqual(driftReport.healthy, false, "opted-in drift must mark the entrypoint chain unhealthy");
assert(
  driftReport.anomalies.some((entry) => entry.includes("drifted off the patched launcher")),
  "opted-in drift must push a drift anomaly",
);
const driftStatus = patchedRuntimeStatus(driftReport);
assert.strictEqual(driftStatus.shimDrifted, true);
assert.strictEqual(driftStatus.shimOptedIn, true);
const reclaimCapture = captureConsoleLog(() => syncPatchedRuntime(optIn.args, patchedSyncOptions(optIn.root)));
const reclaimSync = reclaimCapture.result;
assert.strictEqual(reclaimSync.shim.action, "reclaimed");
assert.strictEqual(reclaimSync.action, "none", "payload is current, so the top-level sync action stays 'none'");
assert.strictEqual(reclaimSync.status.shimDrifted, false, "sync must return the fresh post-reclaim shim status");
assert.strictEqual(
  reclaimCapture.logs.filter((line) => line.startsWith("patched sync mode:")).length,
  1,
  "post-reclaim status refresh must not print a second status table",
);
assert.strictEqual(isManagedDefaultShim(optInShim, optIn.launcher), true, "after reclaim the shim points at the launcher");

// Rebuild-needed drift must not reclaim the user-facing shim until the payload
// is actually repaired. A failed rebuild leaves `codex` on stock.
const failedDrift = buildPatchedInstall("default-shim-failed-rebuild-test", { defaultShim: "1" });
const failedDriftShim = path.join(failedDrift.root, "codex");
fs.symlinkSync(doctorFakeStock, failedDriftShim);
writeExecutable(path.join(failedDrift.root, "codex-hud-codex.d", "0.139.0", "codex"), "#!/usr/bin/env bash\nexit 42\n");
assert.throws(
  () => syncPatchedRuntime(failedDrift.args, {
    ...patchedSyncOptions(failedDrift.root),
    runCommand: (command) => {
      if (command === path.join(failedDrift.root, "codex-hud-codex")) {
        throw new Error("patched payload is broken");
      }
      return command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n";
    },
    runPatchedInstall() {
      throw new Error("rebuild failed");
    },
  }),
  /rebuild failed/,
);
assert.strictEqual(fs.readlinkSync(failedDriftShim), doctorFakeStock, "failed rebuild must not reclaim the default shim");

const rebuildDrift = buildPatchedInstall("default-shim-rebuild-reclaim-test", { defaultShim: "1" });
const rebuildDriftShim = path.join(rebuildDrift.root, "codex");
const rebuildDriftPayload = path.join(rebuildDrift.root, "codex-hud-codex.d", "0.139.0", "codex");
fs.symlinkSync(doctorFakeStock, rebuildDriftShim);
writeExecutable(rebuildDriftPayload, "#!/usr/bin/env bash\nexit 42\n");
let rebuildDriftRebuilt = false;
const rebuildDriftCapture = captureConsoleLog(() => syncPatchedRuntime(rebuildDrift.args, {
  ...patchedSyncOptions(rebuildDrift.root),
  runCommand: (command) => {
    if (command === path.join(rebuildDrift.root, "codex-hud-codex") && !rebuildDriftRebuilt) {
      throw new Error("patched payload is broken");
    }
    return command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n";
  },
  runPatchedInstall(installArgs) {
    assert.strictEqual(installArgs.version, "0.139.0");
    writeExecutable(rebuildDriftPayload, fakeCodexScript("0.139.0"));
    installLauncher(rebuildDrift.args, {
      mode: "patched",
      patchedBinary: path.join(rebuildDrift.root, "codex-hud-codex"),
      patchedVersion: "0.139.0",
      stockPath: doctorFakeStock,
      stockRealpath: doctorFakeStockRealpath,
      stockVersion: "0.139.0",
      statusLineCommand: `'${path.join(rebuildDrift.root, "codex-hud")}' --line --color`,
      renderer: "rust",
    });
    rebuildDriftRebuilt = true;
  },
}));
const rebuildDriftSync = rebuildDriftCapture.result;
assert.strictEqual(rebuildDriftSync.action, "rebuilt");
assert.strictEqual(rebuildDriftSync.shim.action, "reclaimed");
assert.strictEqual(rebuildDriftSync.status.shimDrifted, false, "rebuild sync must return the fresh post-reclaim shim status");
assert.strictEqual(
  rebuildDriftCapture.logs.filter((line) => line.startsWith("patched sync mode:")).length,
  2,
  "post-rebuild shim reconciliation must not print a third status table",
);
assert.strictEqual(isManagedDefaultShim(rebuildDriftShim, rebuildDrift.launcher), true, "successful rebuild then reclaims the shim");

// (3) Non-opted-in foreign symlink -> recommendation only, never relinked.
const noOptIn = buildPatchedInstall("default-shim-no-optin-test");
assert.strictEqual(
  parseLauncherMetadata(fs.readFileSync(noOptIn.launcher, "utf8")).defaultShim,
  undefined,
  "an install without --make-default must not carry the opt-in marker",
);
const noOptInShim = path.join(noOptIn.root, "codex");
fs.symlinkSync(doctorFakeStock, noOptInShim); // a foreign codex the user set themselves
const noOptInReport = doctor(noOptIn.args, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(noOptInReport.shim.status, "drifted");
assert.strictEqual(noOptInReport.healthy, true, "an un-opted-in foreign shim must NOT mark the chain unhealthy");
assert(
  noOptInReport.recommendations.some((entry) => entry.includes("--make-default --force-shim")),
  "un-opted-in drift must recommend the explicit reclaim command",
);
const noOptInSync = syncPatchedRuntime(noOptIn.args, patchedSyncOptions(noOptIn.root));
assert.strictEqual(noOptInSync.shim.action, "recommend");
assert.strictEqual(
  fs.readlinkSync(noOptInShim),
  doctorFakeStock,
  "sync must NOT relink a shim the user never opted into",
);

// (4) Migration: a managed shim on a launcher predating the marker gets the
// marker stamped while still managed; the shim itself is untouched; idempotent.
const migrate = buildPatchedInstall("default-shim-migrate-test");
const migrateShim = path.join(migrate.root, "codex");
fs.symlinkSync(migrate.launcher, migrateShim); // currently managed, but launcher has no marker
assert.strictEqual(isManagedDefaultShim(migrateShim, migrate.launcher), true);
assert.strictEqual(parseLauncherMetadata(fs.readFileSync(migrate.launcher, "utf8")).defaultShim, undefined);
const migrateCapture = captureConsoleLog(() => syncPatchedRuntime(migrate.args, patchedSyncOptions(migrate.root)));
const migrateSync = migrateCapture.result;
assert.strictEqual(migrateSync.shim.action, "stamped");
assert.strictEqual(migrateSync.status.shimOptedIn, true, "sync must return the fresh post-stamp opt-in status");
assert.strictEqual(
  migrateCapture.logs.filter((line) => line.startsWith("patched sync mode:")).length,
  1,
  "post-stamp status refresh must not print a second status table",
);
assert.strictEqual(
  parseLauncherMetadata(fs.readFileSync(migrate.launcher, "utf8")).defaultShim,
  "1",
  "migration must stamp default_shim=1 while the shim is still managed",
);
assert.strictEqual(isManagedDefaultShim(migrateShim, migrate.launcher), true, "migration must leave the managed shim untouched");
const migrateSync2 = syncPatchedRuntime(migrate.args, patchedSyncOptions(migrate.root));
assert.strictEqual(migrateSync2.shim.action, "none", "a second sync with the marker present is a no-op");

// (4b) Migration still stamps the managed shim after a rebuild repairs a broken
// payload. Before the rebuild there is no healthy payload to re-render with.
const rebuildMigrate = buildPatchedInstall("default-shim-rebuild-migrate-test");
const rebuildMigrateShim = path.join(rebuildMigrate.root, "codex");
fs.symlinkSync(rebuildMigrate.launcher, rebuildMigrateShim);
const rebuildMigratePayload = path.join(rebuildMigrate.root, "codex-hud-codex.d", "0.139.0", "codex");
writeExecutable(rebuildMigratePayload, "#!/usr/bin/env bash\nexit 42\n");
let rebuildMigrateRebuilt = false;
const rebuildMigrateCapture = captureConsoleLog(() => syncPatchedRuntime(rebuildMigrate.args, {
  ...patchedSyncOptions(rebuildMigrate.root),
  runCommand: (command) => {
    if (command === path.join(rebuildMigrate.root, "codex-hud-codex") && !rebuildMigrateRebuilt) {
      throw new Error("patched payload is broken");
    }
    return command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n";
  },
  runPatchedInstall(installArgs) {
    assert.strictEqual(installArgs.version, "0.139.0");
    writeExecutable(rebuildMigratePayload, fakeCodexScript("0.139.0"));
    installLauncher(rebuildMigrate.args, {
      mode: "patched",
      patchedBinary: path.join(rebuildMigrate.root, "codex-hud-codex"),
      patchedVersion: "0.139.0",
      stockPath: doctorFakeStock,
      stockRealpath: doctorFakeStockRealpath,
      stockVersion: "0.139.0",
      statusLineCommand: `'${path.join(rebuildMigrate.root, "codex-hud")}' --line --color`,
      renderer: "rust",
    });
    rebuildMigrateRebuilt = true;
  },
}));
const rebuildMigrateSync = rebuildMigrateCapture.result;
assert.strictEqual(rebuildMigrateSync.action, "rebuilt");
assert.strictEqual(rebuildMigrateSync.shim.action, "stamped");
assert.strictEqual(rebuildMigrateSync.status.shimOptedIn, true, "rebuild sync must return the fresh post-stamp opt-in status");
assert.strictEqual(
  rebuildMigrateCapture.logs.filter((line) => line.startsWith("patched sync mode:")).length,
  2,
  "post-rebuild stamp refresh must not print a third status table",
);
assert.strictEqual(
  parseLauncherMetadata(fs.readFileSync(rebuildMigrate.launcher, "utf8")).defaultShim,
  "1",
  "migration must stamp default_shim=1 after the rebuild makes the payload healthy",
);
assert.strictEqual(isManagedDefaultShim(rebuildMigrateShim, rebuildMigrate.launcher), true);

// (5) A regular-file `codex` is the user's own; it stays 'foreign' and is never
// reclassified or overwritten, even on an opted-in install.
const regular = buildPatchedInstall("default-shim-regular-test", { defaultShim: "1" });
const regularShim = path.join(regular.root, "codex");
const regularContents = "#!/usr/bin/env bash\necho my own codex\n";
fs.writeFileSync(regularShim, regularContents);
const regularReport = doctor(regular.args, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(regularReport.shim.status, "foreign", "a regular-file codex must stay 'foreign', never 'drifted'");
const regularSync = syncPatchedRuntime(regular.args, patchedSyncOptions(regular.root));
assert.strictEqual(regularSync.shim.action, "none");
assert.strictEqual(
  fs.readFileSync(regularShim, "utf8"),
  regularContents,
  "sync must never overwrite a regular-file codex",
);

// --- doctor renderer reporting ---
// (1a) stock launcher with renderer=rust marker, no codex-hud binary: informational only.
const doctorRendererStockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-renderer-stock-test-"));
const doctorRendererStockArgs = { prefix: doctorRendererStockRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
installLauncher(doctorRendererStockArgs, {
  mode: "stock",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStockRealpath,
  stockVersion: "0.139.0",
  renderer: "rust",
});
const rendererStockReport = doctor(doctorRendererStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(rendererStockReport.renderer.configured, "rust");
assert.strictEqual(rendererStockReport.renderer.installed, false);
assert.strictEqual(rendererStockReport.renderer.binPath, path.join(doctorRendererStockRoot, "codex-hud"));
assert.strictEqual(rendererStockReport.healthy, true, "missing renderer must not break a stock entrypoint chain");
assert(
  !rendererStockReport.recommendations.some((entry) => entry.includes("codex-hud")),
  "stock-mode missing renderer must stay informational, not a recommendation",
);

const rendererDoctorRun = spawnSync(
  process.execPath,
  [path.join(__dirname, "install-patched-codex.js"), "--doctor", "--prefix", doctorRendererStockRoot],
  { encoding: "utf8", env: { ...process.env, PATH: `${doctorStockBin}:${process.env.PATH}` } },
);
assert.strictEqual(rendererDoctorRun.status, 0, "stock-mode doctor with missing renderer must exit healthy");
assert(
  rendererDoctorRun.stdout.includes("renderer: rust configured but binary missing at"),
  "stock-mode renderer line must carry the stock qualifier",
);
assert(rendererDoctorRun.stdout.includes("used by --print-config/patched mode only"));
assert(!rendererDoctorRun.stdout.includes("recommendation:"));
assert(rendererDoctorRun.stdout.includes("status: healthy"));

// (1b) patched launcher with renderer=rust marker, no binary: rebuild recommendation, still healthy.
const doctorRendererPatchedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-renderer-patched-test-"));
const doctorRendererPatchedArgs = { prefix: doctorRendererPatchedRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
writeExecutable(path.join(doctorRendererPatchedRoot, "codex-hud-codex.d", "0.139.0", "codex"), fakeCodexScript("0.139.0"));
fs.symlinkSync(path.join(doctorRendererPatchedRoot, "codex-hud-codex.d", "0.139.0", "codex"), path.join(doctorRendererPatchedRoot, "codex-hud-codex"));
installLauncher(doctorRendererPatchedArgs, {
  mode: "patched",
  patchedBinary: path.join(doctorRendererPatchedRoot, "codex-hud-codex"),
  patchedVersion: "0.139.0",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStockRealpath,
  stockVersion: "0.139.0",
  statusLineCommand: `'${path.join(doctorRendererPatchedRoot, "codex-hud")}' --line --color`,
  renderer: "rust",
});
const rendererPatchedReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(rendererPatchedReport.renderer.configured, "rust");
assert.strictEqual(rendererPatchedReport.renderer.installed, false);
assert.strictEqual(rendererPatchedReport.healthy, true, "missing renderer must not break a patched entrypoint chain");
assert(
  rendererPatchedReport.recommendations.some((entry) => /codex-hud.*missing/.test(entry)),
  "patched-mode missing renderer must recommend a rebuild",
);

// (2) installed codex-hud matching the repo version: no renderer recommendation.
writeExecutable(path.join(doctorRendererPatchedRoot, "codex-hud"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
const rendererInstalledReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererInstalledReport.renderer.installed, true);
assert.strictEqual(rendererInstalledReport.renderer.version, repoPackageVersion);
assert(!rendererInstalledReport.recommendations.some((entry) => entry.includes("codex-hud")));

// (3) installed codex-hud behind the repo version: staleness recommendation.
const staleRendererVersion = repoPackageVersion === "0.0.0" ? "0.0.1" : "0.0.0";
const rendererStaleReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${staleRendererVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererStaleReport.renderer.installed, true);
assert.strictEqual(rendererStaleReport.renderer.version, staleRendererVersion);
assert(
  rendererStaleReport.recommendations.some((entry) => entry.includes("codex-hud") && /rebuild/.test(entry)),
  "stale renderer must recommend a rebuild",
);

// (3b) installed codex-hud whose --help health check fails: reported broken (not missing)
// and, in patched mode, the entrypoint chain is unhealthy because every launch injects it.
const rendererBrokenReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => {
    if (command.endsWith("codex-hud")) {
      throw new Error("exec format error");
    }
    return "codex-cli 0.139.0\n";
  },
});
assert.strictEqual(rendererBrokenReport.renderer.installed, false);
assert.strictEqual(rendererBrokenReport.renderer.broken, true);
assert.strictEqual(rendererBrokenReport.healthy, false, "patched-mode broken renderer must break the entrypoint chain");
assert(
  rendererBrokenReport.anomalies.some((entry) => entry.includes("installed codex-hud failed --help health check")),
  "broken renderer must surface the health-check failure as an anomaly",
);
assert(
  rendererBrokenReport.recommendations.some((entry) => entry.includes("broken") && entry.includes("npm run build:rust")),
  "patched-mode broken renderer must recommend a rebuild and say broken, not missing",
);

// (4) v2 launcher without a renderer marker means the Rust renderer.
const rendererDefaultReport = doctor(doctorStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(rendererDefaultReport.renderer.configured, "rust");
assert.strictEqual(rendererDefaultReport.renderer.installed, false);

const rendererDefaultRun = spawnSync(
  process.execPath,
  [path.join(__dirname, "install-patched-codex.js"), "--doctor", "--prefix", doctorStockRoot],
  { encoding: "utf8", env: { ...process.env, PATH: `${doctorStockBin}:${process.env.PATH}` } },
);
assert.strictEqual(rendererDefaultRun.status, 0);
assert(
  rendererDefaultRun.stdout.includes("renderer: rust configured but binary missing at"),
  "doctor output must mention the missing rust binary",
);

writeExecutable(path.join(doctorStockRoot, "codex-hud"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
const rendererDefaultInstalledReport = doctor(doctorStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererDefaultInstalledReport.renderer.configured, "rust");
assert.strictEqual(rendererDefaultInstalledReport.renderer.installed, true);
assert.strictEqual(rendererDefaultInstalledReport.renderer.version, repoPackageVersion);

const rendererDefaultInstalledRun = spawnSync(
  process.execPath,
  [path.join(__dirname, "install-patched-codex.js"), "--doctor", "--prefix", doctorStockRoot],
  { encoding: "utf8", env: { ...process.env, PATH: `${doctorStockBin}:${process.env.PATH}` } },
);
assert.strictEqual(rendererDefaultInstalledRun.status, 0);
assert(
  rendererDefaultInstalledRun.stdout.includes(`renderer: rust (${path.join(doctorStockRoot, "codex-hud")}, v${repoPackageVersion}`),
  "doctor output must show an installed rust renderer",
);

// --- build-cache retention (Cargo target/ pruning under ~/.cache/codex-hud) ---
function makeSourceVersion(cacheDir, version, byteUnit) {
  const base = path.join(cacheDir, `openai-codex-rust-v${version}`);
  // shallow source clone bits that MUST be preserved when only target/ is stripped
  writeFile(base, ".git/config", "[core]\n");
  writeFile(base, "codex-rs/Cargo.toml", "[package]\n");
  // multi-GB-equivalent build outputs that MUST be reclaimed
  writeFile(base, "codex-rs/target/release/codex", "X".repeat(byteUnit));
  writeFile(base, "codex-rs/target/release/deps/lib.rlib", "Y".repeat(byteUnit));
  return base;
}

// helper sanity: byte accounting + cache-dir filtering
const bcSizeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-size-test-"));
fs.writeFileSync(path.join(bcSizeRoot, "a"), "12345"); // 5 bytes
writeFile(bcSizeRoot, "sub/b", "678"); // 3 bytes
assert.strictEqual(dirSizeBytes(bcSizeRoot), 8, "dirSizeBytes sums nested file bytes");
assert.strictEqual(formatBytes(0), "0 B");
assert.strictEqual(formatBytes(1024), "1.0 KB");
assert.strictEqual(formatBytes(1024 * 1024 * 1024), "1.0 GB");

const bcListRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-list-test-"));
makeSourceVersion(bcListRoot, "1.2.3", 10);
fs.mkdirSync(path.join(bcListRoot, "openai-codex-rust-vnot-a-version"), { recursive: true });
fs.mkdirSync(path.join(bcListRoot, "openai-codex-rust-v1.2.x"), { recursive: true });
fs.mkdirSync(path.join(bcListRoot, "unrelated-dir"), { recursive: true });
fs.writeFileSync(path.join(bcListRoot, "stray-file"), "z");
const bcList = listSourceCacheDirs({ cacheDir: bcListRoot });
assert.strictEqual(bcList.length, 1, "listSourceCacheDirs returns only valid openai-codex-rust-v<semver> dirs");
assert.strictEqual(bcList[0].version, "1.2.3");
assert.strictEqual(listSourceCacheDirs({ cacheDir: "/no/such/codex-hud/dir" }).length, 0, "missing cacheDir yields empty list");

// dry-run is a strict no-op (plan only, zero filesystem changes)
const bcDryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-dry-test-"));
for (const v of ["0.140.0", "0.141.0", "0.142.0"]) makeSourceVersion(bcDryRoot, v, 64);
const bcDryPlan = pruneBuildCache({ cacheDir: bcDryRoot, keepVersions: 2 }, { dryRun: true });
assert.strictEqual(bcDryPlan.dryRun, true);
assert.strictEqual(bcDryPlan.strippedTargets.length, 2, "dry-run plans to strip target/ from the 2 kept versions");
assert.strictEqual(bcDryPlan.removedDirs.length, 1, "dry-run plans to remove the 1 stale version dir");
assert(bcDryPlan.freedBytes > 0, "dry-run reports reclaimable bytes");
for (const v of ["0.140.0", "0.141.0", "0.142.0"]) {
  assert(fs.existsSync(path.join(bcDryRoot, `openai-codex-rust-v${v}`)), `dry-run must not delete ${v}`);
  assert(fs.existsSync(path.join(bcDryRoot, `openai-codex-rust-v${v}`, "codex-rs", "target")), `dry-run must not strip target/ for ${v}`);
}

// apply: strip target/ from kept (preserve shallow clone), remove whole stale dir beyond keep-versions
const bcApplyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-apply-test-"));
for (const v of ["0.140.0", "0.141.0", "0.142.0"]) makeSourceVersion(bcApplyRoot, v, 64);
const bcApplyPlan = pruneBuildCache({ cacheDir: bcApplyRoot, keepVersions: 2 }, { dryRun: false });
assert.strictEqual(bcApplyPlan.strippedTargets.length, 2);
assert.strictEqual(bcApplyPlan.removedDirs.length, 1);
for (const v of ["0.141.0", "0.142.0"]) {
  const base = path.join(bcApplyRoot, `openai-codex-rust-v${v}`);
  assert(fs.existsSync(base), `kept version ${v} dir must remain`);
  assert(!fs.existsSync(path.join(base, "codex-rs", "target")), `target/ must be stripped for kept ${v}`);
  assert(fs.existsSync(path.join(base, ".git", "config")), `shallow clone .git must be preserved for ${v}`);
  assert(fs.existsSync(path.join(base, "codex-rs", "Cargo.toml")), `source must be preserved for ${v}`);
}
assert(!fs.existsSync(path.join(bcApplyRoot, "openai-codex-rust-v0.140.0")), "stale version dir beyond keep-versions must be removed entirely");

// buildCacheReport totals + sub-threshold flag
const bcReportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-report-test-"));
makeSourceVersion(bcReportRoot, "0.142.0", 100);
makeSourceVersion(bcReportRoot, "0.141.0", 100);
const bcReport = buildCacheReport({ cacheDir: bcReportRoot });
assert.strictEqual(bcReport.dirs.length, 2);
assert(bcReport.total > 0);
assert.strictEqual(bcReport.overThreshold, false, "small fixture is under the warn threshold");
assert.strictEqual(bcReport.total, bcReport.dirs.reduce((sum, d) => sum + d.bytes, 0), "report total equals sum of per-dir bytes");

// doctor surfaces the build-cache report
const bcDoctorPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-doctor-test-"));
const bcDoctorCache = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-buildcache-doctor-cache-test-"));
makeSourceVersion(bcDoctorCache, "0.142.0", 50);
const bcDoctorReport = doctor(
  { prefix: bcDoctorPrefix, binName: "codex-hud-codex", launcherName: "codex-hud", renderer: "auto", cacheDir: bcDoctorCache },
  { env: { PATH: "" }, runCommand: () => "codex-cli 0.142.0\n" },
);
assert(bcDoctorReport.buildCache, "doctor report includes a buildCache section");
assert.strictEqual(bcDoctorReport.buildCache.dirs.length, 1);
assert(bcDoctorReport.buildCache.total > 0);

// install-flow cache pruning is best-effort: a cleanup failure must not abort a
// completed install before --make-default can finish.
const bcPostInstallLogs = [];
const bcPostInstallWarnings = [];
const bcPostInstallResult = pruneBuildCacheAfterInstall(
  { cacheDir: "/tmp/codex-hud-buildcache-failure-test", keepVersions: 2 },
  {
    pruneBuildCache() {
      throw new Error("permission denied");
    },
    log: (line) => bcPostInstallLogs.push(line),
    warn: (line) => bcPostInstallWarnings.push(line),
  },
);
assert.strictEqual(bcPostInstallResult.error, "permission denied");
assert.strictEqual(bcPostInstallLogs.length, 0, "failed pruning must not log success");
assert.strictEqual(bcPostInstallWarnings.length, 1, "failed pruning must emit one warning");
assert(
  bcPostInstallWarnings[0].includes("install completed but cache was retained"),
  "warning must say install completed and cache was retained",
);

console.log("patched Codex installer tests passed");
