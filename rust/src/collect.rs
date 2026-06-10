use crate::hudcfg;
use crate::js;
use crate::util;
use serde_json::{json, Map, Value};
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
                .filter(|v| js::truthy(Some(v)))
                .cloned()
                .unwrap_or(Value::Null);
            let version = parsed
                .get("version")
                .filter(|v| js::truthy(Some(v)))
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

    fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
        if files.len() > 3000 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let full_path = entry.path();
            if full_path.is_dir() {
                walk(&full_path, files);
            } else if let Some(name) = full_path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("rollout-") && name.ends_with(".jsonl") {
                    files.push(full_path);
                }
            }
        }
    }

    walk(&sessions_root, &mut files);
    files.sort_by(|a, b| {
        mtime_ms(b)
            .partial_cmp(&mtime_ms(a))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    files
}

fn mtime_ms(path: &Path) -> f64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
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
            Some(value) if js::truthy(Some(value)) => value.clone(),
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
    let total = js::js_number(js::get(
        usage.filter(|u| js::truthy(Some(u))),
        "total_tokens",
    ));
    let window = js::js_number(context_window);
    if !total.is_finite() || !window.is_finite() || window <= 0.0 {
        return Value::Null;
    }
    js::number_value(js::js_round(total / window * 100.0).max(0.0))
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
    let used_percent = js::js_number(used_raw);
    let window_minutes = js::js_number(raw.get("window_minutes"));
    let resets_at = js::js_number(raw.get("resets_at"));
    json!({
        "usedPercent": if used_percent.is_finite() { js::number_value(js::js_round(used_percent)) } else { Value::Null },
        "windowMinutes": if window_minutes.is_finite() { js::number_value(window_minutes) } else { Value::Null },
        "resetsAt": if resets_at.is_finite() { js::number_value(resets_at) } else { Value::Null },
    })
}

fn token_number(value: Option<&Value>) -> Option<f64> {
    let n = js::js_number(value);
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
    let opt = |v: Option<f64>| v.map(js::number_value).unwrap_or(Value::Null);
    json!({ "total": js::number_value(total), "input": opt(input), "output": opt(output), "cache": opt(cache) })
}

/// Port of latestUsage(): scan newest rollouts for context/tokens/rate-limits.
pub fn latest_usage(codex_home: &Path) -> Value {
    let files = list_session_files(codex_home);
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
            let info = token_count.get("info").filter(|i| js::truthy(Some(i)));

            if latest_context.is_null() {
                if let Some(info) = info {
                    let last_usage = info.get("last_token_usage");
                    let used_tokens = if js::truthy(last_usage) {
                        let n = js::js_number(js::get(last_usage, "total_tokens"));
                        if n.is_nan() {
                            Value::Null
                        } else {
                            js::number_value(n)
                        }
                    } else {
                        Value::Null
                    };
                    let window_n = js::js_number(info.get("model_context_window"));
                    let window_tokens = if window_n.is_finite() && window_n != 0.0 {
                        js::number_value(window_n)
                    } else {
                        Value::Null
                    };
                    latest_context = json!({
                        "usedPercent": percent_from_tokens(last_usage, info.get("model_context_window")),
                        "usedTokens": used_tokens,
                        "windowTokens": window_tokens,
                        "timestamp": token_count.get("timestamp").cloned().unwrap_or(Value::Null),
                    });
                    source_file = Value::String(file.display().to_string());
                }
            }

            if latest_tokens.is_null() {
                if let Some(info) = info {
                    let raw = info
                        .get("total_token_usage")
                        .filter(|v| js::truthy(Some(v)))
                        .or_else(|| info.get("last_token_usage"));
                    latest_tokens = token_summary(raw);
                }
            }

            if latest_rate_limits.is_null() {
                let rate_limits = token_count
                    .get("rateLimits")
                    .filter(|r| js::truthy(Some(r)));
                if let Some(rate_limits) = rate_limits {
                    let primary = rate_window(rate_limits.get("primary"));
                    let secondary = rate_window(rate_limits.get("secondary"));
                    if primary.is_null() && secondary.is_null() {
                        continue;
                    }
                    let or_null = |v: Option<&Value>| match v {
                        Some(value) if js::truthy(Some(value)) => value.clone(),
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

            if !latest_context.is_null()
                && !latest_tokens.is_null()
                && !latest_rate_limits.is_null()
            {
                return json!({
                    "sourceFile": source_file,
                    "context": latest_context,
                    "tokens": latest_tokens,
                    "rateLimits": latest_rate_limits,
                });
            }
        }
    }

    json!({
        "sourceFile": source_file,
        "context": latest_context,
        "tokens": latest_tokens,
        "rateLimits": latest_rate_limits,
    })
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

/// Port of runtimeInfo(). Divergence note: Node falls back to its own
/// process.version; this binary reports null when `node -v` is unavailable.
pub fn runtime_info(cwd: &Path) -> Value {
    let has_marker = util::find_up(cwd, "package.json").is_some()
        || util::find_up(cwd, ".nvmrc").is_some()
        || util::find_up(cwd, ".node-version").is_some();
    if !has_marker {
        return Value::Null;
    }
    json!({ "label": "node", "version": command_version("node", &["-v"]) })
}

/// Port of collect(): the full HUD data object.
pub fn collect() -> Value {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let codex_home = hudcfg::resolve_codex_home();
    let git = git_info(&cwd);
    let git_root = git.get("root").and_then(|r| r.as_str()).map(PathBuf::from);
    let configs = hudcfg::resolve_config(&codex_home, &cwd, git_root.as_deref());
    let status_items = hudcfg::toml_string_array(&configs.user_text, "tui", "status_line");
    let hints = project_hints(&cwd, git_root.as_deref());
    let hud = hudcfg::load_hud_config(&codex_home, &cwd, git_root.as_deref());

    let opt_string = |v: Option<String>| v.map(Value::String).unwrap_or(Value::Null);
    let status_colors =
        match hudcfg::toml_boolean(&configs.user_text, "tui", "status_line_use_colors") {
            Some(b) => Value::Bool(b),
            None => Value::Null,
        };

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
            "model": opt_string(hudcfg::merged_config_value(&configs, "model")),
            "reasoning": opt_string(hudcfg::merged_config_value(&configs, "model_reasoning_effort")),
            "sandbox": opt_string(hudcfg::merged_config_value(&configs, "sandbox_mode")),
            "approval": opt_string(hudcfg::merged_config_value(&configs, "approval_policy")),
            "nativeStatusItems": status_items,
            "nativeStatusItemCount": status_items.len(),
            "nativeStatusColors": status_colors,
        },
        "git": git,
        "project": hints,
        "hooks": hook_summary(&codex_home),
        "usage": latest_usage(&codex_home),
        "limits": {
            "note": "Usage is parsed from the latest Codex rollout JSONL. Codex's native TUI status line remains authoritative.",
        },
    })
}
