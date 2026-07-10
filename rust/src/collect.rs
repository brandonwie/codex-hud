use crate::compat;
use crate::hudcfg;
use crate::util;
use serde_json::{json, Map, Value};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

// SSoT: Cargo.toml owns the version; release tooling bumps it there only.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Port of gitInfo(): branch + porcelain counts via the git CLI.
pub fn git_info(cwd: &Path) -> Value {
    let root = util::run(
        "git",
        &["rev-parse", "--show-toplevel"],
        Some(cwd),
        util::DEFAULT_TIMEOUT_MS,
    );
    let root = match root {
        Some(r) if !r.is_empty() => r,
        _ => return json!({ "available": false }),
    };
    let root_path = Path::new(&root);

    let branch = util::run(
        "git",
        &["branch", "--show-current"],
        Some(root_path),
        util::DEFAULT_TIMEOUT_MS,
    )
    .filter(|b| !b.is_empty())
    .unwrap_or_else(|| "detached".to_string());
    let porcelain = util::run(
        "git",
        &["status", "--porcelain=v1", "-b"],
        Some(root_path),
        util::DEFAULT_TIMEOUT_MS,
    )
    .unwrap_or_default();
    let lines: Vec<&str> = porcelain
        .split(['\r', '\n'])
        .filter(|l| !l.is_empty())
        .collect();
    let header = match lines.first() {
        Some(first) if first.starts_with("## ") => first[3..].to_string(),
        _ => branch.clone(),
    };
    let entries: Vec<&str> = lines
        .iter()
        .filter(|l| !l.starts_with("## "))
        .copied()
        .collect();

    let mut modified = 0;
    let mut added = 0;
    let mut deleted = 0;
    let mut renamed = 0;
    let mut untracked = 0;
    let mut other = 0;
    for line in &entries {
        let code: String = line.chars().take(2).collect();
        if code == "??" {
            untracked += 1;
        } else if code.contains('M') {
            modified += 1;
        } else if code.contains('A') {
            added += 1;
        } else if code.contains('D') {
            deleted += 1;
        } else if code.contains('R') {
            renamed += 1;
        } else {
            other += 1;
        }
    }

    json!({
        "available": true,
        "root": root,
        "branch": branch,
        "header": header,
        "dirty": entries.len(),
        "counts": {
            "modified": modified,
            "added": added,
            "deleted": deleted,
            "renamed": renamed,
            "untracked": untracked,
            "other": other,
        },
    })
}

/// Port of nearestPackage(): closest package.json up the tree.
pub fn nearest_package(cwd: &Path) -> Value {
    let Some(package_path) = util::find_up(cwd, "package.json") else {
        return Value::Null;
    };
    let path_str = package_path.display().to_string();
    let parsed =
        util::read_text(&package_path).and_then(|text| serde_json::from_str::<Value>(&text).ok());
    match parsed {
        Some(parsed) => {
            let name = parsed
                .get("name")
                .filter(|v| compat::truthy(Some(v)))
                .cloned()
                .unwrap_or(Value::Null);
            let version = parsed
                .get("version")
                .filter(|v| compat::truthy(Some(v)))
                .cloned()
                .unwrap_or(Value::Null);
            json!({ "path": path_str, "name": name, "version": version })
        }
        None => json!({ "path": path_str, "name": null, "version": null }),
    }
}

/// Port of projectHints(): AGENTS.md, nearest package, ACTIVE-STATUS priority.
pub fn project_hints(cwd: &Path, git_root: Option<&Path>) -> Value {
    let agents_path = util::find_up(cwd, "AGENTS.md")
        .map(|p| Value::String(p.display().to_string()))
        .unwrap_or(Value::Null);
    let active_priority = git_root
        .map(|root| root.join("ACTIVE-STATUS.md"))
        .and_then(|p| util::read_text(&p))
        .and_then(|text| {
            text.split(['\r', '\n'])
                .map(|line| line.trim())
                .find(|line| line.starts_with("- ("))
                .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        })
        .map(Value::String)
        .unwrap_or(Value::Null);

    json!({
        "agentsPath": agents_path,
        "package": nearest_package(cwd),
        "activePriority": active_priority,
    })
}

