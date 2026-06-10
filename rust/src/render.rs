use crate::colors::{self, colorize};
use crate::hudcfg;
use crate::js;
use crate::util;
use serde_json::Value;
use std::collections::HashMap;

// ── Plain formatters ─────────────────────────────────────────────────────────

/// Port of formatCounts().
pub fn format_counts(counts: Option<&Value>) -> String {
    let Some(counts) = counts.filter(|c| js::truthy(Some(c))) else {
        return "clean".to_string();
    };
    let mut parts = Vec::new();
    for key in [
        "modified",
        "added",
        "deleted",
        "renamed",
        "untracked",
        "other",
    ] {
        if js::truthy(counts.get(key)) {
            let n = js::js_number(counts.get(key));
            parts.push(format!("{}:{}", &key[..1], js::num_to_string(n)));
        }
    }
    if parts.is_empty() {
        "clean".to_string()
    } else {
        parts.join(" ")
    }
}

/// Port of formatHookEvents().
pub fn format_hook_events(events: Option<&Value>) -> String {
    let mut parts = Vec::new();
    if let Some(Value::Object(map)) = events {
        for (event, count) in map {
            let n = js::js_number(Some(count));
            if n > 0.0 {
                parts.push(format!("{}:{}", event, js::num_to_string(n)));
            }
        }
    }
    if parts.is_empty() {
        "none".to_string()
    } else {
        parts.join(" ")
    }
}

/// Port of formatDurationUntil(). NOTE: no ".0" strip (oracle keeps "2.0h").
pub fn format_duration_until(epoch_seconds: f64) -> String {
    let seconds = epoch_seconds - util::now_ms() / 1000.0;
    if !seconds.is_finite() {
        return "?".to_string();
    }
    if seconds <= 0.0 {
        return "now".to_string();
    }
    let hours = seconds / 3600.0;
    if hours < 24.0 {
        let text = if hours < 10.0 {
            js::to_fixed1(hours)
        } else {
            js::num_to_string(js::js_round(hours))
        };
        return format!("{}h", text);
    }
    let days = hours / 24.0;
    let text = if days < 10.0 {
        js::to_fixed1(days)
    } else {
        js::num_to_string(js::js_round(days))
    };
    format!("{}d", text)
}

/// Port of formatDurationWindow(): same as above but strips a trailing ".0".
pub fn format_duration_window(minutes: f64) -> String {
    if !minutes.is_finite() || minutes <= 0.0 {
        return String::new();
    }
    let strip = |s: String| s.strip_suffix(".0").map(|t| t.to_string()).unwrap_or(s);
    let hours = minutes / 60.0;
    if hours < 24.0 {
        let text = if hours < 10.0 {
            strip(js::to_fixed1(hours))
        } else {
            js::num_to_string(js::js_round(hours))
        };
        return format!("{}h", text);
    }
    let days = hours / 24.0;
    let text = if days < 10.0 {
        strip(js::to_fixed1(days))
    } else {
        js::num_to_string(js::js_round(days))
    };
    format!("{}d", text)
}

/// Port of formatReasoningEffort().
pub fn format_reasoning_effort(value: Option<&Value>) -> Option<String> {
    let value = value.filter(|v| js::truthy(Some(v)))?;
    let raw = match value {
        Value::String(s) => s.clone(),
        other => js::num_to_string(js::js_number(Some(other))),
    };
    let normalized = raw.trim().to_string();
    // Oracle regex /^x[-_ ]?high$/i expands to exactly these four forms.
    match normalized.to_lowercase().as_str() {
        "xhigh" | "x-high" | "x_high" | "x high" => Some("xhigh".to_string()),
        "high" => Some("High".to_string()),
        "medium" => Some("Med".to_string()),
        "low" => Some("Low".to_string()),
        _ => Some(normalized),
    }
}

/// Port of ratePacePercent().
pub fn rate_pace_percent(window: Option<&Value>) -> Option<f64> {
    let window = window.filter(|w| js::truthy(Some(w)))?;
    if !js::truthy(window.get("resetsAt")) || !js::truthy(window.get("windowMinutes")) {
        return None;
    }
    let resets_at = js::js_number(window.get("resetsAt"));
    let window_minutes = js::js_number(window.get("windowMinutes"));
    let remaining_ms = (resets_at * 1000.0 - util::now_ms()).max(0.0);
    let window_ms = window_minutes * 60000.0;
    let elapsed_ms = window_ms - remaining_ms;
    if elapsed_ms < 0.0 || elapsed_ms > window_ms {
        return None;
    }
    Some(js::js_round(elapsed_ms / window_ms * 100.0))
}

