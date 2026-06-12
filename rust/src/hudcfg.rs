use crate::util;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

pub const HUD_CONFIG_FILENAME: &str = "codex-hud.toml";
// Oracle truncates labels via String(value).slice(0, 40).
const MAX_LABEL_LEN: usize = 40;

pub fn default_config() -> Value {
    json!({
        "segments": ["model", "project", "branch", "ctx", "5h", "7d", "tkn"],
        "space": false,
        "separators": { "segment": "|", "tokenPart": ",", "labelValue": ":", "open": "(", "close": ")" },
        "labels": { "ctx": "Ctx", "5h": "5h", "7d": "7d", "tkn": "Tkn", "tokenInput": "I:", "tokenOutput": "O:", "tokenCache": "C:" },
        "colors": {
            "model": "neonViolet",
            "project": "cyan",
            "branch": "neonViolet",
            "runtime": "dim",
            "dirty": "amber",
            "label": "dim",
            "separator": "dim",
            "tokenTotal": "amber",
            "tokenInput": "cyan",
            "tokenOutput": "cyan",
            "tokenCache": "cyan",
            "pace": "mint",
            "ok": "mint",
            "warn": "amber",
            "crit": "coral",
            "none": "dim"
        },
        "thresholds": { "percent": { "warn": 70, "crit": 90 }, "pace": { "warn": 0, "crit": 15 } },
        "format": {
            "percentRound": true,
            "tokenUnits": true,
            "tokenParts": true,
            "showPace": true,
            "modelStyle": "full",
            "effortShort": false,
            "paceSlowPrefix": "🐢",
            "paceNormalPrefix": "🤖",
            "paceFastPrefix": "🔥"
        }
    })
}

pub const KNOWN_SEGMENTS: [&str; 8] = [
    "model", "project", "branch", "runtime", "ctx", "5h", "7d", "tkn",
];

pub fn segment_alias(entry: &str) -> Vec<String> {
    match entry {
        "workspace" => vec!["project".into(), "branch".into(), "runtime".into()],
        "context" => vec!["ctx".into()],
        "tokens" => vec!["tkn".into()],
        other => vec![other.to_string()],
    }
}

// ── Codex config.toml text probes (regex-port of the JS helpers) ────────────

/// Port of firstTomlString(): first line matching `^key\s*=\s*"..."`.
/// This is intentionally a text probe, not a full TOML parser, to preserve the
/// Node oracle's config precedence behavior.
pub fn first_toml_string(config: &str, key: &str) -> Option<String> {
    for line in config.split('\n') {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(rest) = rest.strip_prefix('=') {
                let rest = rest.trim_start();
                if let Some(rest) = rest.strip_prefix('"') {
                    if let Some(end) = rest.find('"') {
                        return Some(rest[..end].to_string());
                    }
                }
            }
        }
    }
    None
}

/// Port of tomlSection(): body between `[section]` and the next `[...]` header.
pub fn toml_section(config: &str, section: &str) -> Option<String> {
    let header = format!("[{}]", section);
    let mut lines = config.split('\n');
    let mut found = false;
    let mut body = Vec::new();
    for line in lines.by_ref() {
        if line.trim_end() == header {
            found = true;
            break;
        }
    }
    if !found {
        return None;
    }
    for line in lines {
        let t = line.trim_end();
        if t.starts_with('[') && t.ends_with(']') && t.len() > 2 && !t[1..t.len() - 1].contains(']')
        {
            break;
        }
        body.push(line);
    }
    Some(body.join("\n"))
}

pub fn toml_key_exists(config: &str, section: &str, key: &str) -> bool {
    let Some(body) = toml_section(config, section) else {
        return false;
    };
    for line in body.split('\n') {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start();
            if rest.starts_with('=') {
                return true;
            }
        }
    }
    false
}

/// Port of tomlBoolean(): `^key\s*=\s*(true|false)` inside a section.
pub fn toml_boolean(config: &str, section: &str, key: &str) -> Option<bool> {
    let body = toml_section(config, section)?;
    for line in body.split('\n') {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(rest) = rest.strip_prefix('=') {
                let rest = rest.trim_start();
                if rest.starts_with("true") {
                    return Some(true);
                }
                if rest.starts_with("false") {
                    return Some(false);
                }
            }
        }
    }
    None
}

