#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  detectCodexVersion,
  installBuiltBinary,
  installDefaultShim,
  isManagedDefaultShim,
  parseArgs,
  patchSource,
  uninstallDefaultShim,
  verifyInstalledBinary,
} = require("./install-patched-codex");

function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
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

const shimRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-shim-test-"));
const launcher = path.join(shimRoot, "codex-hud-tui");
const shim = path.join(shimRoot, "codex");
fs.writeFileSync(launcher, "#!/usr/bin/env bash\nexit 0\n");
fs.chmodSync(launcher, 0o755);

const { installLauncher } = require("./install-patched-codex");
const generatedLauncher = installLauncher(path.join(shimRoot, "codex-hud-codex"), {
  prefix: shimRoot,
  launcherName: "generated-codex-hud-tui",
});
const generatedLauncherText = fs.readFileSync(generatedLauncher, "utf8");
assert(generatedLauncherText.includes("exec -a codex "), "launcher should preserve argv[0] as codex for terminal process detection");
assert(generatedLauncherText.includes("--line --color"));

const parsed = parseArgs(["--make-default", "--force-shim", "--prefix", shimRoot]);
assert.strictEqual(parsed.makeDefault, true);
assert.strictEqual(parsed.forceShim, true);
assert.strictEqual(parsed.prefix, shimRoot);

const versionShimRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-version-shim-test-"));
const versionRealRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-version-real-test-"));
const versionLauncher = path.join(versionShimRoot, "codex-hud-tui");
const versionShim = path.join(versionShimRoot, "codex");
const versionRealCodex = path.join(versionRealRoot, "codex");
fs.writeFileSync(versionLauncher, "#!/usr/bin/env bash\necho codex-cli 0.137.0\n");
fs.chmodSync(versionLauncher, 0o755);
fs.symlinkSync(versionLauncher, versionShim);
fs.writeFileSync(versionRealCodex, "#!/usr/bin/env bash\necho codex-cli 0.138.0\n");
fs.chmodSync(versionRealCodex, 0o755);

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

const healthCheckCodex = path.join(shimRoot, "health-check-codex");
fs.writeFileSync(healthCheckCodex, "#!/usr/bin/env bash\necho codex-cli 1.2.3\n");
fs.chmodSync(healthCheckCodex, 0o755);
assert.strictEqual(verifyInstalledBinary(healthCheckCodex, { version: "1.2.3" }), "1.2.3");
assert.throws(() => verifyInstalledBinary(healthCheckCodex, { version: "1.2.4" }), /version mismatch/);

const installSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-install-source-test-"));
const installPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "codex-hud-install-prefix-test-"));
const outsideCodex = path.join(installPrefix, "outside-codex");
writeFile(installSourceRoot, "codex-rs/target/release/codex", "patched codex\n");
fs.chmodSync(path.join(installSourceRoot, "codex-rs/target/release/codex"), 0o755);
fs.writeFileSync(outsideCodex, "stock codex\n");
fs.symlinkSync(outsideCodex, path.join(installPrefix, "codex-hud-codex"));
const installedBinary = installBuiltBinary(installSourceRoot, { prefix: installPrefix, binName: "codex-hud-codex" });
const installedBackingBinary = path.join(installPrefix, "codex-hud-codex.d", process.platform === "win32" ? "codex.exe" : "codex");
assert.strictEqual(fs.lstatSync(installedBinary).isSymbolicLink(), true);
assert.strictEqual(fs.realpathSync.native(installedBinary), fs.realpathSync.native(installedBackingBinary));
assert.strictEqual(path.basename(fs.realpathSync.native(installedBinary)), process.platform === "win32" ? "codex.exe" : "codex");
assert.strictEqual(fs.readFileSync(installedBinary, "utf8"), "patched codex\n");
assert.strictEqual(fs.readFileSync(outsideCodex, "utf8"), "stock codex\n");

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

console.log("patched Codex installer tests passed");
