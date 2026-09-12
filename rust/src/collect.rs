use crate::compat;
use crate::hudcfg;
use crate::util;
use serde_json::{json, Map, Value};
use std::ffi::OsStr;
use std::io::{Read, Seek, SeekFrom};
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

/// Read a bounded tail while preserving complete UTF-8 lines.
fn read_tail_text(path: &Path, max_lines: usize) -> Option<String> {
    if max_lines == 0 {
        return Some(String::new());
    }
    let Ok(mut file) = std::fs::File::open(path) else {
        return None;
    };
    let Ok(mut position) = file.seek(SeekFrom::End(0)) else {
        return None;
    };
    let end = position;
    let mut newline_count = 0;
    const BLOCK_SIZE: u64 = 64 * 1024;
    let mut block = vec![0; BLOCK_SIZE as usize];
    while position > 0 && newline_count <= max_lines {
        let chunk_len = position.min(BLOCK_SIZE);
        position -= chunk_len;
        if file.seek(SeekFrom::Start(position)).is_err() {
            return None;
        }
        let chunk = &mut block[..chunk_len as usize];
        if file.read_exact(chunk).is_err() {
            return None;
        }
        newline_count += chunk.iter().filter(|byte| **byte == b'\n').count();
    }
    let mut bytes = vec![0; (end - position) as usize];
    if file.seek(SeekFrom::Start(position)).is_err() || file.read_exact(&mut bytes).is_err() {
        return None;
    }
    if position > 0 {
        let first_newline = bytes.iter().position(|byte| *byte == b'\n')?;
        bytes.drain(..=first_newline);
    }
    Some(match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(error) => String::from_utf8_lossy(error.as_bytes()).into_owned(),
    })
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
    let total = compat::as_finite_number(compat::get(
        usage.filter(|u| compat::truthy(Some(u))),
        "total_tokens",
    ));
    let window = compat::as_finite_number(context_window);
    let (Some(total), Some(window)) = (total, window) else {
        return Value::Null;
    };
    if window <= 0.0 {
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
        .or_else(|| raw.get("used_percentage").filter(|v| !v.is_null()));
    let used_percent = compat::as_finite_number(used_raw);
    let window_minutes = compat::as_finite_number(raw.get("window_minutes"));
    let resets_at = compat::as_finite_number(raw.get("resets_at"));
    json!({
        "usedPercent": used_percent.map(|value| compat::number_value(compat::js_round(value))).unwrap_or(Value::Null),
        "windowMinutes": window_minutes.map(compat::number_value).unwrap_or(Value::Null),
        "resetsAt": resets_at.map(compat::number_value).unwrap_or(Value::Null),
    })
}

/// Known rate-limit window durations (minutes). The Codex backend has shipped
/// payloads where the weekly window arrives as `primary` with `secondary: null`
/// (observed 2026-07-13, same CLI version as the prior primary=5h shape), so
/// slots are classified by duration, not payload position. See issue #32.
const SHORT_WINDOW_MINUTES: f64 = 300.0;
const WEEKLY_WINDOW_MINUTES: f64 = 10080.0;

fn window_minutes_of(window: &Value) -> f64 {
    // rate_window() stores a missing/non-finite duration as JSON null;
    // js_number would coerce null to 0, so map it back to NaN (= unknown).
    match window.get("windowMinutes") {
        None | Some(Value::Null) => f64::NAN,
        value => compat::js_number(value),
    }
}