// ── Status helpers ───────────────────────────────────────────────────────────

fn basename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Port of statusProjectName().
pub fn status_project_name(data: &Value) -> String {
    let package = js::get(data.get("project"), "package");
    if let Some(name) = js::get(package, "name").filter(|n| js::truthy(Some(n))) {
        if let Some(s) = name.as_str() {
            return s.to_string();
        }
    }
    let git = data.get("git");
    if js::truthy(js::get(git, "available")) {
        if let Some(root) = js::get(git, "root")
            .and_then(|r| r.as_str())
            .filter(|r| !r.is_empty())
        {
            return basename(root);
        }
    }
    basename(data.get("cwd").and_then(|c| c.as_str()).unwrap_or(""))
}

/// Port of statusGitBranch().
pub fn status_git_branch(data: &Value) -> Option<String> {
    let git = data.get("git");
    if !js::truthy(js::get(git, "available")) {
        return None;
    }
    let branch = js::get(git, "branch")
        .and_then(|b| b.as_str())
        .unwrap_or("")
        .to_string();
    let dirty = js::js_number(js::get(git, "dirty"));
    Some(if dirty > 0.0 {
        format!("{}*", branch)
    } else {
        branch
    })
}

/// Port of statusModel().
pub fn status_model(data: &Value) -> Option<String> {
    let config = data.get("config");
    let raw_model = js::get(config, "model")
        .filter(|m| js::truthy(Some(m)))
        .and_then(|m| m.as_str())
        .map(|m| m.to_string())
        .or_else(|| {
            let codex_version = data
                .get("codexVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            codex_version
                .split_whitespace()
                .next()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        });
    let model = raw_model.map(|m| {
        if m.len() >= 4 && m[..4].eq_ignore_ascii_case("gpt-") {
            m[4..].to_string()
        } else {
            m
        }
    });
    let reasoning = format_reasoning_effort(js::get(config, "reasoning"));
    let joined: String = [model, reasoning]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

// ── Config-driven footer rendering ───────────────────────────────────────────

pub struct Separators {
    pub segment: String,
    pub token_part: String,
    pub label_value: String,
    pub open: String,
    pub close: String,
}

struct RenderCtx<'a> {
    label: String,
    color: Option<String>,
    colors: &'a HashMap<String, String>,
    config: &'a Value,
    separators: &'a Separators,
    color_enabled: bool,
}

impl<'a> RenderCtx<'a> {
    fn color_of(&self, key: &str) -> Option<&str> {
        self.colors.get(key).map(|s| s.as_str())
    }
    /// JS `ctx.color || c.label`
    fn label_color(&self) -> Option<&str> {
        self.color.as_deref().or_else(|| self.color_of("label"))
    }
    fn threshold(&self, group: &str, key: &str) -> f64 {
        js::js_number(js::get(js::get(self.config.get("thresholds"), group), key))
    }
    fn format_flag(&self, key: &str) -> bool {
        js::truthy(js::get(self.config.get("format"), key))
    }
    fn label_text(&self, key: &str) -> String {
        match js::get(self.config.get("labels"), key) {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => js::num_to_string(n.as_f64().unwrap_or(f64::NAN)),
            _ => String::new(),
        }
    }
}

/// Port of formatPercentCfg().
fn format_percent_cfg(value: Option<f64>, percent_round: bool) -> String {
    let Some(value) = value.filter(|v| v.is_finite()) else {
        return "?".to_string();
    };
    let shown = if percent_round {
        js::js_round(value)
    } else {
        js::js_round(value * 10.0) / 10.0
    };
    format!("{}%", js::num_to_string(shown))
}

/// Port of formatTokenCountCfg().
fn format_token_count_cfg(value: Option<f64>, token_units: bool) -> String {
    let Some(value) = value.filter(|v| v.is_finite()) else {
        return "?".to_string();
    };
    if !token_units {
        return js::num_to_string(js::js_round(value));
    }
    if value >= 1_000_000.0 {
        let text = js::to_fixed1(value / 1_000_000.0);
        let text = text
            .strip_suffix(".0")
            .map(|t| t.to_string())
            .unwrap_or(text);
        return format!("{}M", text);
    }
    if value >= 1000.0 {
        return format!("{}k", js::num_to_string(js::js_round(value / 1000.0)));
    }
    js::num_to_string(js::js_round(value))
}

/// Port of colorByPercentCfg().
fn color_by_percent_cfg<'a>(value: Option<f64>, ctx: &'a RenderCtx) -> Option<&'a str> {
    let Some(value) = value.filter(|v| v.is_finite()) else {
        return ctx.color_of("none");
    };
    if value >= ctx.threshold("percent", "crit") {
        return ctx.color_of("crit");
    }
    if value >= ctx.threshold("percent", "warn") {
        return ctx.color_of("warn");
    }
    ctx.color_of("ok")
}