/// Port of tomlStringArray(): single-line `key = ["a", "b"]` inside a section.
pub fn toml_string_array(config: &str, section: &str, key: &str) -> Vec<String> {
    let Some(body) = toml_section(config, section) else {
        return Vec::new();
    };
    for line in body.split('\n') {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(rest) = rest.strip_prefix('=') {
                let rest = rest.trim_start();
                if let Some(rest) = rest.strip_prefix('[') {
                    if let Some(end) = rest.find(']') {
                        let inner = &rest[..end];
                        let mut values = Vec::new();
                        let mut remaining = inner;
                        while let Some(start) = remaining.find('"') {
                            let after = &remaining[start + 1..];
                            match after.find('"') {
                                Some(close) => {
                                    values.push(after[..close].to_string());
                                    remaining = &after[close + 1..];
                                }
                                None => break,
                            }
                        }
                        return values;
                    }
                }
            }
        }
    }
    Vec::new()
}

pub fn resolve_codex_home() -> PathBuf {
    match std::env::var("CODEX_HOME") {
        Ok(v) if !v.is_empty() => PathBuf::from(v),
        _ => util::home_dir().join(".codex"),
    }
}

/// Port of findProjectConfig(): walk up for .codex/config.toml, skip $HOME.
pub fn find_project_config(cwd: &Path, git_root: Option<&Path>) -> Option<PathBuf> {
    util::find_project_file(cwd, git_root, &[".codex", "config.toml"])
}

pub struct Configs {
    pub user_config: PathBuf,
    pub project_config: Option<PathBuf>,
    pub user_text: String,
    pub project_text: String,
}

pub fn resolve_config(codex_home: &Path, cwd: &Path, git_root: Option<&Path>) -> Configs {
    let user_config = codex_home.join("config.toml");
    let project_config = find_project_config(cwd, git_root);
    let user_text = util::read_text(&user_config).unwrap_or_default();
    let project_text = project_config
        .as_deref()
        .and_then(util::read_text)
        .unwrap_or_default();
    Configs {
        user_config,
        project_config,
        user_text,
        project_text,
    }
}

pub fn merged_config_value(configs: &Configs, key: &str) -> Option<String> {
    first_toml_string(&configs.project_text, key)
        .filter(|s| !s.is_empty())
        .or_else(|| first_toml_string(&configs.user_text, key).filter(|s| !s.is_empty()))
}

// ── HUD config (codex-hud.toml) loading ─────────────────────────────────────

fn is_plain_object(value: &Value) -> bool {
    value.is_object()
}

/// Port of deepMerge(): arrays REPLACE, plain objects merge key-by-key.
pub fn deep_merge(base: &Value, over: &Value) -> Value {
    if !is_plain_object(base) || !is_plain_object(over) {
        return over.clone();
    }
    let mut out = base.clone();
    let out_map = out
        .as_object_mut()
        .expect("guarded by is_plain_object above");
    for (key, over_value) in over.as_object().expect("guarded by is_plain_object above") {
        let merged = match out_map.get(key) {
            Some(base_value) => deep_merge(base_value, over_value),
            None => over_value.clone(),
        };
        out_map.insert(key.clone(), merged);
    }
    out
}

fn toml_to_json(value: &toml::Value) -> Value {
    match value {
        toml::Value::String(s) => Value::String(s.clone()),
        toml::Value::Integer(i) => Value::from(*i),
        toml::Value::Float(f) => serde_json::Number::from_f64(*f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        toml::Value::Boolean(b) => Value::Bool(*b),
        toml::Value::Datetime(d) => Value::String(d.to_string()),
        toml::Value::Array(items) => Value::Array(items.iter().map(toml_to_json).collect()),
        toml::Value::Table(table) => {
            let mut map = Map::new();
            for (k, v) in table {
                map.insert(k.clone(), toml_to_json(v));
            }
            Value::Object(map)
        }
    }
}

struct LoadedToml {
    ok: bool,
    value: Option<Value>,
    error: Option<String>,
}

fn load_one_toml_file(path: &Path) -> LoadedToml {
    let Some(text) = util::read_text(path) else {
        return LoadedToml {
            ok: true,
            value: None,
            error: None,
        }; // absent file is not an error
    };
    match text.parse::<toml::Value>() {
        Ok(parsed) => LoadedToml {
            ok: true,
            value: Some(toml_to_json(&parsed)),
            error: None,
        },
        Err(err) => LoadedToml {
            ok: false,
            value: None,
            error: Some(format!("{}: {}", path.display(), err)),
        },
    }
}

fn object_section<'a>(
    raw_map: &'a Map<String, Value>,
    key: &str,
    warnings: &mut Vec<String>,
    source: &str,
) -> Option<&'a Map<String, Value>> {
    let value = raw_map.get(key)?;
    match value.as_object() {
        Some(map) => Some(map),
        None => {
            warnings.push(format!("{}: {} must be an object; ignored", source, key));
            None
        }
    }
}