/// Classify extracted rate windows into (short/5h, weekly/7d) slots.
///
/// Pass 1 — exact recognized durations claim slots in payload order
/// (primary first); a duplicate claim on an already-taken slot is dropped and
/// never overflows into the other slot. Unrecognized durations are not
/// classified (the slot stays null and its segment is omitted).
/// Pass 2 — a window with missing/non-finite `window_minutes` falls back to
/// its own original position's slot, only if that slot is still empty. This
/// preserves the legacy positional behavior for payloads without durations.
pub fn classify_rate_windows(primary: Value, secondary: Value) -> (Value, Value) {
    let mut short = Value::Null;
    let mut weekly = Value::Null;
    let mut fallback: [Value; 2] = [Value::Null, Value::Null];

    for (position, window) in [primary, secondary].into_iter().enumerate() {
        if window.is_null() {
            continue;
        }
        let minutes = window_minutes_of(&window);
        if minutes == SHORT_WINDOW_MINUTES {
            if short.is_null() {
                short = window;
            }
        } else if minutes == WEEKLY_WINDOW_MINUTES {
            if weekly.is_null() {
                weekly = window;
            }
        } else if !minutes.is_finite() {
            fallback[position] = window;
        }
        // Any other finite duration: unrecognized — leave unclassified.
    }

    let [fallback_primary, fallback_secondary] = fallback;
    if short.is_null() && !fallback_primary.is_null() {
        short = fallback_primary;
    }
    if weekly.is_null() && !fallback_secondary.is_null() {
        weekly = fallback_secondary;
    }
    (short, weekly)
}

