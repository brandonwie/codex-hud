#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  defaultStatusLineCommand,
  detectCodexVersion,
  detectLegacyLayout,
  detectStockCodex,
  doctor,
  findStockCodexPath,
  installBuiltBinary,
  installDefaultShim,
  installLauncher,
  installRustRenderer,
  isManagedDefaultShim,
  migrateLegacyLayout,
  parseArgs,
  parseLauncherMetadata,
  patchSource,
  pruneVersionDirs,
  renderLauncherScript,
  rendererBinaryName,
  resolveRenderer,
  reviewLegacyBinEntry,
  statusLineCommandFor,
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-patch-test-"));

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

const firstChanges = patchSource(root);
const secondChanges = patchSource(root);

const configTypes = fs.readFileSync(path.join(root, "codex-rs/config/src/types.rs"), "utf8");
const coreConfig = fs.readFileSync(path.join(root, "codex-rs/core/src/config/mod.rs"), "utf8");
const statusSurfaces = fs.readFileSync(path.join(root, "codex-rs/tui/src/chatwidget/status_surfaces.rs"), "utf8");

assert(firstChanges.length >= 5, "expected patchSource to patch every anchor");
assert.deepStrictEqual(secondChanges, [], "patchSource should be idempotent");
assert(configTypes.includes("pub status_line_command: Option<String>"));
assert(coreConfig.includes("pub tui_status_line_command: Option<String>"));
assert(coreConfig.includes("tui_status_line_command: cfg"));
assert(statusSurfaces.includes("fn custom_status_line_from_command"));
assert(statusSurfaces.includes("std::process::Command::new"));
assert(statusSurfaces.includes("fn ansi_status_line_to_line"));
assert(statusSurfaces.includes("ratatui::style::Color::Indexed"));

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
assert.strictEqual(parseArgs(["--keep-versions", "3"]).keepVersions, 3);
assert.strictEqual(parseArgs(["--version", "0.139.0-beta.1+build.2"]).version, "0.139.0-beta.1+build.2");
assert.throws(() => parseArgs(["--mode", "yolo"]), /--mode must be stock or patched/);
assert.throws(() => parseArgs(["--keep-versions", "0"]), /--keep-versions/);
assert.throws(() => parseArgs(["--bin-name", "../codex"]), /--bin-name must contain only/);
assert.throws(() => parseArgs(["--launcher-name", "codex*"]), /--launcher-name must contain only/);
assert.throws(() => parseArgs(["--version", "../../0.139.0"]), /--version must be a semver-like/);
assert.strictEqual(parsed.renderer, "auto", "default renderer must be auto");
assert.strictEqual(parseArgs(["--renderer", "rust"]).renderer, "rust");
assert.strictEqual(parseArgs(["--renderer", "js"]).renderer, "js");
assert.throws(() => parseArgs(["--renderer", "python"]), /--renderer must be auto, rust, or js/);
assert.throws(() => parseArgs(["--bin-name", "codex-hud-rs"]), /Refusing to use codex-hud-rs/);
assert.throws(() => parseArgs(["--launcher-name", "codex-hud-rs"]), /Refusing to use codex-hud-rs/);

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
  { mode: "patched", patchedBinary: stagedV2.target, patchedVersion: "2.0.0" },
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
const rendererSource = path.join(rendererRoot, "source", "codex-hud-rs");
const missingSource = path.join(rendererRoot, "source", "not-built");
writeExecutable(rendererSource, '#!/usr/bin/env bash\necho "codex-hud 0.2.0"\n');
const rendererPrefix = path.join(rendererRoot, "bin");
const rendererArgs = { prefix: rendererPrefix, renderer: "auto" };

assert.strictEqual(rendererBinaryName("darwin"), "codex-hud-rs");
assert.strictEqual(rendererBinaryName("linux"), "codex-hud-rs");
assert.strictEqual(rendererBinaryName("win32"), "codex-hud-rs.exe");
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
  path: path.join(rendererPrefix, "codex-hud-rs"),
  version: "0.2.0",
});
assert(fs.statSync(installedRenderer.path).mode & 0o111, "installed renderer must be executable");