/// Port of colorByPaceDeltaCfg().
fn color_by_pace_delta_cfg<'a>(
    percent: Option<f64>,
    pace: Option<f64>,
    ctx: &'a RenderCtx,
) -> Option<&'a str> {
    let (Some(percent), Some(pace)) = (
        percent.filter(|v| v.is_finite()),
        pace.filter(|v| v.is_finite()),
    ) else {
        return ctx.color_of("none");
    };
    let diff = percent - pace;
    if diff > ctx.threshold("pace", "crit") {
        return ctx.color_of("crit");
    }
    if diff > ctx.threshold("pace", "warn") {
        return ctx.color_of("warn");
    }
    ctx.color_of("ok")
}

/// Port of renderMetric().
fn render_metric(label: &str, percent: Option<f64>, detail: &str, ctx: &RenderCtx) -> String {
    let e = ctx.color_enabled;
    let s = ctx.separators;
    let label_text = colorize(label, ctx.label_color(), e);
    let percent_text = colorize(
        &format_percent_cfg(percent, ctx.format_flag("percentRound")),
        color_by_percent_cfg(percent, ctx),
        e,
    );
    let detail_text = if detail.is_empty() {
        String::new()
    } else {
        colorize(
            &format!("{}{}{}", s.open, detail, s.close),
            ctx.color_of("label"),
            e,
        )
    };
    format!(
        "{}{}{}{}",
        label_text,
        colorize(&s.label_value, ctx.color_of("label"), e),
        percent_text,
        detail_text
    )
}

/// Port of renderRate().
fn render_rate(label: &str, window: Option<&Value>, ctx: &RenderCtx) -> String {
    let e = ctx.color_enabled;
    let s = ctx.separators;
    let window = window.filter(|w| js::truthy(Some(w)));
    let Some(window) = window else {
        return format!(
            "{}{}",
            colorize(label, ctx.label_color(), e),
            colorize(&format!("{}?", s.label_value), ctx.color_of("label"), e)
        );
    };
    let remaining_raw = if js::truthy(window.get("resetsAt")) {
        format_duration_until(js::js_number(window.get("resetsAt")))
    } else {
        String::new()
    };
    let remaining = if remaining_raw == "now" {
        let from_window = format_duration_window(js::js_number(window.get("windowMinutes")));
        if from_window.is_empty() {
            remaining_raw
        } else {
            from_window
        }
    } else {
        remaining_raw
    };
    let pace = rate_pace_percent(Some(window));
    let used_percent = js::as_finite_number(window.get("usedPercent"));

    let mut detail_parts: Vec<String> = Vec::new();
    if !remaining.is_empty() {
        detail_parts.push(colorize(&remaining, ctx.color_of("label"), e));
    }
    if ctx.format_flag("showPace") {
        if let Some(pace_value) = pace {
            let pace_color = ctx
                .color_of("pace")
                .or_else(|| color_by_pace_delta_cfg(used_percent, Some(pace_value), ctx));
            detail_parts.push(colorize(
                &format_percent_cfg(Some(pace_value), ctx.format_flag("percentRound")),
                pace_color,
                e,
            ));
        }
    }
    let detail = if detail_parts.is_empty() {
        String::new()
    } else {
        format!(
            "{}{}{}",
            colorize(&s.open, ctx.color_of("label"), e),
            detail_parts.join(&colorize(&s.token_part, ctx.color_of("label"), e)),
            colorize(&s.close, ctx.color_of("label"), e)
        )
    };
    let label_text = colorize(label, ctx.label_color(), e);
    let percent_text = colorize(
        &format_percent_cfg(used_percent, ctx.format_flag("percentRound")),
        color_by_percent_cfg(used_percent, ctx),
        e,
    );
    format!(
        "{}{}{}{}",
        label_text,
        colorize(&s.label_value, ctx.color_of("label"), e),
        percent_text,
        detail
    )
}

