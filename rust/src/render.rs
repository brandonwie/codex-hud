use crate::colors::{self, colorize};
use crate::compat;
use crate::hudcfg;
use crate::util;
use serde_json::Value;
use std::collections::HashMap;

// ── Plain formatters ─────────────────────────────────────────────────────────

/// Port of formatCounts().
pub fn format_counts(counts: Option<&Value>) -> String {
    let Some(counts) = counts.filter(|c| compat::truthy(Some(c))) else {
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
        if compat::truthy(counts.get(key)) {
            let n = compat::js_number(counts.get(key));
            parts.push(format!("{}:{}", &key[..1], compat::num_to_string(n)));
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
            let n = compat::js_number(Some(count));
            if n > 0.0 {
                parts.push(format!("{}:{}", event, compat::num_to_string(n)));
            }
        }
    }
    if parts.is_empty() {
        "none".to_string()
    } else {
        parts.join(" ")
    }
}

/// Port of the original duration formatting. NOTE: no ".0" strip (keeps "2.0h").
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
            compat::to_fixed1(hours)
        } else {
            compat::num_to_string(compat::js_round(hours))
        };
        return format!("{}h", text);
    }
    let days = hours / 24.0;
    let text = if days < 10.0 {
        compat::to_fixed1(days)
    } else {
        compat::num_to_string(compat::js_round(days))
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
            strip(compat::to_fixed1(hours))
        } else {
            compat::num_to_string(compat::js_round(hours))
        };
        return format!("{}h", text);
    }
    let days = hours / 24.0;
    let text = if days < 10.0 {
        strip(compat::to_fixed1(days))
    } else {
        compat::num_to_string(compat::js_round(days))
    };
    format!("{}d", text)
}

/// Port of formatReasoningEffort().
pub fn format_reasoning_effort(value: Option<&Value>, effort_short: bool) -> Option<String> {
    let value = value.filter(|v| compat::truthy(Some(v)))?;
    let raw = match value {
        Value::String(s) => s.clone(),
        other => compat::num_to_string(compat::js_number(Some(other))),
    };
    let normalized = raw.trim().to_string();
    // Compatibility regex /^x[-_ ]?high$/i expands to exactly these four forms.
    match normalized.to_lowercase().as_str() {
        "xhigh" | "x-high" | "x_high" | "x high" => {
            Some(if effort_short { "xh" } else { "xhigh" }.to_string())
        }
        "high" => Some(if effort_short { "h" } else { "high" }.to_string()),
        "medium" => Some(if effort_short { "m" } else { "medium" }.to_string()),
        "low" => Some(if effort_short { "l" } else { "low" }.to_string()),
        "minimal" => Some(if effort_short { "min" } else { "minimal" }.to_string()),
        _ => Some(normalized),
    }
}