/// Port of validateAndCoerce(): never fails; drops unknown/ill-typed entries
/// and records a note per dropped entry.
pub fn validate_and_coerce(raw: &Value, warnings: &mut Vec<String>, source: &str) -> Value {
    let note =
        |warnings: &mut Vec<String>, msg: String| warnings.push(format!("{}: {}", source, msg));
    let Some(raw_map) = raw.as_object() else {
        note(
            warnings,
            "top-level config is not a table; ignored".to_string(),
        );
        return json!({});
    };
    let mut out = Map::new();

    if let Some(segments) = raw_map.get("segments") {
        if let Some(entries) = segments.as_array() {
            let mut result = Vec::new();
            for entry in entries {
                let Some(entry_str) = entry.as_str() else {
                    note(
                        warnings,
                        format!(
                            "ignored non-string segment {}",
                            serde_json::to_string(entry).unwrap_or_default()
                        ),
                    );
                    continue;
                };
                for id in segment_alias(entry_str) {
                    if KNOWN_SEGMENTS.contains(&id.as_str()) {
                        result.push(Value::String(id));
                    } else {
                        note(warnings, format!("unknown segment \"{}\" ignored", id));
                    }
                }
            }
            out.insert("segments".into(), Value::Array(result));
        } else {
            note(warnings, "segments must be an array; ignored".to_string());
        }
    }

    if let Some(separator) = raw_map.get("separator") {
        if separator.is_string() {
            out.insert("separators".into(), json!({ "segment": separator }));
        } else {
            note(warnings, "separator must be a string; ignored".to_string());
        }
    }
    if let Some(space) = raw_map.get("space") {
        if space.is_boolean() {
            out.insert("space".into(), space.clone());
        } else {
            note(warnings, "space must be a boolean; ignored".to_string());
        }
    }
    if let Some(separators) = object_section(raw_map, "separators", warnings, source) {
        let existing = out.entry("separators").or_insert_with(|| json!({}));
        let existing_map = existing.as_object_mut().unwrap();
        for (key, value) in separators {
            if value.is_string() {
                existing_map.insert(key.clone(), value.clone());
            } else {
                note(
                    warnings,
                    format!("separators.{} must be a string; ignored", key),
                );
            }
        }
    }

    if let Some(labels) = object_section(raw_map, "labels", warnings, source) {
        let mut coerced = Map::new();
        for (key, value) in labels {
            match value {
                Value::String(s) => {
                    coerced.insert(
                        key.clone(),
                        Value::String(s.chars().take(MAX_LABEL_LEN).collect()),
                    );
                }
                Value::Number(n) => {
                    let text = crate::js::num_to_string(n.as_f64().unwrap_or(f64::NAN));
                    coerced.insert(
                        key.clone(),
                        Value::String(text.chars().take(MAX_LABEL_LEN).collect()),
                    );
                }
                _ => note(
                    warnings,
                    format!("labels.{} must be a string; ignored", key),
                ),
            }
        }
        out.insert("labels".into(), Value::Object(coerced));
    }

    if let Some(colors) = object_section(raw_map, "colors", warnings, source) {
        let mut coerced = Map::new();
        for (key, value) in colors {
            let valid_number = value
                .as_f64()
                .map(|n| n == n.trunc() && (0.0..=255.0).contains(&n))
                .unwrap_or(false);
            if value.is_string() || valid_number {
                coerced.insert(key.clone(), value.clone());
            } else {
                note(
                    warnings,
                    format!(
                        "colors.{} must be a color name, 0-255, or #hex; ignored",
                        key
                    ),
                );
            }
        }
        out.insert("colors".into(), Value::Object(coerced));
    }

    if let Some(thresholds) = object_section(raw_map, "thresholds", warnings, source) {
        let mut groups = Map::new();
        for group in ["percent", "pace"] {
            let Some(group_map) = thresholds.get(group).and_then(|v| v.as_object()) else {
                continue;
            };
            let mut coerced = Map::new();
            for key in ["warn", "crit"] {
                match group_map.get(key) {
                    Some(value) if value.as_f64().map(|f| f.is_finite()).unwrap_or(false) => {
                        let clamped = value
                            .as_f64()
                            .expect("guarded by is_finite above")
                            .clamp(0.0, 100.0);
                        coerced.insert(key.into(), crate::js::number_value(clamped));
                    }
                    Some(_) => note(
                        warnings,
                        format!("thresholds.{}.{} must be a number; ignored", group, key),
                    ),
                    None => {}
                }
            }
            groups.insert(group.into(), Value::Object(coerced));
        }
        out.insert("thresholds".into(), Value::Object(groups));
    }

    if let Some(format) = object_section(raw_map, "format", warnings, source) {
        let mut coerced = Map::new();
        for key in ["percentRound", "tokenUnits", "tokenParts", "showPace"] {
            match format.get(key) {
                Some(Value::Bool(b)) => {
                    coerced.insert(key.into(), Value::Bool(*b));
                }
                Some(_) => note(
                    warnings,
                    format!("format.{} must be a boolean; ignored", key),
                ),
                None => {}
            }
        }
        match format.get("modelStyle") {
            Some(Value::String(s)) if s == "full" || s == "version-only" => {
                coerced.insert("modelStyle".into(), Value::String(s.clone()));
            }
            Some(_) => note(
                warnings,
                "format.modelStyle must be \"full\" or \"version-only\"; ignored".to_string(),
            ),
            None => {}
        }
        match format.get("effortShort") {
            Some(Value::Bool(b)) => {
                coerced.insert("effortShort".into(), Value::Bool(*b));
            }
            Some(_) => note(
                warnings,
                "format.effortShort must be a boolean; ignored".to_string(),
            ),
            None => {}
        }
        for key in ["paceSlowPrefix", "paceNormalPrefix", "paceFastPrefix"] {
            match format.get(key) {
                Some(Value::String(s)) => {
                    coerced.insert(key.into(), Value::String(s.chars().take(8).collect()));
                }
                Some(_) => note(
                    warnings,
                    format!("format.{} must be a string; ignored", key),
                ),
                None => {}
            }
        }
        out.insert("format".into(), Value::Object(coerced));
    }

    Value::Object(out)
}