const cleanupPrefix = path.join(rendererRoot, "cleanup-bin");
fs.mkdirSync(path.join(cleanupPrefix, "codex-hud-rs"), { recursive: true });
const cleanupResult = installRustRenderer({ prefix: cleanupPrefix }, { sourcePath: rendererSource });
assert.strictEqual(cleanupResult.status, "broken");
assert(
  !fs.readdirSync(cleanupPrefix).some((name) => name.includes(".tmp-")),
  "failed renderer installs must remove their temp file",
);

const existingRenderer = installRustRenderer(rendererArgs, { sourcePath: missingSource });
assert.deepStrictEqual(existingRenderer, {
  status: "existing",
  path: path.join(rendererPrefix, "codex-hud-rs"),
  version: "0.2.0",
});
assert.deepStrictEqual(resolveRenderer(rendererArgs, { sourcePath: missingSource }), {
  kind: "rust",
  path: path.join(rendererPrefix, "codex-hud-rs"),
});

writeExecutable(path.join(rendererPrefix, "codex-hud-rs"), "#!/usr/bin/env bash\nexit 1\n");
const brokenInstalled = installRustRenderer(rendererArgs, { sourcePath: missingSource });
assert.strictEqual(brokenInstalled.status, "broken");
assert.strictEqual(brokenInstalled.path, path.join(rendererPrefix, "codex-hud-rs"));
assert.match(brokenInstalled.error, /--help/, "broken renderer result must carry the health-check failure cause");
assert.deepStrictEqual(
  resolveRenderer(rendererArgs, { sourcePath: missingSource }),
  { kind: "js" },
  "auto must fall back to js when the installed renderer is broken",
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
assert.deepStrictEqual(
  resolveRenderer({ prefix: brokenSourcePrefix, renderer: "auto" }, { sourcePath: brokenSource }),
  { kind: "js" },
  "auto must fall back to js when the built source binary is broken",
);
assert(!fs.existsSync(path.join(brokenSourcePrefix, "codex-hud-rs")), "a broken source binary must never be installed");
assert.throws(
  () => resolveRenderer({ prefix: brokenSourcePrefix, renderer: "rust" }, { sourcePath: brokenSource }),
  /failed its --help health check/,
);

// broken source + healthy installed target: keep the working install
const keepPrefix = path.join(rendererRoot, "keep-bin");
writeExecutable(path.join(keepPrefix, "codex-hud-rs"), '#!/usr/bin/env bash\necho "codex-hud 0.2.0"\n');
assert.deepStrictEqual(
  resolveRenderer({ prefix: keepPrefix, renderer: "auto" }, { sourcePath: brokenSource }),
  { kind: "rust", path: path.join(keepPrefix, "codex-hud-rs") },
  "a broken build artifact must not downgrade a healthy installed renderer",
);

const emptyRendererPrefix = path.join(rendererRoot, "empty-bin");
assert.deepStrictEqual(installRustRenderer({ prefix: emptyRendererPrefix }, { sourcePath: missingSource }), {
  status: "missing",
  path: path.join(emptyRendererPrefix, "codex-hud-rs"),
});
assert.deepStrictEqual(
  resolveRenderer({ prefix: emptyRendererPrefix, renderer: "auto" }, { sourcePath: missingSource }),
  { kind: "js" },
  "auto must fall back to js when nothing is built",
);
assert.deepStrictEqual(resolveRenderer({ prefix: emptyRendererPrefix, renderer: "js" }, { sourcePath: rendererSource }), { kind: "js" });
assert.throws(
  () => resolveRenderer({ prefix: emptyRendererPrefix, renderer: "rust" }, { sourcePath: missingSource }),
  /npm run build:rust/,
);

// preview mode (install:false) must write nothing and track machine state
const previewPrefix = path.join(rendererRoot, "preview-bin");
assert.deepStrictEqual(
  resolveRenderer({ prefix: previewPrefix, renderer: "auto" }, { install: false, sourcePath: rendererSource }),
  { kind: "rust", path: path.join(previewPrefix, "codex-hud-rs"), preview: true },
);
assert(!fs.existsSync(path.join(previewPrefix, "codex-hud-rs")), "resolveRenderer install:false must not write to the prefix");
assert(!fs.existsSync(previewPrefix), "resolveRenderer install:false must not create the prefix");
assert.deepStrictEqual(
  resolveRenderer({ prefix: previewPrefix, renderer: "auto" }, { install: false, sourcePath: missingSource }),
  { kind: "js" },
);

// preview must health-check binaries so --print-config / the patched-install
// preview can never disagree with what the real install resolves.
assert.deepStrictEqual(
  resolveRenderer(rendererArgs, { install: false, sourcePath: missingSource }),
  { kind: "js" },
  "preview must fall back to js for a broken installed renderer, matching the install path",
);
assert.throws(
  () => resolveRenderer({ prefix: rendererPrefix, renderer: "rust" }, { install: false, sourcePath: missingSource }),
  /failed its --help health check/,
);
assert.deepStrictEqual(
  resolveRenderer(rendererArgs, { install: false, sourcePath: rendererSource }),
  { kind: "rust", path: path.join(rendererPrefix, "codex-hud-rs"), preview: true },
  "preview must offer the healthy source when the installed target is broken",
);
assert.deepStrictEqual(
  resolveRenderer({ prefix: keepPrefix, renderer: "auto" }, { install: false, sourcePath: brokenSource }),
  { kind: "rust", path: path.join(keepPrefix, "codex-hud-rs") },
  "preview must keep a healthy installed renderer despite a broken build artifact",
);

// --- statusLineCommandFor ---
assert.strictEqual(
  statusLineCommandFor({ kind: "rust", path: "/x/bin/codex-hud-rs" }),
  "'/x/bin/codex-hud-rs' --line --color",
);
assert.strictEqual(statusLineCommandFor({ kind: "js" }), defaultStatusLineCommand());
assert.match(statusLineCommandFor({ kind: "js" }), /^node '.*codex-hud\.js' --line --color$/);

// --- launcher renderer marker round-trips; stock stays free of status_line_command ---
const rustStatusLineCommand = statusLineCommandFor({ kind: "rust", path: path.join(rendererPrefix, "codex-hud-rs") });
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
assert(rustPatchedScript.includes("codex-hud-rs"), "patched -c override must carry the rust renderer");
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
const patchedExecCommand = statusLineCommandFor({ kind: "rust", path: path.join(patchedExecPrefix, "codex-hud-rs") });
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
assert(patchedExecArgv[1].includes("codex-hud-rs"));
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
const doctorStockArgs = { prefix: doctorStockRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
const doctorStockLauncher = installLauncher(doctorStockArgs, {
  mode: "stock",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStock,
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
  stockRealpath: doctorFakeStock,
  stockVersion: "0.138.0",
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

// --- doctor renderer reporting ---
const repoPackageVersion = require("../package.json").version;

// (1a) stock launcher with renderer=rust marker, no codex-hud-rs binary: informational only.
const doctorRendererStockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-doctor-renderer-stock-test-"));
const doctorRendererStockArgs = { prefix: doctorRendererStockRoot, binName: "codex-hud-codex", launcherName: "codex-hud-tui" };
installLauncher(doctorRendererStockArgs, {
  mode: "stock",
  stockPath: doctorFakeStock,
  stockRealpath: doctorFakeStock,
  stockVersion: "0.139.0",
  renderer: "rust",
});
const rendererStockReport = doctor(doctorRendererStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(rendererStockReport.renderer.configured, "rust");
assert.strictEqual(rendererStockReport.renderer.installed, false);
assert.strictEqual(rendererStockReport.renderer.binPath, path.join(doctorRendererStockRoot, "codex-hud-rs"));
assert.strictEqual(rendererStockReport.healthy, true, "missing renderer must not break a stock entrypoint chain");
assert(
  !rendererStockReport.recommendations.some((entry) => entry.includes("codex-hud-rs")),
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
  stockRealpath: doctorFakeStock,
  stockVersion: "0.139.0",
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
  rendererPatchedReport.recommendations.some((entry) => /codex-hud-rs.*missing/.test(entry)),
  "patched-mode missing renderer must recommend a rebuild",
);

// (2) installed codex-hud-rs matching the repo version: no renderer recommendation.
writeExecutable(path.join(doctorRendererPatchedRoot, "codex-hud-rs"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
const rendererInstalledReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud-rs") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererInstalledReport.renderer.installed, true);
assert.strictEqual(rendererInstalledReport.renderer.version, repoPackageVersion);
assert(!rendererInstalledReport.recommendations.some((entry) => entry.includes("codex-hud-rs")));

// (3) installed codex-hud-rs behind the repo version: staleness recommendation.
const rendererStaleReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud-rs") ? "codex-hud 0.1.0\n" : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererStaleReport.renderer.installed, true);
assert.strictEqual(rendererStaleReport.renderer.version, "0.1.0");
assert(
  rendererStaleReport.recommendations.some((entry) => entry.includes("codex-hud-rs") && /rebuild/.test(entry)),
  "stale renderer must recommend a rebuild",
);

// (3b) installed codex-hud-rs whose --help health check fails: reported broken (not missing)
// and, in patched mode, the entrypoint chain is unhealthy because every launch injects it.
const rendererBrokenReport = doctor(doctorRendererPatchedArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => {
    if (command.endsWith("codex-hud-rs")) {
      throw new Error("exec format error");
    }
    return "codex-cli 0.139.0\n";
  },
});
assert.strictEqual(rendererBrokenReport.renderer.installed, false);
assert.strictEqual(rendererBrokenReport.renderer.broken, true);
assert.strictEqual(rendererBrokenReport.healthy, false, "patched-mode broken renderer must break the entrypoint chain");
assert(
  rendererBrokenReport.anomalies.some((entry) => entry.includes("installed codex-hud-rs failed --help health check")),
  "broken renderer must surface the health-check failure as an anomaly",
);
assert(
  rendererBrokenReport.recommendations.some((entry) => entry.includes("broken") && entry.includes("npm run build:rust")),
  "patched-mode broken renderer must recommend a rebuild and say broken, not missing",
);

// (4) v2 launcher without a renderer marker means the js renderer.
const rendererDefaultReport = doctor(doctorStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: () => "codex-cli 0.139.0\n",
});
assert.strictEqual(rendererDefaultReport.renderer.configured, "js");
assert.strictEqual(rendererDefaultReport.renderer.installed, false);

const rendererDefaultRun = spawnSync(
  process.execPath,
  [path.join(__dirname, "install-patched-codex.js"), "--doctor", "--prefix", doctorStockRoot],
  { encoding: "utf8", env: { ...process.env, PATH: `${doctorStockBin}:${process.env.PATH}` } },
);
assert.strictEqual(rendererDefaultRun.status, 0);
assert(
  rendererDefaultRun.stdout.includes("renderer: js (node renderer; rust binary missing at"),
  "js-configured doctor output must still mention the missing rust binary",
);

writeExecutable(path.join(doctorStockRoot, "codex-hud-rs"), `#!/usr/bin/env bash\necho codex-hud ${repoPackageVersion}\n`);
const rendererDefaultInstalledReport = doctor(doctorStockArgs, {
  env: { PATH: doctorStockBin },
  runCommand: (command) => (command.endsWith("codex-hud-rs") ? `codex-hud ${repoPackageVersion}\n` : "codex-cli 0.139.0\n"),
});
assert.strictEqual(rendererDefaultInstalledReport.renderer.configured, "js");
assert.strictEqual(rendererDefaultInstalledReport.renderer.installed, true);
assert.strictEqual(rendererDefaultInstalledReport.renderer.version, repoPackageVersion);

const rendererDefaultInstalledRun = spawnSync(
  process.execPath,
  [path.join(__dirname, "install-patched-codex.js"), "--doctor", "--prefix", doctorStockRoot],
  { encoding: "utf8", env: { ...process.env, PATH: `${doctorStockBin}:${process.env.PATH}` } },
);
assert.strictEqual(rendererDefaultInstalledRun.status, 0);
assert(
  rendererDefaultInstalledRun.stdout.includes(`renderer: rust (${path.join(doctorStockRoot, "codex-hud-rs")}, v${repoPackageVersion}`),
  "doctor output must show an installed rust renderer even when configured renderer is js",
);

console.log("patched Codex installer tests passed");
