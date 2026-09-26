"use strict";

// The patch set codex-hud applies to the upstream OpenAI Codex source for its
// patched runtime. PATCH_SET_ID is derived from this file's own bytes, so any
// edit here yields a new runtime identity in release asset names, runtime
// manifests, and launcher markers. That is what makes published runtimes and
// installed launchers go stale automatically instead of relying on a hand-bumped
// revision.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function computePatchSetId(source) {
  const normalized = String(source).replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

const PATCH_SET_ID = computePatchSetId(fs.readFileSync(__filename, "utf8"));

function applyTextPatch(filePath, marker, anchor, replacement) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes(marker)) {
    return false;
  }
  if (!current.includes(anchor)) {
    throw new Error(`Patch anchor not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, current.replace(anchor, replacement));
  return true;
}

function statusCommandHelperSource() {
  return [
    "    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {",
    "        let command = self.config.tui_status_line_command.as_ref()?.trim();",
    "        if command.is_empty() {",
    "            return None;",
    "        }",
    "",
    "        let mut process = if cfg!(windows) {",
    "            let mut process = std::process::Command::new(\"cmd\");",
    "            process.args([\"/C\", command]);",
    "            process",
    "        } else {",
    "            let mut process = std::process::Command::new(\"sh\");",
    "            process.args([\"-lc\", command]);",
    "            process",
    "        };",
    "",
    "        process.env(\"CODEX_HUD_MODEL\", self.current_model());",
    "        process.env(",
    "            \"CODEX_HUD_EFFORT\",",
    "            self.effective_reasoning_effort()",
    "                .map(|e| e.to_string())",
    "                .unwrap_or_default(),",
    "        );",
    "        process.env(\"CODEX_HUD_SERVICE_TIER\", self.current_service_tier().unwrap_or_default());",
    "        process.env(",
    "            \"CODEX_HUD_ROLLOUT_PATH\",",
    "            self.rollout_path()",
    "                .map(|p| p.to_string_lossy().into_owned())",
    "                .unwrap_or_default(),",
    "        );",
    "",
    "        let output = process.current_dir(self.status_line_cwd()).output().ok()?;",
    "        if !output.status.success() {",
    "            return None;",
    "        }",
    "",
    "        let text = String::from_utf8_lossy(&output.stdout)",
    "            .lines()",
    "            .next()",
    "            .unwrap_or(\"\")",
    "            .trim()",
    "            .to_string();",
    "        if text.is_empty() {",
    "            return None;",
    "        }",
    "",
    "        Some(Self::ansi_status_line_to_line(&text))",
    "    }",
    "",
    "    fn ansi_status_line_to_line(text: &str) -> ratatui::text::Line<'static> {",
    "        let mut spans = Vec::new();",
    "        let mut buffer = String::new();",
    "        let mut style = ratatui::style::Style::default();",
    "        let mut chars = text.chars().peekable();",
    "",
    "        while let Some(ch) = chars.next() {",
    "            if ch == '\\u{1b}' && chars.peek() == Some(&'[') {",
    "                chars.next();",
    "                let mut sequence = String::new();",
    "                for next in chars.by_ref() {",
    "                    if next == 'm' {",
    "                        break;",
    "                    }",
    "                    sequence.push(next);",
    "                }",
    "",
    "                if !buffer.is_empty() {",
    "                    spans.push(ratatui::text::Span::styled(std::mem::take(&mut buffer), style));",
    "                }",
    "                Self::apply_ansi_status_style(&sequence, &mut style);",
    "            } else {",
    "                buffer.push(ch);",
    "            }",
    "        }",
    "",
    "        if !buffer.is_empty() {",
    "            spans.push(ratatui::text::Span::styled(buffer, style));",
    "        }",
    "",
    "        ratatui::text::Line::from(spans)",
    "    }",
    "",
    "    fn apply_ansi_status_style(sequence: &str, style: &mut ratatui::style::Style) {",
    "        let codes = if sequence.is_empty() {",
    "            vec![0]",
    "        } else {",
    "            sequence",
    "                .split(';')",
    "                .filter_map(|part| part.parse::<u16>().ok())",
    "                .collect::<Vec<_>>()",
    "        };",
    "",
    "        let mut index = 0;",
    "        while index < codes.len() {",
    "            match codes[index] {",
    "                0 | 39 => *style = ratatui::style::Style::default(),",
    "                30..=37 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed((codes[index] - 30) as u8));",
    "                }",
    "                90..=97 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed((codes[index] - 90 + 8) as u8));",
    "                }",
    "                38 if index + 2 < codes.len() && codes[index + 1] == 5 => {",
    "                    *style = (*style).fg(ratatui::style::Color::Indexed(codes[index + 2] as u8));",
    "                    index += 2;",
    "                }",
    "                _ => {}",
    "            }",
    "            index += 1;",
    "        }",
    "    }",
  ].join("\n");
}

function ensureAnsiStatusLineParser(filePath) {
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes("CODEX_HUD_MODEL")) {
    return false;
  }

  const startNeedle = "    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {";
  const endNeedle = "\n\n    /// Clears the terminal title Codex most recently wrote, if any.";
  const start = current.indexOf(startNeedle);
  const end = start === -1 ? -1 : current.indexOf(endNeedle, start);
  if (start === -1 || end === -1) {
    throw new Error(`ANSI parser patch anchor not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, current.slice(0, start) + statusCommandHelperSource() + current.slice(end));
  return true;
}