/// Ordered low->high precedence list of existing config sources.
fn resolve_hud_config_sources(
    codex_home: &Path,
    cwd: &Path,
    git_root: Option<&Path>,
) -> Vec<(String, PathBuf)> {
    let env_raw = std::env::var("CODEX_HUD_CONFIG")
        .ok()
        .filter(|v| !v.is_empty());
    let mut sources: Vec<(String, Option<PathBuf>)> = vec![
        ("user".into(), Some(codex_home.join(HUD_CONFIG_FILENAME))),
        (
            "project".into(),
            util::find_project_file(cwd, git_root, &[".codex", HUD_CONFIG_FILENAME]),
        ),
        (
            "env".into(),
            env_raw.map(|raw| util::absolute(Path::new(&raw))),
        ),
    ];
    sources
        .drain(..)
        .filter_map(|(tier, path)| path.map(|p| (tier, p)))
        .collect()
}

/// Port of loadHudConfig(): DEFAULT_CONFIG < user < project < env, with
/// warnings collected and config never failing.
pub fn load_hud_config(codex_home: &Path, cwd: &Path, git_root: Option<&Path>) -> Value {
    let mut warnings: Vec<String> = Vec::new();
    let mut contributors: Vec<Value> = Vec::new();
    let mut merged = default_config();
    for (tier, path) in resolve_hud_config_sources(codex_home, cwd, git_root) {
        let res = load_one_toml_file(&path);
        if !res.ok {
            warnings.push(res.error.unwrap_or_else(|| "parse error".into()));
            continue;
        }
        let Some(value) = res.value else { continue };
        let partial = validate_and_coerce(&value, &mut warnings, &path.display().to_string());
        merged = deep_merge(&merged, &partial);
        contributors.push(json!({ "tier": tier, "path": path.display().to_string() }));
    }
    json!({ "config": merged, "contributors": contributors, "warnings": warnings })
}