/// Port of renderTokenUsage().
fn render_token_usage(label: &str, tokens: Option<&Value>, ctx: &RenderCtx) -> String {
    let e = ctx.color_enabled;
    let s = ctx.separators;
    let label_text = colorize(label, ctx.label_color(), e);
    let tokens = tokens.filter(|t| js::truthy(Some(t)));
    let Some(tokens) = tokens else {
        return format!(
            "{}{}",
            label_text,
            colorize(&format!("{}?", s.label_value), ctx.color_of("label"), e)
        );
    };
    let token_units = ctx.format_flag("tokenUnits");
    let count = |key: &str| -> Option<f64> { js::as_finite_number(tokens.get(key)) };

    let total = colorize(
        &format_token_count_cfg(count("total"), token_units),
        ctx.color_of("tokenTotal"),
        e,
    );
    if !ctx.format_flag("tokenParts") {
        return format!(
            "{}{}{}",
            label_text,
            colorize(&s.label_value, ctx.color_of("label"), e),
            total
        );
    }
    let input = colorize(
        &format_token_count_cfg(count("input"), token_units),
        ctx.color_of("tokenInput"),
        e,
    );
    let output = colorize(
        &format_token_count_cfg(count("output"), token_units),
        ctx.color_of("tokenOutput"),
        e,
    );
    let cache = colorize(
        &format_token_count_cfg(count("cache"), token_units),
        ctx.color_of("tokenCache"),
        e,
    );
    format!(
        "{}{}{}{}{}{}{}{}{}{}",
        label_text,
        colorize(&s.label_value, ctx.color_of("label"), e),
        total,
        colorize(
            &format!("{}{}", s.open, ctx.label_text("tokenInput")),
            ctx.color_of("label"),
            e
        ),
        input,
        colorize(
            &format!("{}{}", s.token_part, ctx.label_text("tokenOutput")),
            ctx.color_of("label"),
            e
        ),
        output,
        colorize(
            &format!("{}{}", s.token_part, ctx.label_text("tokenCache")),
            ctx.color_of("label"),
            e
        ),
        cache,
        colorize(&s.close, ctx.color_of("label"), e)
    )
}

/// Segment registry dispatch (port of SEGMENTS). Returns (text, joinWithPrevious).
fn render_segment(id: &str, data: &Value, ctx: &RenderCtx) -> Option<String> {
    match id {
        "model" => {
            status_model(data).map(|m| colorize(&m, ctx.color.as_deref(), ctx.color_enabled))
        }
        "project" => Some(colorize(
            &status_project_name(data),
            ctx.color.as_deref(),
            ctx.color_enabled,
        )),
        "branch" => {
            let branch = status_git_branch(data)?;
            if branch.is_empty() {
                // Oracle: empty branch string is falsy in JS -> segment skipped.
                return None;
            }
            let is_dirty = branch.ends_with('*');
            let clean = if is_dirty {
                &branch[..branch.len() - 1]
            } else {
                &branch[..]
            };
            let dirty = if is_dirty {
                colorize("*", ctx.color_of("dirty"), ctx.color_enabled)
            } else {
                String::new()
            };
            Some(format!(
                "{}{}{}{}",
                colorize("git(", ctx.color_of("label"), ctx.color_enabled),
                colorize(clean, ctx.color.as_deref(), ctx.color_enabled),
                dirty,
                colorize(")", ctx.color_of("label"), ctx.color_enabled)
            ))
        }
        "runtime" => {
            let runtime = data.get("runtime").filter(|r| js::truthy(Some(r)))?;
            let label = runtime
                .get("label")
                .and_then(|l| l.as_str())
                .filter(|l| !l.is_empty())?;
            let version = runtime
                .get("version")
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())?;
            Some(colorize(
                &format!("{} {}", label, version),
                ctx.color.as_deref(),
                ctx.color_enabled,
            ))
        }
        "ctx" => {
            let context = js::get(data.get("usage").filter(|u| js::truthy(Some(u))), "context");
            let used = js::as_finite_number(js::get(context, "usedPercent"));
            Some(render_metric(&ctx.label, used, "", ctx))
        }
        "5h" => {
            let rl = js::get(
                data.get("usage").filter(|u| js::truthy(Some(u))),
                "rateLimits",
            );
            Some(render_rate(&ctx.label, js::get(rl, "primary"), ctx))
        }
        "7d" => {
            let rl = js::get(
                data.get("usage").filter(|u| js::truthy(Some(u))),
                "rateLimits",
            );
            Some(render_rate(&ctx.label, js::get(rl, "secondary"), ctx))
        }
        "tkn" => {
            let tokens = js::get(data.get("usage").filter(|u| js::truthy(Some(u))), "tokens");
            Some(render_token_usage(&ctx.label, tokens, ctx))
        }
        _ => None,
    }
}