function ensureRemotePluginDisableRegressionTest(filePath) {
  const current = fs.readFileSync(filePath, "utf8");
  const originalName = "async fn remote_installed_plugin_preserves_configured_mcp_server_policy()";
  const regressionName = "async fn remote_installed_plugin_respects_local_disable()";
  if (current.includes(regressionName)) {
    return false;
  }

  const start = current.indexOf(originalName);
  const end = start === -1 ? -1 : current.indexOf("\n#[tokio::test]", start + originalName.length);
  if (start === -1) {
    throw new Error(`Remote plugin regression-test anchor not found in ${filePath}`);
  }

  const resolvedEnd = end === -1 ? current.length : end;
  const testBody = current.slice(start, resolvedEnd);
  const localDisableConfig = `[plugins."linear@openai-curated-remote"]
enabled = false`;
  if (!testBody.includes(localDisableConfig)) {
    throw new Error(`Remote plugin local-disable fixture not found in ${filePath}`);
  }

  const enabledPolicyTest = testBody.replace(
    localDisableConfig,
    `[plugins."linear@openai-curated-remote"]
enabled = true`,
  );
  const regressionTest = `

#[tokio::test]
async fn remote_installed_plugin_respects_local_disable() {
    let codex_home = TempDir::new().unwrap();
    write_cached_plugin(codex_home.path(), "openai-curated-remote", "linear");
    write_file(
        &codex_home.path().join(CONFIG_TOML_FILE),
        r#"[features]
plugins = true

[plugins."linear@openai-curated-remote"]
enabled = false
"#,
    );

    let config = load_config(codex_home.path(), codex_home.path()).await;
    let manager = PluginsManager::new_with_options(
        codex_home.path().to_path_buf(),
        Some(Product::Codex),
        Some(AuthMode::Chatgpt),
    );
    manager.write_remote_installed_plugins_cache(vec![remote_installed_linear_plugin()]);

    let outcome = manager.plugins_for_config(&config).await;
    let plugin = outcome
        .plugins()
        .iter()
        .find(|plugin| plugin.config_name == "linear@openai-curated-remote")
        .expect("remote plugin should be loaded");

    assert!(!plugin.enabled);
    assert!(plugin.mcp_servers.is_empty());
}`;
  fs.writeFileSync(
    filePath,
    current.slice(0, start) + enabledPolicyTest + regressionTest + current.slice(resolvedEnd),
  );
  return true;
}