/// Port of hookSummary(): per-event hook counts from hooks.json.
pub fn hook_summary(codex_home: &Path) -> Value {
    let hook_path = codex_home.join("hooks.json");
    let path_str = hook_path.display().to_string();
    let Some(text) = util::read_text(&hook_path) else {
        return json!({ "path": path_str, "events": {} });
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(parsed) => {
            let mut events = Map::new();
            if let Some(hooks) = parsed.get("hooks").and_then(|h| h.as_object()) {
                for (event, groups) in hooks {
                    let count = match groups.as_array() {
                        Some(groups) => groups
                            .iter()
                            .map(|group| {
                                group
                                    .get("hooks")
                                    .and_then(|h| h.as_array())
                                    .map(|h| h.len())
                                    .unwrap_or(0)
                            })
                            .sum::<usize>(),
                        None => 0,
                    };
                    events.insert(event.clone(), Value::from(count));
                }
            }
            json!({ "path": path_str, "events": events })
        }
        Err(err) => json!({ "path": path_str, "error": err.to_string(), "events": {} }),
    }
}

/// Port of listSessionFiles(): rollout-*.jsonl under sessions/, newest first.
pub fn list_session_files(codex_home: &Path) -> Vec<PathBuf> {
    let sessions_root = codex_home.join("sessions");
    let mut files: Vec<PathBuf> = Vec::new();

    // Codex stores rollouts under sessions/YYYY/MM/DD/. Walk directories in
    // DESCENDING name order (zero-padded numeric names sort chronologically), so
    // the 3000-entry cap drops the OLDEST sessions — never the newest. An
    // unordered walk could hit the cap before reaching a newer, not-yet-walked
    // directory and silently return stale usage.
    fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
        if files.len() > 3000 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut subdirs: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let full_path = entry.path();
            if full_path.is_dir() {
                subdirs.push(full_path);
            } else if let Some(name) = full_path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("rollout-") && name.ends_with(".jsonl") {
                    files.push(full_path);
                }
            }
        }
        subdirs.sort_unstable_by(|a, b| b.file_name().cmp(&a.file_name()));
        for sub in subdirs {
            if files.len() > 3000 {
                break;
            }
            walk(&sub, files);
        }
    }

    walk(&sessions_root, &mut files);
    files.sort_by_cached_key(|f| std::cmp::Reverse(mtime_ms(f)));
    files
}

fn mtime_ms(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Port of readTailLines(): last maxLines lines of a trimmed file.
pub fn read_tail_lines(path: &Path, max_lines: usize) -> Vec<String> {
    let Some(text) = util::read_text(path) else {
        return Vec::new();
    };
    let lines: Vec<&str> = text
        .trim()
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].iter().map(|l| l.to_string()).collect()
}

/// Port of parseTokenCount(): one rollout JSONL line -> token_count event.
pub fn parse_token_count(line: &str) -> Option<Value> {
    let event: Value = serde_json::from_str(line).ok()?;
    let payload = event.get("payload")?;
    if payload.get("type").and_then(|t| t.as_str()) != Some("token_count") {
        return None;
    }
    let or_null = |v: Option<&Value>| -> Value {
        match v {
            Some(value) if compat::truthy(Some(value)) => value.clone(),
            _ => Value::Null,
        }
    };
    Some(json!({
        "timestamp": or_null(event.get("timestamp")),
        "info": or_null(payload.get("info")),
        "rateLimits": or_null(payload.get("rate_limits")),
    }))
}

/// Port of percentFromTokens().
pub fn percent_from_tokens(usage: Option<&Value>, context_window: Option<&Value>) -> Value {
    let total = compat::js_number(compat::get(
        usage.filter(|u| compat::truthy(Some(u))),
        "total_tokens",
    ));
    let window = compat::js_number(context_window);
    if !total.is_finite() || !window.is_finite() || window <= 0.0 {
        return Value::Null;
    }
    compat::number_value(compat::js_round(total / window * 100.0).max(0.0))
}