fn default_label(id: &str) -> &'static str {
    match id {
        "ctx" => "Ctx",
        "5h" => "5h",
        "7d" => "7d",
        "tkn" => "Tkn",
        _ => "",
    }
}

/// Port of getRenderConfig().
pub fn get_render_config(data: &Value) -> Value {
    js::get(data.get("hud"), "config")
        .filter(|c| js::truthy(Some(c)))
        .cloned()
        .unwrap_or_else(hudcfg::default_config)
}

/// Port of effectiveSeparators().
pub fn effective_separators(config: &Value) -> Separators {
    let get = |key: &str, default: &str| -> String {
        js::get(config.get("separators"), key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| default.to_string())
    };
    let mut segment = get("segment", "|");
    let token_part = get("tokenPart", ",");
    let mut label_value = get("labelValue", ":");
    let open = get("open", "(");
    let close = get("close", ")");
    if js::truthy(config.get("space")) {
        segment = format!(" {} ", segment.trim());
        label_value = format!("{} ", label_value.trim_end());
    }
    Separators {
        segment,
        token_part,
        label_value,
        open,
        close,
    }
}

/// Port of renderFooter().
pub fn render_footer(data: &Value, config: &Value, color: bool) -> String {
    let color_enabled = color;
    let empty_colors = Value::Object(serde_json::Map::new());
    let colors_cfg = config.get("colors").unwrap_or(&empty_colors);
    let colors = colors::resolve_color_set(colors_cfg);
    let sep_color = colors::resolve_color(colors_cfg.get("separator"), Some(colors::dim()));
    let separators = effective_separators(config);
    let separator = colorize(&separators.segment, sep_color.as_deref(), color_enabled);

    let empty_segments = Vec::new();
    let segment_ids = config
        .get("segments")
        .and_then(|s| s.as_array())
        .unwrap_or(&empty_segments);

    struct Piece {
        text: String,
        joiner: Option<&'static str>,
    }
    let mut pieces: Vec<Piece> = Vec::new();
    for id_value in segment_ids {
        let Some(id) = id_value.as_str() else {
            continue;
        };
        if !hudcfg::KNOWN_SEGMENTS.contains(&id) {
            continue;
        }
        let label = match js::get(config.get("labels"), id) {
            Some(Value::Null) | None => default_label(id).to_string(),
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => js::num_to_string(n.as_f64().unwrap_or(f64::NAN)),
            Some(other) => other.to_string(),
        };
        let ctx = RenderCtx {
            label,
            color: colors.get(id).cloned(),
            colors: &colors,
            config,
            separators: &separators,
            color_enabled,
        };
        let text = render_segment(id, data, &ctx);
        let Some(text) = text.filter(|t| !t.is_empty()) else {
            continue;
        };
        let joiner = if id == "runtime" { Some(" ") } else { None };
        pieces.push(Piece { text, joiner });
    }

    if pieces.is_empty() {
        return String::new();
    }
    let mut out = pieces[0].text.clone();
    for piece in &pieces[1..] {
        let glue = piece.joiner.unwrap_or(separator.as_str());
        out.push_str(glue);
        out.push_str(&piece.text);
    }
    out
}

/// Port of formatUsageLine().
pub fn format_usage_line(data: &Value, color: bool) -> String {
    render_footer(data, &get_render_config(data), color)
}