function patchSource(sourceRoot) {
  const configTypes = path.join(sourceRoot, "codex-rs", "config", "src", "types.rs");
  const coreConfig = path.join(sourceRoot, "codex-rs", "core", "src", "config", "mod.rs");
  const pluginLoader = path.join(sourceRoot, "codex-rs", "core-plugins", "src", "loader.rs");
  const pluginManagerTests = path.join(sourceRoot, "codex-rs", "core-plugins", "src", "manager_tests.rs");
  const execLib = path.join(sourceRoot, "codex-rs", "exec", "src", "lib.rs");
  const execMain = path.join(sourceRoot, "codex-rs", "exec", "src", "main.rs");
  const cliMain = path.join(sourceRoot, "codex-rs", "cli", "src", "main.rs");
  const statusSurfaces = path.join(sourceRoot, "codex-rs", "tui", "src", "chatwidget", "status_surfaces.rs");
  const skillsHelpers = path.join(sourceRoot, "codex-rs", "tui", "src", "skills_helpers.rs");

  const changes = [];

  if (applyTextPatch(
    configTypes,
    "pub status_line_command: Option<String>",
    `    #[serde(default)]
    pub status_line: Option<Vec<String>>,

    /// Color status line items with colors derived from the active syntax theme.`,
    `    #[serde(default)]
    pub status_line: Option<Vec<String>>,

    /// Shell command used to render a custom status line. When set, it overrides status_line.
    #[serde(default)]
    pub status_line_command: Option<String>,

    /// Color status line items with colors derived from the active syntax theme.`,
  )) {
    changes.push("config Tui.status_line_command");
  }

  if (applyTextPatch(
    coreConfig,
    "pub tui_status_line_command: Option<String>",
    `    pub tui_status_line: Option<Vec<String>>,

    /// Whether to color status line items with colors from the active syntax theme.`,
    `    pub tui_status_line: Option<Vec<String>>,

    /// Shell command that renders a custom TUI status line.
    pub tui_status_line_command: Option<String>,

    /// Whether to color status line items with colors from the active syntax theme.`,
  )) {
    changes.push("core Config.tui_status_line_command");
  }

  if (applyTextPatch(
    coreConfig,
    "tui_status_line_command: cfg",
    `            tui_status_line: cfg.tui.as_ref().and_then(|t| t.status_line.clone()),
            tui_status_line_use_colors: cfg`,
    `            tui_status_line: cfg.tui.as_ref().and_then(|t| t.status_line.clone()),
            tui_status_line_command: cfg
                .tui
                .as_ref()
                .and_then(|t| t.status_line_command.clone()),
            tui_status_line_use_colors: cfg`,
  )) {
    changes.push("core ConfigBuilder status_line_command resolution");
  }

  if (applyTextPatch(
    statusSurfaces,
    "fn custom_status_line_from_command",
    `    fn refresh_status_line_from_selections(&mut self, selections: &StatusSurfaceSelections) {
        let enabled = !selections.status_line_items.is_empty();`,
    `    fn refresh_status_line_from_selections(&mut self, selections: &StatusSurfaceSelections) {
        if let Some(status_line) = self.custom_status_line_from_command() {
            self.bottom_pane.set_status_line_enabled(true);
            self.set_status_line(Some(status_line));
            self.set_status_line_hyperlink(None);
            return;
        }

        let enabled = !selections.status_line_items.is_empty();`,
  )) {
    changes.push("TUI status-line command render hook");
  }

  if (applyTextPatch(
    statusSurfaces,
    "status_line_command.as_ref",
    `        self.set_status_line_hyperlink(hyperlink_url);
    }

    /// Clears the terminal title Codex most recently wrote, if any.`,
    `        self.set_status_line_hyperlink(hyperlink_url);
    }

    fn custom_status_line_from_command(&self) -> Option<ratatui::text::Line<'static>> {
        let command = self.config.tui_status_line_command.as_ref()?.trim();
        if command.is_empty() {
            return None;
        }

        let mut process = if cfg!(windows) {
            let mut process = std::process::Command::new("cmd");
            process.args(["/C", command]);
            process
        } else {
            let mut process = std::process::Command::new("sh");
            process.args(["-lc", command]);
            process
        };

        let output = process.current_dir(self.status_line_cwd()).output().ok()?;
        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return None;
        }

        Some(ratatui::text::Line::from(text))
    }

    /// Clears the terminal title Codex most recently wrote, if any.`,
  )) {
    changes.push("TUI status-line command helper");
  }

  if (ensureAnsiStatusLineParser(statusSurfaces)) {
    changes.push("TUI ANSI status-line parser");
  }

  const localSettings = path.join(sourceRoot, "codex-rs", "tui", "src", "local_settings.rs");
  if (fs.existsSync(localSettings) && applyTextPatch(
    localSettings,
    "status_line_command: config.tui_status_line_command.clone(),",
    `                status_line: config.tui_status_line.clone(),
                status_line_use_colors: config.tui_status_line_use_colors,`,
    `                status_line: config.tui_status_line.clone(),
                status_line_command: config.tui_status_line_command.clone(),
                status_line_use_colors: config.tui_status_line_use_colors,`,
  )) {
    changes.push("TUI local_settings status_line_command");
  }

  if (applyTextPatch(
    pluginLoader,
    "remote_plugin_config.enabled &= configured_plugin.enabled;",
    `    if let Some(configured_plugin) = configured_plugins.get(&plugin_key) {
        remote_plugin_config
            .mcp_servers
            .clone_from(&configured_plugin.mcp_servers);
    }`,
    `    if let Some(configured_plugin) = configured_plugins.get(&plugin_key) {
        // Remote state is authoritative for availability, while local config is a
        // user-controlled kill switch. Both must permit the plugin.
        remote_plugin_config.enabled &= configured_plugin.enabled;
        remote_plugin_config
            .mcp_servers
            .clone_from(&configured_plugin.mcp_servers);
    }`,
  )) {
    changes.push("remote plugin local-disable precedence");
  }

  if (ensureRemotePluginDisableRegressionTest(pluginManagerTests)) {
    changes.push("remote plugin local-disable regression test");
  }

  if (applyTextPatch(
    execLib,
    `#![recursion_limit = "256"]`,
    `// For both modes, any other output must be written to stderr.
#![deny(clippy::print_stdout)]`,
    `// For both modes, any other output must be written to stderr.
#![recursion_limit = "256"]
#![deny(clippy::print_stdout)]`,
  )) {
    changes.push("codex-exec compiler recursion limit");
  }

  if (applyTextPatch(
    execMain,
    `#![recursion_limit = "256"]`,
    `//! of the \`codex-exec\` binary.
use clap::Parser;`,
    `//! of the \`codex-exec\` binary.
#![recursion_limit = "256"]

use clap::Parser;`,
  )) {
    changes.push("codex-exec binary compiler recursion limit");
  }

  if (applyTextPatch(
    cliMain,
    `#![recursion_limit = "256"]`,
    `use clap::Args;`,
    `#![recursion_limit = "256"]

use clap::Args;`,
  )) {
    changes.push("codex CLI compiler recursion limit");
  }

  // Render plugin-contributed skills in the interactive TUI picker / mention
  // popup / composer as `plugin:skill` (e.g. `3b:wrap`) instead of the upstream
  // `skill (plugin)` inversion (`wrap (3b)`). Matches the model-prompt label
  // (core-skills render) and the Claude `/3b:` surface. Only the plugin branch
  // (skill.name contains ':') is affected; bare skills fall through unchanged.
  if (applyTextPatch(
    skillsHelpers,
    `format!("{plugin_name}:{skill_name}")`,
    `        return format!("{skill_name} ({plugin_name})");`,
    `        return format!("{plugin_name}:{skill_name}");`,
  )) {
    changes.push("TUI skill picker plugin:skill label");
  }

  return changes;
}