/// Port of rateWindow().
pub fn rate_window(raw: Option<&Value>) -> Value {
    let Some(raw) = raw.filter(|r| r.is_object()) else {
        return Value::Null;
    };
    let used_raw = raw
        .get("used_percent")
        .filter(|v| !v.is_null())
        .or_else(|| raw.get("used_percentage"));
    let used_percent = compat::js_number(used_raw);
    let window_minutes = compat::js_number(raw.get("window_minutes"));
    let resets_at = compat::js_number(raw.get("resets_at"));
    json!({
        "usedPercent": if used_percent.is_finite() { compat::number_value(compat::js_round(used_percent)) } else { Value::Null },
        "windowMinutes": if window_minutes.is_finite() { compat::number_value(window_minutes) } else { Value::Null },
        "resetsAt": if resets_at.is_finite() { compat::number_value(resets_at) } else { Value::Null },
    })
}

fn token_number(value: Option<&Value>) -> Option<f64> {
    let n = compat::js_number(value);
    if n.is_finite() && n >= 0.0 {
        Some(n)
    } else {
        None
    }
}

/// Port of tokenSummary().
pub fn token_summary(raw: Option<&Value>) -> Value {
    let Some(raw) = raw.filter(|r| r.is_object()) else {
        return Value::Null;
    };
    let input = token_number(raw.get("input_tokens"));
    let output = token_number(raw.get("output_tokens"));
    let cache_raw = raw
        .get("cached_input_tokens")
        .filter(|v| !v.is_null())
        .or_else(|| raw.get("cache_read_input_tokens"));
    let cache = token_number(cache_raw);
    let fallback_total = token_number(raw.get("total_tokens"));
    let component_total: f64 = [input, output, cache].iter().flatten().sum();
    let total = if component_total > 0.0 {
        Some(component_total)
    } else {
        fallback_total
    };

    let Some(total) = total else {
        return Value::Null;
    };
    let opt = |v: Option<f64>| v.map(compat::number_value).unwrap_or(Value::Null);
    json!({ "total": compat::number_value(total), "input": opt(input), "output": opt(output), "cache": opt(cache) })
}

fn empty_usage() -> Value {
    usage_value(Value::Null, Value::Null, Value::Null, Value::Null)
}

fn usage_value(source_file: Value, context: Value, tokens: Value, rate_limits: Value) -> Value {
    json!({
        "sourceFile": source_file,
        "context": context,
        "tokens": tokens,
        "rateLimits": rate_limits,
    })
}