/// Port of ratePacePercent().
pub fn rate_pace_percent(window: Option<&Value>) -> Option<f64> {
    let window = window.filter(|w| compat::truthy(Some(w)))?;
    if !compat::truthy(window.get("resetsAt")) || !compat::truthy(window.get("windowMinutes")) {
        return None;
    }
    let resets_at = compat::js_number(window.get("resetsAt"));
    let window_minutes = compat::js_number(window.get("windowMinutes"));
    let remaining_ms = (resets_at * 1000.0 - util::now_ms()).max(0.0);
    let window_ms = window_minutes * 60000.0;
    let elapsed_ms = window_ms - remaining_ms;
    if elapsed_ms < 0.0 || elapsed_ms > window_ms {
        return None;
    }
    Some(compat::js_round(elapsed_ms / window_ms * 100.0))
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
    let package = compat::get(data.get("project"), "package");
    if let Some(name) = compat::get(package, "name").filter(|n| compat::truthy(Some(n))) {
        if let Some(s) = name.as_str() {
            return s.to_string();
        }
    }
    let git = data.get("git");
    if compat::truthy(compat::get(git, "available")) {
        if let Some(root) = compat::get(git, "root")
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
    if !compat::truthy(compat::get(git, "available")) {
        return None;
    }
    let branch = compat::get(git, "branch")
        .and_then(|b| b.as_str())
        .unwrap_or("")
        .to_string();
    let dirty = compat::js_number(compat::get(git, "dirty"));
    Some(if dirty > 0.0 {
        format!("{}*", branch)
    } else {
        branch
    })
}

/// Port of statusModel().
#[cfg(test)]
pub fn status_model(data: &Value) -> Option<String> {
    let default = hudcfg::default_config();
    let parts = status_identity_parts(data, default.get("format"), false);
    (!parts.is_empty()).then(|| parts.join("|"))
}

fn format_override(format: Option<&Value>, key: &str, fallback: bool) -> bool {
    match compat::get(format, key) {
        Some(Value::Bool(value)) => *value,
        _ => fallback,
    }
}

fn identity_short(format: Option<&Value>) -> bool {
    compat::truthy(compat::get(format, "identityShort"))
}

fn format_model_name(raw: String, format: Option<&Value>) -> String {
    let short = format_override(format, "modelShort", identity_short(format));
    if !short {
        return raw;
    }
    // SECURITY: get(..4) avoids a char-boundary panic when an untrusted
    // model string has a multibyte char at byte 4 (legacy regex never crashed).
    match raw.get(..4) {
        Some(prefix) if prefix.eq_ignore_ascii_case("gpt-") => raw[4..].to_string(),
        _ => raw,
    }
}

fn format_service_tier(value: &str, short: bool) -> Option<String> {
    let normalized = value.trim().to_lowercase();
    match normalized.as_str() {
        "" | "default" | "standard" => None,
        "fast" if short => Some("f".to_string()),
        "flex" if short => Some("fl".to_string()),
        _ => Some(normalized),
    }
}

fn status_identity_parts(data: &Value, format: Option<&Value>, force_fast: bool) -> Vec<String> {
    let config = data.get("config");
    let raw_model = compat::get(config, "model")
        .filter(|m| compat::truthy(Some(m)))
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
    let short = identity_short(format);
    let model = raw_model.map(|m| format_model_name(m, format));
    let reasoning = format_reasoning_effort(
        compat::get(config, "reasoning"),
        format_override(format, "effortShort", short),
    );
    let service_tier = if force_fast {
        Some("fast")
    } else {
        compat::get(config, "serviceTier").and_then(Value::as_str)
    };
    let tier = service_tier.and_then(|value| format_service_tier(value, short));
    [model, reasoning, tier]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
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
    /// JavaScript-compatible `ctx.color || c.label` fallback.
    fn label_color(&self) -> Option<&str> {
        self.color.as_deref().or_else(|| self.color_of("label"))
    }
    fn threshold(&self, group: &str, key: &str) -> f64 {
        compat::js_number(compat::get(
            compat::get(self.config.get("thresholds"), group),
            key,
        ))
    }
    fn format_flag(&self, key: &str) -> bool {
        compat::truthy(compat::get(self.config.get("format"), key))
    }
    fn format_text(&self, key: &str) -> String {
        compat::get(self.config.get("format"), key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }
    fn label_text(&self, key: &str) -> String {
        match compat::get(self.config.get("labels"), key) {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => compat::num_to_string(n.as_f64().unwrap_or(f64::NAN)),
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
        compat::js_round(value)
    } else {
        compat::js_round(value * 10.0) / 10.0
    };
    format!("{}%", compat::num_to_string(shown))
}

/// Port of formatTokenCountCfg().
fn format_token_count_cfg(value: Option<f64>, token_units: bool) -> String {
    let Some(value) = value.filter(|v| v.is_finite()) else {
        return "?".to_string();
    };
    if !token_units {
        return compat::num_to_string(compat::js_round(value));
    }
    if value >= 1_000_000.0 {
        let text = compat::to_fixed1(value / 1_000_000.0);
        let text = text
            .strip_suffix(".0")
            .map(|t| t.to_string())
            .unwrap_or(text);
        return format!("{}M", text);
    }
    if value >= 1000.0 {
        return format!(
            "{}k",
            compat::num_to_string(compat::js_round(value / 1000.0))
        );
    }
    compat::num_to_string(compat::js_round(value))
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

fn pace_state_prefix(percent: Option<f64>, pace: Option<f64>, ctx: &RenderCtx) -> String {
    if !ctx.format_flag("pacePrefix") {
        return String::new();
    }
    let (Some(percent), Some(pace)) = (
        percent.filter(|v| v.is_finite()),
        pace.filter(|v| v.is_finite()),
    ) else {
        return String::new();
    };
    let diff = percent - pace;
    let threshold = ctx.threshold("pace", "crit");
    if diff < -threshold {
        return ctx.format_text("paceSlowPrefix");
    }
    if diff > threshold {
        return ctx.format_text("paceFastPrefix");
    }
    ctx.format_text("paceNormalPrefix")
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
    let window = window.filter(|w| compat::truthy(Some(w)));
    let Some(window) = window else {
        return format!(
            "{}{}",
            colorize(label, ctx.label_color(), e),
            colorize(&format!("{}?", s.label_value), ctx.color_of("label"), e)
        );
    };
    let remaining_raw = if compat::truthy(window.get("resetsAt")) {
        format_duration_until(compat::js_number(window.get("resetsAt")))
    } else {
        String::new()
    };
    let remaining = if remaining_raw == "now" {
        let from_window = format_duration_window(compat::js_number(window.get("windowMinutes")));
        if from_window.is_empty() {
            remaining_raw
        } else {
            from_window
        }
    } else {
        remaining_raw
    };
    let pace = rate_pace_percent(Some(window));
    let used_percent = compat::as_finite_number(window.get("usedPercent"));

    let mut detail_parts: Vec<String> = Vec::new();
    if !remaining.is_empty() {
        detail_parts.push(colorize(&remaining, ctx.color_of("label"), e));
    }
    if ctx.format_flag("pace") {
        if let Some(pace_value) = pace {
            let pace_color = ctx
                .color_of("pace")
                .or_else(|| color_by_pace_delta_cfg(used_percent, Some(pace_value), ctx));
            let pace_text = format!(
                "{}{}",
                pace_state_prefix(used_percent, Some(pace_value), ctx),
                format_percent_cfg(Some(pace_value), ctx.format_flag("percentRound"))
            );
            detail_parts.push(colorize(&pace_text, pace_color, e));
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
    let tokens = tokens.filter(|t| compat::truthy(Some(t)));
    let Some(tokens) = tokens else {
        return format!(
            "{}{}",
            label_text,
            colorize(&format!("{}?", s.label_value), ctx.color_of("label"), e)
        );
    };
    let token_units = ctx.format_flag("tokenUnits");
    let count = |key: &str| -> Option<f64> { compat::as_finite_number(tokens.get(key)) };

    let total = colorize(
        &format_token_count_cfg(count("total"), token_units),
        ctx.color_of("tokenTotal"),
        e,
    );
    if !ctx.format_flag("tokenUsage") {
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
        // The model id expands to model / effort / service-tier pieces in
        // render_footer so each identity atom gets the normal segment glue.
        "model" => None,
        "project" => Some(colorize(
            &status_project_name(data),
            ctx.color.as_deref(),
            ctx.color_enabled,
        )),
        "branch" => {
            let branch = status_git_branch(data)?;
            if branch.is_empty() {
                // Keep empty branch strings falsy so the segment is skipped.
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
            let runtime = data.get("runtime").filter(|r| compat::truthy(Some(r)))?;
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
            let context = compat::get(
                data.get("usage").filter(|u| compat::truthy(Some(u))),
                "context",
            );
            let used = compat::as_finite_number(compat::get(context, "usedPercent"));
            Some(render_metric(&ctx.label, used, "", ctx))
        }
        "5h" => {
            let rl = compat::get(
                data.get("usage").filter(|u| compat::truthy(Some(u))),
                "rateLimits",
            );
            Some(render_rate(&ctx.label, compat::get(rl, "primary"), ctx))
        }
        "7d" => {
            let rl = compat::get(
                data.get("usage").filter(|u| compat::truthy(Some(u))),
                "rateLimits",
            );
            Some(render_rate(&ctx.label, compat::get(rl, "secondary"), ctx))
        }
        "tkn" => {
            let tokens = compat::get(
                data.get("usage").filter(|u| compat::truthy(Some(u))),
                "tokens",
            );
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
    compat::get(data.get("hud"), "config")
        .filter(|c| compat::truthy(Some(c)))
        .cloned()
        .unwrap_or_else(hudcfg::default_config)
}

/// Port of effectiveSeparators().
pub fn effective_separators(config: &Value) -> Separators {
    let get = |key: &str, default: &str| -> String {
        compat::get(config.get("separators"), key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| default.to_string())
    };
    let mut segment = get("segment", "|");
    let token_part = get("tokenPart", ",");
    let mut label_value = get("labelValue", ":");
    let open = get("open", "(");
    let close = get("close", ")");
    if compat::truthy(config.get("space")) {
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

    // Compatibility override: force the service-tier identity atom to `fast`.
    let force_fast = compat::truthy(compat::get(config.get("format"), "fastMode"));

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
        if id == "model" {
            for part in status_identity_parts(data, config.get("format"), force_fast) {
                pieces.push(Piece {
                    text: colorize(
                        &part,
                        colors.get("model").cloned().as_deref(),
                        color_enabled,
                    ),
                    joiner: None,
                });
            }
            continue;
        }
        let label = match compat::get(config.get("labels"), id) {
            Some(Value::Null) | None => default_label(id).to_string(),
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => compat::num_to_string(n.as_f64().unwrap_or(f64::NAN)),
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
        // Runtime is a suffix for the project segment: "repo node v24", not a
        // standalone pipe-delimited segment.
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
    let items = compat::get(config, "nativeStatusItems")
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
    let pkg = compat::get(data.get("project"), "package");

    let str_of =
        |v: Option<&Value>| -> String { v.and_then(|x| x.as_str()).unwrap_or("").to_string() };
    let or_q = |v: Option<&Value>| -> String {
        match v.filter(|x| compat::truthy(Some(x))) {
            Some(Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
            None => "?".to_string(),
        }
    };

    let git = data.get("git");
    let git_line = if compat::truthy(compat::get(git, "available")) {
        format!(
            "  git: {} | dirty {} ({})",
            str_of(compat::get(git, "header")),
            compat::num_to_string(compat::js_number(compat::get(git, "dirty"))),
            format_counts(compat::get(git, "counts"))
        )
    } else {
        "  git: unavailable".to_string()
    };

    let pkg_line = match compat::get(pkg, "name").filter(|n| compat::truthy(Some(n))) {
        Some(name) => {
            let name = name.as_str().unwrap_or("").to_string();
            match compat::get(pkg, "version").filter(|v| compat::truthy(Some(v))) {
                Some(version) => format!("{}@{}", name, version.as_str().unwrap_or("")),
                None => name,
            }
        }
        None => "none detected".to_string(),
    };

    let status_colors = match compat::get(config, "nativeStatusColors") {
        Some(Value::Null) | None => "?",
        Some(v) if compat::truthy(Some(v)) => "on",
        Some(_) => "off",
    };

    let codex_version = match data.get("codexVersion").filter(|v| compat::truthy(Some(v))) {
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
            or_q(compat::get(config, "model")),
            or_q(compat::get(config, "reasoning"))
        ),
        format!(
            "  sandbox: {} / approval {}",
            or_q(compat::get(config, "sandbox")),
            or_q(compat::get(config, "approval"))
        ),
        format!(
            "  status line: {} items, colors {}",
            compat::num_to_string(compat::js_number(compat::get(
                config,
                "nativeStatusItemCount"
            ))),
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
        format!("  repo: {}", or_q(compat::get(git, "root"))),
        format!("  package: {}", pkg_line),
        format!(
            "  AGENTS.md: {}",
            match compat::get(data.get("project"), "agentsPath").filter(|p| compat::truthy(Some(p)))
            {
                Some(p) => p.as_str().unwrap_or("").to_string(),
                None => "none detected".to_string(),
            }
        ),
        String::new(),
        "Hooks".to_string(),
        format!(
            "  events: {}",
            format_hook_events(compat::get(data.get("hooks"), "events"))
        ),
        format!("  file: {}", str_of(compat::get(data.get("hooks"), "path"))),
        String::new(),
        "Project Priority".to_string(),
        format!(
            "  {}",
            match compat::get(data.get("project"), "activePriority")
                .filter(|p| compat::truthy(Some(p)))
            {
                Some(p) => p.as_str().unwrap_or("").to_string(),
                None => "none detected".to_string(),
            }
        ),
        String::new(),
        "Limitations".to_string(),
        format!("  {}", str_of(compat::get(data.get("limits"), "note"))),
    ]
    .join("\n")
}

/// Port of emitHudWarnings(): first warning (collapsed) to stderr.
pub fn emit_hud_warnings(data: &Value) {
    let warnings = compat::get(data.get("hud"), "warnings").and_then(|w| w.as_array());
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn format_reasoning_effort_passes_max_through_verbatim() {
        // issue #30 guard: `max` has no alias — it must render literally in
        // both short and long modes and must never collapse to `xh`.
        let max = json!("max");
        assert_eq!(
            format_reasoning_effort(Some(&max), true),
            Some("max".to_string())
        );
        assert_eq!(
            format_reasoning_effort(Some(&max), false),
            Some("max".to_string())
        );
    }

    #[test]
    fn format_counts_reports_clean_for_missing_or_empty_counts() {
        assert_eq!(format_counts(None), "clean");
        assert_eq!(format_counts(Some(&json!({}))), "clean");
        assert_eq!(
            format_counts(Some(&json!({
                "modified": 0,
                "added": null,
                "deleted": false,
                "renamed": "",
                "untracked": 0,
                "other": 0
            }))),
            "clean"
        );
    }

    #[test]
    fn format_counts_preserves_segment_order_and_js_numeric_coercion() {
        assert_eq!(
            format_counts(Some(&json!({
                "modified": 2,
                "added": 0,
                "deleted": 1,
                "renamed": null,
                "untracked": "3",
                "other": false
            }))),
            "m:2 d:1 u:3"
        );
    }

    #[test]
    fn status_model_uses_compact_identity_by_default() {
        let data = json!({
            "config": {
                "model": "gpt-5.5",
                "reasoning": "x high"
            }
        });

        assert_eq!(status_model(&data), Some("5.5|xh".to_string()));
    }

    #[test]
    fn status_model_supports_full_identity_and_legacy_overrides() {
        let data = json!({
            "config": {
                "model": "gpt-5.5",
                "reasoning": "xhigh"
            }
        });
        let format = json!({
            "identityShort": true,
            "modelShort": false,
            "effortShort": true
        });

        assert_eq!(
            status_identity_parts(&data, Some(&format), false),
            vec!["gpt-5.5", "xh"]
        );
    }

    #[test]
    fn render_footer_expands_compact_identity_atoms() {
        let data = json!({
            "config": {
                "model": "gpt-5.5",
                "reasoning": "xhigh"
            },
            "project": {
                "package": {
                    "name": "codex-hud"
                }
            }
        });
        let mut config = hudcfg::default_config();
        config["segments"] = json!(["model", "project"]);
        config["format"]["fastMode"] = json!(true);

        assert_eq!(render_footer(&data, &config, false), "5.5|xh|f|codex-hud");
    }

    #[test]
    fn render_footer_expands_full_identity_atoms_from_service_tier() {
        let data = json!({
            "config": {
                "model": "gpt-5.5",
                "reasoning": "xhigh",
                "serviceTier": "fast"
            },
            "project": {
                "package": {
                    "name": "codex-hud"
                }
            }
        });
        let mut config = hudcfg::default_config();
        config["segments"] = json!(["model", "project"]);
        config["format"]["identityShort"] = json!(false);

        assert_eq!(
            render_footer(&data, &config, false),
            "gpt-5.5|xhigh|fast|codex-hud"
        );
    }

    #[test]
    fn render_footer_omits_default_tier_and_shortens_known_efforts() {
        let data = json!({
            "config": {
                "model": "gpt-5.6-sol",
                "reasoning": "high",
                "serviceTier": "default"
            }
        });
        let mut config = hudcfg::default_config();
        config["segments"] = json!(["model"]);

        assert_eq!(render_footer(&data, &config, false), "5.6-sol|h");
    }

    #[test]
    fn status_model_falls_back_to_codex_version_when_model_missing() {
        let data = json!({
            "codexVersion": "codex-cli 0.139.0",
            "config": {
                "reasoning": "medium"
            }
        });

        assert_eq!(status_model(&data), Some("codex-cli|m".to_string()));
    }
}