function verifyPatchedSource(sourceRoot) {
  const statusSurfaces = path.join(sourceRoot, "codex-rs", "tui", "src", "chatwidget", "status_surfaces.rs");
  const current = fs.readFileSync(statusSurfaces, "utf8");
  if (!current.includes("CODEX_HUD_MODEL")) {
    throw new Error(`Patched Codex source is missing CODEX_HUD_MODEL env injection: ${statusSurfaces}`);
  }

  const pluginLoader = path.join(sourceRoot, "codex-rs", "core-plugins", "src", "loader.rs");
  const pluginLoaderSource = fs.readFileSync(pluginLoader, "utf8");
  if (!pluginLoaderSource.includes("remote_plugin_config.enabled &= configured_plugin.enabled;")) {
    throw new Error(`Patched Codex source is missing remote plugin local-disable precedence: ${pluginLoader}`);
  }

  const pluginManagerTests = path.join(sourceRoot, "codex-rs", "core-plugins", "src", "manager_tests.rs");
  const pluginManagerTestSource = fs.readFileSync(pluginManagerTests, "utf8");
  if (
    !pluginManagerTestSource.includes("remote_installed_plugin_respects_local_disable") ||
    !pluginManagerTestSource.includes("assert!(!plugin.enabled);")
  ) {
    throw new Error(`Patched Codex source is missing the remote plugin local-disable regression guard: ${pluginManagerTests}`);
  }

  const execLib = path.join(sourceRoot, "codex-rs", "exec", "src", "lib.rs");
  const execLibSource = fs.readFileSync(execLib, "utf8");
  if (!execLibSource.includes(`#![recursion_limit = "256"]`)) {
    throw new Error(`Patched Codex source is missing the codex-exec compiler recursion limit: ${execLib}`);
  }
  const execMain = path.join(sourceRoot, "codex-rs", "exec", "src", "main.rs");
  const execMainSource = fs.readFileSync(execMain, "utf8");
  if (!execMainSource.includes(`#![recursion_limit = "256"]`)) {
    throw new Error(`Patched Codex source is missing the codex-exec binary compiler recursion limit: ${execMain}`);
  }
  const cliMain = path.join(sourceRoot, "codex-rs", "cli", "src", "main.rs");
  const cliMainSource = fs.readFileSync(cliMain, "utf8");
  if (!cliMainSource.includes(`#![recursion_limit = "256"]`)) {
    throw new Error(`Patched Codex source is missing the Codex CLI compiler recursion limit: ${cliMain}`);
  }
}

function sourceHasPatch(sourceRoot) {
  const checks = [
    ["codex-rs/config/src/types.rs", "pub status_line_command: Option<String>"],
    ["codex-rs/core/src/config/mod.rs", "pub tui_status_line_command: Option<String>"],
    ["codex-rs/exec/src/lib.rs", `#![recursion_limit = "256"]`],
    ["codex-rs/exec/src/main.rs", `#![recursion_limit = "256"]`],
    ["codex-rs/cli/src/main.rs", `#![recursion_limit = "256"]`],
    ["codex-rs/tui/src/chatwidget/status_surfaces.rs", "fn custom_status_line_from_command"],
  ];

  return checks.every(([relativePath, marker]) => {
    const filePath = path.join(sourceRoot, relativePath);
    return fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8").includes(marker);
  });
}

module.exports = {
  PATCH_SET_ID,
  applyTextPatch,
  computePatchSetId,
  ensureAnsiStatusLineParser,
  ensureRemotePluginDisableRegressionTest,
  patchSource,
  sourceHasPatch,
  statusCommandHelperSource,
  verifyPatchedSource,
};