/// Port of formatText(): the multiline HUD view.
pub fn format_text(data: &Value) -> String {
    let config = data.get("config");
    let empty_items = Vec::new();
    let items = js::get(config, "nativeStatusItems")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty_items);
    let item_strings: Vec<String> = items
        .iter()
        .take(8)
        .map(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| v.to_string())
        })
        .collect();
    let status_preview = item_strings.join(", ");
    let status_suffix = if items.len() > 8 {
        format!(" +{}", items.len() - 8)
    } else {
        String::new()
    };
    let pkg = js::get(data.get("project"), "package");

    let str_of =
        |v: Option<&Value>| -> String { v.and_then(|x| x.as_str()).unwrap_or("").to_string() };
    let or_q = |v: Option<&Value>| -> String {
        match v.filter(|x| js::truthy(Some(x))) {
            Some(Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
            None => "?".to_string(),
        }
    };

    let git = data.get("git");
    let git_line = if js::truthy(js::get(git, "available")) {
        format!(
            "  git: {} | dirty {} ({})",
            str_of(js::get(git, "header")),
            js::num_to_string(js::js_number(js::get(git, "dirty"))),
            format_counts(js::get(git, "counts"))
        )
    } else {
        "  git: unavailable".to_string()
    };

    let pkg_line = match js::get(pkg, "name").filter(|n| js::truthy(Some(n))) {
        Some(name) => {
            let name = name.as_str().unwrap_or("").to_string();
            match js::get(pkg, "version").filter(|v| js::truthy(Some(v))) {
                Some(version) => format!("{}@{}", name, version.as_str().unwrap_or("")),
                None => name,
            }
        }
        None => "none detected".to_string(),
    };

    let status_colors = match js::get(config, "nativeStatusColors") {
        Some(Value::Null) | None => "?",
        Some(v) if js::truthy(Some(v)) => "on",
        Some(_) => "off",
    };

    let codex_version = match data.get("codexVersion").filter(|v| js::truthy(Some(v))) {
        Some(v) => v.as_str().unwrap_or("").to_string(),
        None => "codex unavailable".to_string(),
    };

    [
        format!(
            "Codex HUD {} | {}",
            str_of(data.get("codexHudVersion")),
            codex_version
        ),
        format!("Generated: {}", str_of(data.get("generatedAt"))),
        String::new(),
        "Codex".to_string(),
        format!(
            "  model: {} / reasoning {}",
            or_q(js::get(config, "model")),
            or_q(js::get(config, "reasoning"))
        ),
        format!(
            "  sandbox: {} / approval {}",
            or_q(js::get(config, "sandbox")),
            or_q(js::get(config, "approval"))
        ),
        format!(
            "  status line: {} items, colors {}",
            js::num_to_string(js::js_number(js::get(config, "nativeStatusItemCount"))),
            status_colors
        ),
        format!(
            "  items: {}{}",
            if status_preview.is_empty() {
                "none".to_string()
            } else {
                status_preview
            },
            status_suffix
        ),
        format!("  usage: {}", format_usage_line(data, false)),
        String::new(),
        "Workspace".to_string(),
        format!("  cwd: {}", str_of(data.get("cwd"))),
        git_line,
        format!("  repo: {}", or_q(js::get(git, "root"))),
        format!("  package: {}", pkg_line),
        format!(
            "  AGENTS.md: {}",
            match js::get(data.get("project"), "agentsPath").filter(|p| js::truthy(Some(p))) {
                Some(p) => p.as_str().unwrap_or("").to_string(),
                None => "none detected".to_string(),
            }
        ),
        String::new(),
        "Hooks".to_string(),
        format!(
            "  events: {}",
            format_hook_events(js::get(data.get("hooks"), "events"))
        ),
        format!("  file: {}", str_of(js::get(data.get("hooks"), "path"))),
        String::new(),
        "Project Priority".to_string(),
        format!(
            "  {}",
            match js::get(data.get("project"), "activePriority").filter(|p| js::truthy(Some(p))) {
                Some(p) => p.as_str().unwrap_or("").to_string(),
                None => "none detected".to_string(),
            }
        ),
        String::new(),
        "Limitations".to_string(),
        format!("  {}", str_of(js::get(data.get("limits"), "note"))),
    ]
    .join("\n")
}

/// Port of emitHudWarnings(): first warning (collapsed) to stderr.
pub fn emit_hud_warnings(data: &Value) {
    let warnings = js::get(data.get("hud"), "warnings").and_then(|w| w.as_array());
    let Some(warnings) = warnings.filter(|w| !w.is_empty()) else {
        return;
    };
    let first_raw = match &warnings[0] {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let collapsed = first_raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let first: String = collapsed.chars().take(300).collect();
    let extra = if warnings.len() > 1 {
        format!(" (+{} more)", warnings.len() - 1)
    } else {
        String::new()
    };
    eprintln!("codex-hud: {}{}", first, extra);
}