fn token_number(value: Option<&Value>) -> Option<f64> {
    compat::as_finite_number(value).filter(|number| *number >= 0.0)
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
    let components = [input, output, cache];
    let component_total: f64 = components.iter().flatten().sum();
    let total = if component_total > 0.0 {
        Some(component_total)
    } else {
        fallback_total.or_else(|| components.iter().any(Option::is_some).then_some(0.0))
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
    let mut latest_rate_timestamp: Option<String> = None;
    let mut source_file = Value::Null;

    for file in files.iter().take(50) {
        let Some(tail) = read_tail_text(file, 1200) else {
            continue;
        };
        let mut found_account_rate_in_file = false;
        for raw_line in tail.trim().lines().rev().take(1200) {
            let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
            let needs_context_tokens =
                include_context_tokens && (latest_context.is_null() || latest_tokens.is_null());
            let may_have_rate_limits = include_rate_limits
                && !found_account_rate_in_file
                && line.contains("\"rate_limits\"");
            if !needs_context_tokens && !may_have_rate_limits {
                continue;
            }
            let Some(token_count) = parse_token_count(line) else {
                continue;
            };
            let info = token_count.get("info").filter(|i| compat::truthy(Some(i)));

            if include_context_tokens && latest_context.is_null() {
                if let Some(info) = info {
                    let last_usage = info.get("last_token_usage");
                    let used_tokens = compat::as_finite_number(compat::get(
                        last_usage.filter(|usage| compat::truthy(Some(usage))),
                        "total_tokens",
                    ))
                    .filter(|value| *value >= 0.0)
                    .map(compat::number_value)
                    .unwrap_or(Value::Null);
                    let window_tokens = compat::as_finite_number(info.get("model_context_window"))
                        .filter(|value| *value > 0.0)
                        .map(compat::number_value)
                        .unwrap_or(Value::Null);
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

            if include_rate_limits {
                let rate_limits = token_count
                    .get("rateLimits")
                    .filter(|r| compat::truthy(Some(r)));
                if let Some(rate_limits) = rate_limits {
                    match rate_limits.get("limit_id") {
                        None | Some(Value::Null) => {}
                        Some(Value::String(limit_id)) if limit_id.trim().is_empty() => {}
                        Some(Value::String(limit_id)) if limit_id.eq_ignore_ascii_case("codex") => {
                        }
                        _ => continue,
                    }
                    let primary = rate_window(rate_limits.get("primary"));
                    let secondary = rate_window(rate_limits.get("secondary"));
                    found_account_rate_in_file = true;
                    // Slots are duration-classified (short=5h, weekly=7d) and
                    // re-exposed under the legacy primary/secondary keys so the
                    // renderer receives stable slots. See classify_rate_windows().
                    // The newest sample wins even when both windows are
                    // unavailable; falling through to an older line would show
                    // stale usage instead of omitting the missing segments.
                    let (primary, secondary) = classify_rate_windows(primary, secondary);
                    let or_null = |v: Option<&Value>| match v {
                        Some(value) if compat::truthy(Some(value)) => value.clone(),
                        _ => Value::Null,
                    };
                    let timestamp = token_count
                        .get("timestamp")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let is_newer = latest_rate_limits.is_null()
                        || match (&timestamp, &latest_rate_timestamp) {
                            (Some(candidate), Some(latest)) => candidate > latest,
                            (Some(_), None) => true,
                            _ => false,
                        };
                    if is_newer {
                        latest_rate_limits = json!({
                            "primary": primary,
                            "secondary": secondary,
                            "planType": or_null(rate_limits.get("plan_type")),
                            "limitId": or_null(rate_limits.get("limit_id")),
                            "timestamp": token_count.get("timestamp").cloned().unwrap_or(Value::Null),
                        });
                        latest_rate_timestamp = timestamp;
                    }
                }
            }

            let context_tokens_done =
                !include_context_tokens || (!latest_context.is_null() && !latest_tokens.is_null());
            // Rate-limit freshness is determined by event timestamps across the
            // bounded file scan, not by a rollout file's mutable mtime.
            let rate_limits_done = !include_rate_limits;
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

fn resolve_reasoning_identity(
    env_value: Option<&str>,
    session_mode: bool,
    config_value: Option<String>,
) -> Option<String> {
    let resolved = resolve_identity_value(env_value, session_mode, config_value);
    if session_mode {
        resolved.filter(|value| !value.eq_ignore_ascii_case("none"))
    } else {
        resolved
    }
}

fn resolve_service_tier_identity(
    env_value: Option<&str>,
    session_mode: bool,
    config_value: Option<String>,
) -> Option<String> {
    if let Some(value) = env_value {
        let trimmed = value.trim();
        return Some(if trimmed.is_empty() {
            "standard".to_string()
        } else {
            trimmed.to_string()
        });
    }
    if session_mode {
        return None;
    }
    resolve_identity_value(None, false, config_value).or_else(|| Some("standard".to_string()))
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
    let reasoning = resolve_reasoning_identity(
        env_effort.as_deref(),
        session_mode,
        hudcfg::merged_config_value(&configs, "model_reasoning_effort"),
    );
    let service_tier = resolve_service_tier_identity(
        env_service_tier.as_deref(),
        session_mode,
        hudcfg::merged_config_value(&configs, "service_tier"),
    );
    let usage = latest_usage_with_rollout_path(&codex_home, env_rollout_path.as_deref());
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

    fn write_rate_rollout(path: &Path, timestamp: &str, limit_id: Option<&str>, used_percent: i64) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create rollout parent");
        }
        let mut rate_limits = json!({
            "primary": {
                "used_percent": used_percent,
                "window_minutes": 10080,
                "resets_at": 1780848000
            }
        });
        if let Some(limit_id) = limit_id {
            rate_limits["limit_id"] = json!(limit_id);
        }
        let rollout = json!({
            "timestamp": timestamp,
            "payload": {
                "type": "token_count",
                "rate_limits": rate_limits
            }
        });
        fs::write(path, format!("{rollout}\n")).expect("write rollout");
    }

    #[test]
    fn read_tail_text_keeps_complete_utf8_and_crlf_lines() {
        let dir = temp_dir("tail-lines");
        let path = dir.join("rollout.jsonl");
        let content = format!("{}\r\nkeep-α\r\nkeep-β\r\n", "界".repeat(30_000));
        fs::write(&path, content).expect("write tail fixture");

        let tail = read_tail_text(&path, 2).expect("read tail");
        let lines: Vec<&str> = tail
            .trim()
            .lines()
            .map(|line| line.strip_suffix('\r').unwrap_or(line))
            .collect();

        assert_eq!(lines, vec!["keep-α", "keep-β"]);
        fs::remove_dir_all(dir).expect("remove temp dir");
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
    fn reasoning_identity_omits_session_none_but_preserves_config_none() {
        for value in [Some("none"), Some(" NoNe ")] {
            assert_eq!(
                resolve_reasoning_identity(value, true, Some("high".to_string())),
                None
            );
        }

        assert_eq!(
            resolve_reasoning_identity(Some(" xhigh "), true, Some("high".to_string())).as_deref(),
            Some("xhigh")
        );
        assert_eq!(
            resolve_reasoning_identity(None, false, Some("none".to_string())).as_deref(),
            Some("none")
        );
    }

    #[test]
    fn service_tier_identity_distinguishes_known_standard_from_unknown() {
        assert_eq!(
            resolve_service_tier_identity(Some(""), true, Some("fast".to_string())).as_deref(),
            Some("standard")
        );
        assert_eq!(
            resolve_service_tier_identity(None, false, None).as_deref(),
            Some("standard")
        );
        assert_eq!(
            resolve_service_tier_identity(None, true, Some("fast".to_string())),
            None
        );
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
    fn latest_usage_uses_newest_account_rate_snapshot_and_ignores_named_buckets() {
        let codex_home = temp_dir("usage-account-rates");
        let named = codex_home.join("named.jsonl");
        let stale_account = codex_home.join("stale-account.jsonl");
        let fresh_account = codex_home.join("fresh-account.jsonl");
        write_rate_rollout(
            &named,
            "2026-06-08T03:00:00.000Z",
            Some("codex_other_model"),
            0,
        );
        write_rate_rollout(&stale_account, "2026-06-08T01:00:00.000Z", Some("codex"), 3);
        write_rate_rollout(&fresh_account, "2026-06-08T02:00:00.000Z", Some("codex"), 4);

        let usage = latest_usage_from_files(&[named, stale_account, fresh_account], false, true);

        assert_eq!(usage["rateLimits"]["limitId"], json!("codex"));
        assert_eq!(usage["rateLimits"]["secondary"]["usedPercent"], json!(4));
        assert_eq!(
            usage["rateLimits"]["timestamp"],
            json!("2026-06-08T02:00:00.000Z")
        );
        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn latest_usage_accepts_newer_legacy_account_snapshot_without_limit_id() {
        let codex_home = temp_dir("usage-legacy-rate");
        let legacy = codex_home.join("legacy.jsonl");
        let account = codex_home.join("account.jsonl");
        write_rate_rollout(&legacy, "2026-06-08T03:00:00.000Z", None, 8);
        write_rate_rollout(&account, "2026-06-08T02:00:00.000Z", Some("codex"), 4);

        let usage = latest_usage_from_files(&[legacy, account], false, true);

        assert_eq!(usage["rateLimits"]["limitId"], Value::Null);
        assert_eq!(usage["rateLimits"]["secondary"]["usedPercent"], json!(8));
        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn latest_explicit_account_snapshot_with_no_windows_clears_older_values() {
        let codex_home = temp_dir("usage-empty-account-rate");
        let empty = codex_home.join("empty.jsonl");
        let older = codex_home.join("older.jsonl");
        let empty_event = json!({
            "timestamp": "2026-06-08T03:00:00.000Z",
            "payload": {
                "type": "token_count",
                "rate_limits": { "limit_id": "codex", "primary": null, "secondary": null }
            }
        });
        fs::write(&empty, format!("{empty_event}\n")).expect("write empty rollout");
        write_rate_rollout(&older, "2026-06-08T02:00:00.000Z", Some("codex"), 4);

        let usage = latest_usage_from_files(&[empty, older], false, true);

        assert_eq!(usage["rateLimits"]["primary"], Value::Null);
        assert_eq!(usage["rateLimits"]["secondary"], Value::Null);
        assert_eq!(
            usage["rateLimits"]["timestamp"],
            json!("2026-06-08T03:00:00.000Z")
        );
        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn latest_legacy_account_snapshot_with_no_windows_clears_older_values() {
        let codex_home = temp_dir("usage-empty-legacy-rate");
        let empty = codex_home.join("empty.jsonl");
        let older = codex_home.join("older.jsonl");
        let empty_event = json!({
            "timestamp": "2026-06-08T03:00:00.000Z",
            "payload": { "type": "token_count", "rate_limits": {} }
        });
        fs::write(&empty, format!("{empty_event}\n")).expect("write empty rollout");
        write_rate_rollout(&older, "2026-06-08T02:00:00.000Z", Some("codex"), 4);

        let usage = latest_usage_from_files(&[empty, older], false, true);

        assert_eq!(usage["rateLimits"]["primary"], Value::Null);
        assert_eq!(usage["rateLimits"]["secondary"], Value::Null);
        assert_eq!(
            usage["rateLimits"]["timestamp"],
            json!("2026-06-08T03:00:00.000Z")
        );
        fs::remove_dir_all(codex_home).expect("remove temp dir");
    }

    #[test]
    fn rate_window_omits_unavailable_fields_but_preserves_numeric_zero() {
        let unavailable = rate_window(Some(&json!({
            "used_percent": null,
            "used_percentage": null,
            "window_minutes": "",
            "resets_at": false
        })));
        assert_eq!(unavailable["usedPercent"], Value::Null);
        assert_eq!(unavailable["windowMinutes"], Value::Null);
        assert_eq!(unavailable["resetsAt"], Value::Null);

        let zero = rate_window(Some(&json!({
            "used_percent": 0,
            "window_minutes": 0,
            "resets_at": 0
        })));
        assert_eq!(zero["usedPercent"], json!(0));
        assert_eq!(zero["windowMinutes"], json!(0));
        assert_eq!(zero["resetsAt"], json!(0));
    }

    #[test]
    fn usage_parsers_reject_non_numeric_values_and_preserve_explicit_zero() {
        let null_usage = json!({ "total_tokens": null });
        let string_usage = json!({ "total_tokens": "0" });
        assert_eq!(
            percent_from_tokens(Some(&null_usage), Some(&json!(1000))),
            Value::Null
        );
        assert_eq!(
            percent_from_tokens(Some(&string_usage), Some(&json!(1000))),
            Value::Null
        );
        assert_eq!(
            percent_from_tokens(Some(&json!({ "total_tokens": 0 })), Some(&json!(1000))),
            json!(0)
        );

        let tokens = token_summary(Some(&json!({
            "total_tokens": null,
            "input_tokens": 0,
            "output_tokens": null,
            "cached_input_tokens": ""
        })));
        assert_eq!(tokens["total"], json!(0));
        assert_eq!(tokens["input"], json!(0));
        assert_eq!(tokens["output"], Value::Null);
        assert_eq!(tokens["cache"], Value::Null);
    }

    #[test]
    fn latest_usage_omits_unavailable_context_fields_and_keeps_zero_tokens() {
        let codex_home = temp_dir("usage-null-fields");
        let unavailable = codex_home.join("unavailable.jsonl");
        let unavailable_event = json!({
            "timestamp": "2026-06-08T03:00:00.000Z",
            "payload": {
                "type": "token_count",
                "info": {
                    "last_token_usage": { "total_tokens": null },
                    "total_token_usage": {
                        "total_tokens": 0,
                        "input_tokens": 0,
                        "output_tokens": null,
                        "cached_input_tokens": ""
                    },
                    "model_context_window": false
                }
            }
        });
        fs::write(&unavailable, format!("{unavailable_event}\n"))
            .expect("write unavailable rollout");

        let usage = latest_usage_from_files(&[unavailable], true, false);

        assert_eq!(usage["context"], Value::Null);
        assert_eq!(usage["tokens"]["total"], json!(0));
        assert_eq!(usage["tokens"]["input"], json!(0));
        assert_eq!(usage["tokens"]["output"], Value::Null);
        assert_eq!(usage["tokens"]["cache"], Value::Null);

        let zero = codex_home.join("zero.jsonl");
        write_usage_rollout(&zero, "2026-06-08T04:00:00.000Z", 0, 1000, 0, 0);
        let zero_usage = latest_usage_from_files(&[zero], true, false);
        assert_eq!(zero_usage["context"]["usedPercent"], json!(0));
        assert_eq!(zero_usage["context"]["usedTokens"], json!(0));
        assert_eq!(zero_usage["tokens"]["total"], json!(0));
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
        assert_eq!(invalid["rateLimits"]["primary"]["usedPercent"], json!(17));

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

        let usage = latest_usage_with_rollout_path(&codex_home, None);
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

    fn window(used: u64, minutes: Option<u64>) -> Value {
        json!({
            "usedPercent": used,
            "windowMinutes": minutes.map(Value::from).unwrap_or(Value::Null),
            "resetsAt": 1784507205u64,
        })
    }

    #[test]
    fn classify_keeps_legacy_positional_shape() {
        // Old payload: primary=300 (5h), secondary=10080 (7d) — unchanged.
        let (short, weekly) = classify_rate_windows(window(17, Some(300)), window(16, Some(10080)));
        assert_eq!(short["windowMinutes"], json!(300));
        assert_eq!(weekly["windowMinutes"], json!(10080));
    }

    #[test]
    fn classify_moves_weekly_primary_to_weekly_slot() {
        // New payload (2026-07-13): primary=10080, secondary=null.
        let (short, weekly) = classify_rate_windows(window(1, Some(10080)), Value::Null);
        assert!(short.is_null(), "short slot must stay unknown");
        assert_eq!(weekly["windowMinutes"], json!(10080));
        assert_eq!(weekly["usedPercent"], json!(1));
    }

    #[test]
    fn classify_handles_swapped_positions() {
        let (short, weekly) = classify_rate_windows(window(9, Some(10080)), window(3, Some(300)));
        assert_eq!(short["usedPercent"], json!(3));
        assert_eq!(weekly["usedPercent"], json!(9));
    }

    #[test]
    fn classify_missing_duration_falls_back_to_own_position_only() {
        // Primary lacks window_minutes → fills short slot; secondary recognized.
        let (short, weekly) = classify_rate_windows(window(5, None), window(16, Some(10080)));
        assert_eq!(short["usedPercent"], json!(5));
        assert_eq!(weekly["usedPercent"], json!(16));

        // Fallback must not fill a slot already claimed by a recognized duration.
        let (short, weekly) = classify_rate_windows(window(7, Some(300)), window(8, None));
        assert_eq!(short["usedPercent"], json!(7));
        assert_eq!(weekly["usedPercent"], json!(8));

        // Fallback never crosses positions: secondary-position fallback cannot
        // fill the short slot.
        let (short, weekly) = classify_rate_windows(Value::Null, window(8, None));
        assert!(short.is_null());
        assert_eq!(weekly["usedPercent"], json!(8));
    }

    #[test]
    fn classify_ignores_unexpected_duration() {
        let (short, weekly) = classify_rate_windows(window(4, Some(1440)), window(16, Some(10080)));
        assert!(
            short.is_null(),
            "unexpected 1440-minute window stays unclassified"
        );
        assert_eq!(weekly["usedPercent"], json!(16));
    }

    #[test]
    fn classify_drops_duplicate_slot_claims() {
        // Two weekly windows: first claim (payload order) wins, second dropped.
        let (short, weekly) =
            classify_rate_windows(window(11, Some(10080)), window(22, Some(10080)));
        assert!(
            short.is_null(),
            "duplicate must not overflow into short slot"
        );
        assert_eq!(weekly["usedPercent"], json!(11));
    }
}