pub const CONFIG_SCAFFOLD: &str = r##"# codex-hud.toml — Codex HUD footer configuration (every key is optional).
# Search order (first found in each tier; later tiers override earlier):
#   1. $CODEX_HUD_CONFIG            explicit file path (env var)
#   2. ./.codex/codex-hud.toml      per-project (walks up to the git root)
#   3. $CODEX_HOME/codex-hud.toml   per-user ($CODEX_HOME defaults to ~/.codex)
# Anything you omit inherits the built-in default. Delete this file to reset.
# A malformed or invalid file is ignored (defaults used) with a note on stderr.
# Inspect the resolved result with:  codex-hud --print-config

# Compact by default. Set space = true for " | " segment spacing and ": " labels.
space = false

# Text placed between segments. The space flag controls padding around this text.
separator = "|"

# Which segments to show, in order. Remove, reorder, or add any of these ids:
#   model, project, branch, runtime, ctx, 5h, 7d, tkn
# Aliases: "workspace" = project + branch + runtime; "context" = ctx; "tokens" = tkn.
# (runtime / "node vX" is available but off by default — add it to opt in.)
segments = ["model", "project", "branch", "ctx", "5h", "7d", "tkn"]

# Rename the label shown for a segment. Keys are segment ids.
[labels]
ctx = "Ctx"
"5h" = "5h"
"7d" = "7d"
tkn = "Tkn"

# Per-segment / threshold colors. A value is a palette name, a 256-color code
# (0-255), or a "#rrggbb" hex (mapped to the nearest 256 color).
# Palette names: dim, coral, mint, amber, cyan, violet, neonViolet.
# ok / warn / crit are the threshold colors shared by ctx / 5h / 7d.
[colors]
model = "neonViolet"
project = "cyan"
branch = "neonViolet"
ok = "mint"
warn = "amber"
crit = "coral"

# Percent thresholds (0-100) switching ctx/5h/7d between ok/warn/crit colors.
[thresholds.percent]
warn = 70
crit = 90

# Pace thresholds for 5h/7d (how far ahead of an even burn rate before warn/crit).
[thresholds.pace]
warn = 0
crit = 15

# Value formatting toggles.
[format]
percentRound = true   # false -> one decimal place
tokenUnits = true     # false -> raw integers (no k/M)
tokenParts = true     # false -> total only, hide (I:.. O:.. C:..)
showPace = true       # false -> hide the pace % in 5h/7d
modelStyle = "full"   # "version-only" -> 5.5 instead of gpt-5.5
effortShort = false   # true -> xh instead of xhigh
paceSlowPrefix = "🐢"   # used more than thresholds.pace.crit behind pace
paceNormalPrefix = "🤖" # within +/- thresholds.pace.crit of pace
paceFastPrefix = "🔥"   # used more than thresholds.pace.crit ahead of pace
"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toml_key_exists_distinguishes_empty_array_from_absent_key() {
        let config = "[tui]\nstatus_line = []\nstatus_line_use_colors = false\n";
        assert!(toml_key_exists(config, "tui", "status_line"));
        assert!(!toml_key_exists(config, "tui", "status_line_missing"));
        assert!(toml_string_array(config, "tui", "status_line").is_empty());
    }

    #[test]
    fn validate_and_coerce_warns_for_wrong_type_object_sections() {
        let raw = json!({
            "separators": true,
            "labels": [],
            "colors": "blue",
            "thresholds": 7,
            "format": false
        });
        let mut warnings = Vec::new();
        let coerced = validate_and_coerce(&raw, &mut warnings, "test.toml");
        let map = coerced.as_object().expect("coerced config object");

        for key in ["separators", "labels", "colors", "thresholds", "format"] {
            assert!(!map.contains_key(key));
            assert!(
                warnings
                    .iter()
                    .any(|warning| warning
                        == &format!("test.toml: {} must be an object; ignored", key)),
                "missing warning for {key}"
            );
        }
    }
}