fn latest_usage_from_files(
    files: &[PathBuf],
    include_context_tokens: bool,
    include_rate_limits: bool,
) -> Value {
    if !include_context_tokens && !include_rate_limits {
        return empty_usage();
    }

    let mut latest_context = Value::Null;
    let mut latest_tokens = Value::Null;
    let mut latest_rate_limits = Value::Null;
    let mut source_file = Value::Null;

    for file in files.iter().take(50) {
        let mut lines = read_tail_lines(file, 1200);
        lines.reverse();

        for line in &lines {
            let Some(token_count) = parse_token_count(line) else {
                continue;
            };
            let info = token_count.get("info").filter(|i| compat::truthy(Some(i)));

            if include_context_tokens && latest_context.is_null() {
                if let Some(info) = info {
                    let last_usage = info.get("last_token_usage");
                    let used_tokens = if compat::truthy(last_usage) {
                        let n = compat::js_number(compat::get(last_usage, "total_tokens"));
                        if n.is_nan() {
                            Value::Null
                        } else {
                            compat::number_value(n)
                        }
                    } else {
                        Value::Null
                    };
                    let window_n = compat::js_number(info.get("model_context_window"));
                    let window_tokens = if window_n.is_finite() && window_n != 0.0 {
                        compat::number_value(window_n)
                    } else {
                        Value::Null
                    };
                    let used_percent =
                        percent_from_tokens(last_usage, info.get("model_context_window"));
                    let candidate = json!({
                        "usedPercent": used_percent,
                        "usedTokens": used_tokens,
                        "windowTokens": window_tokens,
                        "timestamp": token_count.get("timestamp").cloned().unwrap_or(Value::Null),
                    });
                    if !candidate["usedPercent"].is_null()
                        || !candidate["usedTokens"].is_null()
                        || !candidate["windowTokens"].is_null()
                    {
                        latest_context = candidate;
                        source_file = Value::String(file.display().to_string());
                    }
                }
            }

            if include_context_tokens && latest_tokens.is_null() {
                if let Some(info) = info {
                    let raw = info
                        .get("total_token_usage")
                        .filter(|v| compat::truthy(Some(v)))
                        .or_else(|| info.get("last_token_usage"));
                    latest_tokens = token_summary(raw);
                }
            }

            if include_rate_limits && latest_rate_limits.is_null() {
                let rate_limits = token_count
                    .get("rateLimits")
                    .filter(|r| compat::truthy(Some(r)));
                if let Some(rate_limits) = rate_limits {
                    let primary = rate_window(rate_limits.get("primary"));
                    let secondary = rate_window(rate_limits.get("secondary"));
                    if primary.is_null() && secondary.is_null() {
                        continue;
                    }
                    let or_null = |v: Option<&Value>| match v {
                        Some(value) if compat::truthy(Some(value)) => value.clone(),
                        _ => Value::Null,
                    };
                    latest_rate_limits = json!({
                        "primary": primary,
                        "secondary": secondary,
                        "planType": or_null(rate_limits.get("plan_type")),
                        "limitId": or_null(rate_limits.get("limit_id")),
                        "timestamp": token_count.get("timestamp").cloned().unwrap_or(Value::Null),
                    });
                }
            }

            let context_tokens_done =
                !include_context_tokens || (!latest_context.is_null() && !latest_tokens.is_null());
            let rate_limits_done = !include_rate_limits || !latest_rate_limits.is_null();
            if context_tokens_done && rate_limits_done {
                return usage_value(
                    source_file,
                    latest_context,
                    latest_tokens,
                    latest_rate_limits,
                );
            }
        }
    }

    usage_value(
        source_file,
        latest_context,
        latest_tokens,
        latest_rate_limits,
    )
}

fn latest_usage_with_rollout_path(codex_home: &Path, rollout_path_env: Option<&OsStr>) -> Value {
    let files = list_session_files(codex_home);
    match rollout_path_env {
        None => latest_usage_from_files(&files, true, true),
        Some(raw_path) => {
            let rate_limits = latest_usage_from_files(&files, false, true)
                .get("rateLimits")
                .cloned()
                .unwrap_or(Value::Null);
            let session_usage = if raw_path.to_string_lossy().is_empty() {
                empty_usage()
            } else {
                let rollout_file = PathBuf::from(Path::new(raw_path));
                if std::fs::metadata(&rollout_file)
                    .map(|metadata| metadata.is_file())
                    .unwrap_or(false)
                {
                    latest_usage_from_files(std::slice::from_ref(&rollout_file), true, false)
                } else {
                    empty_usage()
                }
            };

            usage_value(
                session_usage
                    .get("sourceFile")
                    .cloned()
                    .unwrap_or(Value::Null),
                session_usage.get("context").cloned().unwrap_or(Value::Null),
                session_usage.get("tokens").cloned().unwrap_or(Value::Null),
                rate_limits,
            )
        }
    }
}

/// Port of latestUsage(): scan newest rollouts for context/tokens/rate-limits.
pub fn latest_usage(codex_home: &Path) -> Value {
    latest_usage_with_rollout_path(codex_home, None)
}

/// Port of commandVersion(): first stdout line of `cmd args`.
pub fn command_version(command: &str, args: &[&str]) -> Value {
    match util::run(command, args, None, util::DEFAULT_TIMEOUT_MS) {
        Some(out) if !out.is_empty() => {
            Value::String(out.split(['\r', '\n']).next().unwrap_or("").to_string())
        }
        _ => Value::Null,
    }
}

/// Runtime probe for Node-flavored projects. Reports null when `node -v` is
/// unavailable.
pub fn runtime_info(cwd: &Path) -> Value {
    let has_marker = util::find_up(cwd, "package.json").is_some()
        || util::find_up(cwd, ".nvmrc").is_some()
        || util::find_up(cwd, ".node-version").is_some();
    if !has_marker {
        return Value::Null;
    }
    json!({ "label": "node", "version": command_version("node", &["-v"]) })
}

