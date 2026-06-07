#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { patchSource } = require("./install-patched-codex");

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

console.log("patched Codex installer tests passed");