fn native_status_items(configs: &hudcfg::Configs) -> Vec<String> {
    if hudcfg::toml_key_exists(&configs.project_text, "tui", "status_line") {
        hudcfg::toml_string_array(&configs.project_text, "tui", "status_line")
    } else {
        hudcfg::toml_string_array(&configs.user_text, "tui", "status_line")
    }
}

fn native_status_colors(configs: &hudcfg::Configs) -> Value {
    hudcfg::toml_boolean(&configs.project_text, "tui", "status_line_use_colors")
        .or_else(|| hudcfg::toml_boolean(&configs.user_text, "tui", "status_line_use_colors"))
        .map(Value::Bool)
        .unwrap_or(Value::Null)
}

fn resolve_identity_value(
    env_value: Option<&str>,
    session_mode: bool,
    config_value: Option<String>,
) -> Option<String> {
    if let Some(value) = env_value {
        let trimmed = value.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_string());
    }
    if session_mode {
        return None;
    }
    config_value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn omit_reasoning_none(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.eq_ignore_ascii_case("none"))
}

/// Port of collect(): the full HUD data object.
pub fn collect() -> Value {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let codex_home = hudcfg::resolve_codex_home();
    let git = git_info(&cwd);
    let git_root = git.get("root").and_then(|r| r.as_str()).map(PathBuf::from);
    let configs = hudcfg::resolve_config(&codex_home, &cwd, git_root.as_deref());
    let status_items = native_status_items(&configs);
    let hints = project_hints(&cwd, git_root.as_deref());
    let hud = hudcfg::load_hud_config(&codex_home, &cwd, git_root.as_deref());
    let env_model = std::env::var("CODEX_HUD_MODEL").ok();
    let env_effort = std::env::var("CODEX_HUD_EFFORT").ok();
    let env_service_tier = std::env::var("CODEX_HUD_SERVICE_TIER").ok();
    let env_rollout_path = std::env::var_os("CODEX_HUD_ROLLOUT_PATH");
    let session_mode = env_model.is_some();

    let opt_string = |v: Option<String>| v.map(Value::String).unwrap_or(Value::Null);
    let model = resolve_identity_value(
        env_model.as_deref(),
        session_mode,
        hudcfg::merged_config_value(&configs, "model"),
    );
    let reasoning = omit_reasoning_none(resolve_identity_value(
        env_effort.as_deref(),
        session_mode,
        hudcfg::merged_config_value(&configs, "model_reasoning_effort"),
    ));
    let service_tier = resolve_identity_value(
        env_service_tier.as_deref(),
        session_mode,
        hudcfg::merged_config_value(&configs, "service_tier"),
    );
    let usage = match env_rollout_path.as_deref() {
        None => latest_usage(&codex_home),
        Some(path) => latest_usage_with_rollout_path(&codex_home, Some(path)),
    };
    let status_colors = native_status_colors(&configs);

    json!({
        "codexHudVersion": VERSION,
        "hud": hud,
        "generatedAt": util::iso_utc(util::now_ms()),
        "cwd": cwd.display().to_string(),
        "codexHome": codex_home.display().to_string(),
        "codexVersion": command_version("codex", &["--version"]),
        "nodeVersion": null,
        "runtime": runtime_info(&cwd),
        "config": {
            "userPath": configs.user_config.display().to_string(),
            "projectPath": configs.project_config.as_ref().map(|p| Value::String(p.display().to_string())).unwrap_or(Value::Null),
            "model": opt_string(model),
            "reasoning": opt_string(reasoning),
            "serviceTier": opt_string(service_tier),
            "sandbox": opt_string(hudcfg::merged_config_value(&configs, "sandbox_mode")),
            "approval": opt_string(hudcfg::merged_config_value(&configs, "approval_policy")),
            "nativeStatusItems": status_items,
            "nativeStatusItemCount": status_items.len(),
            "nativeStatusColors": status_colors,
        },
        "git": git,
        "project": hints,
        "hooks": hook_summary(&codex_home),
        "usage": usage,
        "limits": {
            "note": "Usage is parsed from the latest Codex rollout JSONL. Codex's native TUI status line remains authoritative.",
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("codex-hud-{name}-{unique}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_usage_rollout(
        path: &Path,
        timestamp: &str,
        used_tokens: i64,
        window_tokens: i64,
        total_tokens: i64,
        rate_used_percent: i64,
    ) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create rollout parent");
        }
        let rollout = json!({
            "timestamp": timestamp,
            "payload": {
                "type": "token_count",
                "info": {
                    "last_token_usage": { "total_tokens": used_tokens },
                    "total_token_usage": { "total_tokens": total_tokens },
                    "model_context_window": window_tokens
                },
                "rate_limits": {
                    "primary": {
                        "used_percent": rate_used_percent,
                        "window_minutes": 300,
                        "resets_at": 1780848000
                    }
                }
            }
        });
        fs::write(path, format!("{rollout}\n")).expect("write rollout");
    }

    #[test]
    fn resolve_identity_value_uses_session_env_before_config() {
        struct Case {
            name: &'static str,
            env_value: Option<&'static str>,
            session_mode: bool,
            config_value: Option<&'static str>,
            expected: Option<&'static str>,
        }

        let cases = [
            Case {
                name: "env wins over config",
                env_value: Some("gpt-5-env"),
                session_mode: true,
                config_value: Some("gpt-5-config"),
                expected: Some("gpt-5-env"),
            },
            Case {
                name: "env value is trimmed",
                env_value: Some("  gpt-5-env  "),
                session_mode: true,
                config_value: None,
                expected: Some("gpt-5-env"),
            },
            Case {
                name: "empty env in session mode has no config fallback",
                env_value: Some("  "),
                session_mode: true,
                config_value: Some("gpt-5-config"),
                expected: None,
            },
            Case {
                name: "missing env in session mode has no config fallback",
                env_value: None,
                session_mode: true,
                config_value: Some("gpt-5-config"),
                expected: None,
            },
            Case {
                name: "no env uses config",
                env_value: None,
                session_mode: false,
                config_value: Some("gpt-5-config"),
                expected: Some("gpt-5-config"),
            },
            Case {
                name: "config value is trimmed",
                env_value: None,
                session_mode: false,
                config_value: Some("  gpt-5-config  "),
                expected: Some("gpt-5-config"),
            },
        ];

        for case in cases {
            let actual = resolve_identity_value(
                case.env_value,
                case.session_mode,
                case.config_value.map(str::to_string),
            );
            assert_eq!(actual.as_deref(), case.expected, "{}", case.name);
        }
    }

    #[test]
    fn reasoning_identity_omits_none_literal() {
        for value in [Some("none"), Some(" NoNe ")] {
            let resolved = resolve_identity_value(value, value.is_some(), Some("high".to_string()));
            assert_eq!(omit_reasoning_none(resolved), None);
        }

        let resolved = resolve_identity_value(Some(" xhigh "), true, Some("high".to_string()));
        assert_eq!(omit_reasoning_none(resolved).as_deref(), Some("xhigh"));
    }

    #[test]
    fn latest_usage_can_split_session_context_from_global_rate_limits() {
        let codex_home = temp_dir("usage-split");
        let older = codex_home.join("sessions/2026/06/07/rollout-2026-06-07T00-00-00-a.jsonl");
        let newer = codex_home.join("sessions/2026/06/08/rollout-2026-06-08T00-00-00-b.jsonl");
        write_usage_rollout(&older, "2026-06-07T00:00:00.000Z", 250, 1000, 333, 11);
        write_usage_rollout(&newer, "2026-06-08T00:00:00.000Z", 900, 1000, 999, 17);

        let requested_session =
            latest_usage_with_rollout_path(&codex_home, Some(older.as_os_str()));
        assert_eq!(requested_session["context"]["usedTokens"], json!(250));
        assert_eq!(requested_session["tokens"]["total"], json!(333));
        assert_eq!(
            requested_session["rateLimits"]["primary"]["usedPercent"],
            json!(17)
        );

        let global_rates = latest_usage_from_files(&[newer, older], false, true);
        assert_eq!(global_rates["context"], Value::Null);
        assert_eq!(global_rates["tokens"], Value::Null);
        assert_eq!(
            global_rates["rateLimits"]["primary"]["usedPercent"],
            json!(17)
        );

        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn latest_usage_present_but_empty_or_invalid_rollout_omits_session_usage() {
        let codex_home = temp_dir("usage-empty-rollout");
        let rollout = codex_home.join("sessions/2026/06/08/rollout-2026-06-08T00-00-00-b.jsonl");
        write_usage_rollout(&rollout, "2026-06-08T00:00:00.000Z", 900, 1000, 999, 17);

        let empty_present =
            latest_usage_with_rollout_path(&codex_home, Some(std::ffi::OsStr::new("")));
        assert_eq!(empty_present["context"], Value::Null);
        assert_eq!(empty_present["tokens"], Value::Null);
        assert_eq!(
            empty_present["rateLimits"]["primary"]["usedPercent"],
            json!(17)
        );

        let invalid_path = codex_home.join("sessions/2026/06/08/nope.jsonl");
        let invalid = latest_usage_with_rollout_path(&codex_home, Some(invalid_path.as_os_str()));
        assert_eq!(invalid["context"], Value::Null);
        assert_eq!(invalid["tokens"], Value::Null);
        assert_eq!(
            invalid["rateLimits"]["primary"]["usedPercent"],
            json!(17)
        );

        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn latest_usage_skips_all_null_context_samples() {
        let codex_home = temp_dir("latest-usage");
        let session_dir = codex_home.join("sessions/2026/06/10");
        fs::create_dir_all(&session_dir).expect("create session dir");
        let rollout = session_dir.join("rollout-2026-06-10T00-00-00-test.jsonl");
        let real_context = json!({
            "timestamp": "2026-06-10T00:00:00.000Z",
            "payload": {
                "type": "token_count",
                "info": {
                    "last_token_usage": { "total_tokens": 250 },
                    "model_context_window": 1000
                },
                "rate_limits": {}
            }
        });
        let all_null_context = json!({
            "timestamp": "2026-06-10T00:01:00.000Z",
            "payload": {
                "type": "token_count",
                "info": {},
                "rate_limits": {}
            }
        });
        fs::write(
            &rollout,
            format!("{}\n{}\n", real_context, all_null_context),
        )
        .expect("write rollout");

        let usage = latest_usage(&codex_home);
        assert_eq!(usage["context"]["usedTokens"], json!(250));
        assert_eq!(usage["context"]["windowTokens"], json!(1000));
        assert_eq!(
            usage["sourceFile"],
            Value::String(rollout.display().to_string())
        );

        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn native_status_settings_prefer_project_and_preserve_empty_arrays() {
        let configs = hudcfg::Configs {
            user_config: PathBuf::from("user-config.toml"),
            project_config: Some(PathBuf::from("project-config.toml")),
            user_text: "[tui]\nstatus_line = [\"model\"]\nstatus_line_use_colors = true\n".into(),
            project_text: "[tui]\nstatus_line = []\nstatus_line_use_colors = false\n".into(),
        };

        assert!(native_status_items(&configs).is_empty());
        assert_eq!(native_status_colors(&configs), Value::Bool(false));
    }

    #[test]
    fn list_session_files_finds_rollouts_across_nested_date_dirs() {
        let codex_home = temp_dir("list-sessions");
        for day in ["sessions/2024/12/31", "sessions/2025/01/02"] {
            let dir = codex_home.join(day);
            fs::create_dir_all(&dir).expect("create session dir");
            fs::write(dir.join("rollout-x.jsonl"), "{}\n").expect("write rollout");
            fs::write(dir.join("ignore.txt"), "x").expect("write noise");
        }

        let files = list_session_files(&codex_home);
        assert_eq!(files.len(), 2, "should find both nested rollout files");
        assert!(files.iter().all(|f| f
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("rollout-") && n.ends_with(".jsonl"))
            .unwrap_or(false)));

        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }
}
