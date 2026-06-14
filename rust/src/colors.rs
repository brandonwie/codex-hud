use crate::compat;
use serde_json::Value;
use std::collections::HashMap;

pub const RESET: &str = "\x1b[0m";

/// Named palette — byte-identical to the JS COLORS map.
fn palette(name: &str) -> Option<&'static str> {
    match name {
        "dim" => Some("\x1b[38;5;245m"),
        "coral" => Some("\x1b[38;5;203m"),
        "mint" => Some("\x1b[38;5;85m"),
        "amber" => Some("\x1b[38;5;215m"),
        "cyan" => Some("\x1b[38;5;45m"),
        "violet" => Some("\x1b[38;5;135m"),
        "neonViolet" => Some("\x1b[38;5;135m"),
        _ => None,
    }
}

pub fn dim() -> String {
    palette("dim").unwrap().to_string()
}

/// Port of resolveColor(): palette name | 0-255 index | "#rrggbb" hex -> ANSI
/// fg sequence; anything else -> fallback.
pub fn resolve_color(input: Option<&Value>, fallback: Option<String>) -> Option<String> {
    let input = match input {
        None | Some(Value::Null) => return fallback,
        Some(v) => v,
    };
    if let Value::String(s) = input {
        if let Some(seq) = palette(s) {
            return Some(seq.to_string());
        }
    }
    let numeric_string = matches!(input, Value::String(s)
        if (1..=3).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit()));
    if input.is_number() || numeric_string {
        let n = compat::js_number(Some(input));
        if n.is_finite() && n == n.trunc() && (0.0..=255.0).contains(&n) {
            return Some(format!("\x1b[38;5;{}m", n as i64));
        }
        return fallback;
    }
    if let Value::String(s) = input {
        let hex = s.strip_prefix('#').unwrap_or(s);
        if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            let r = u8::from_str_radix(&hex[0..2], 16).expect("guarded: 6 ascii hex digits");
            let g = u8::from_str_radix(&hex[2..4], 16).expect("guarded: 6 ascii hex digits");
            let b = u8::from_str_radix(&hex[4..6], 16).expect("guarded: 6 ascii hex digits");
            return Some(format!("\x1b[38;5;{}m", nearest_xterm256(r, g, b)));
        }
    }
    fallback
}

/// Port of nearestXterm256(): 6x6x6 cube vs 24-step grayscale ramp.
pub fn nearest_xterm256(r: u8, g: u8, b: u8) -> i64 {
    const STEPS: [i64; 6] = [0, 95, 135, 175, 215, 255];
    let nearest_step = |v: i64| -> usize {
        let mut best = 0;
        let mut best_dist = i64::MAX;
        for (i, step) in STEPS.iter().enumerate() {
            let d = (step - v).abs();
            if d < best_dist {
                best_dist = d;
                best = i;
            }
        }
        best
    };
    let (r, g, b) = (r as i64, g as i64, b as i64);
    let (ri, gi, bi) = (nearest_step(r), nearest_step(g), nearest_step(b));
    let cube_idx = 16 + 36 * ri as i64 + 6 * gi as i64 + bi as i64;
    let cube = [STEPS[ri], STEPS[gi], STEPS[bi]];

    let gray = compat::js_round((r + g + b) as f64 / 3.0) as i64;
    let gray_level = (compat::js_round((gray - 8) as f64 / 10.0) as i64).clamp(0, 23);
    let gray_val = 8 + gray_level * 10;
    let gray_idx = 232 + gray_level;

    let dist = |a: [i64; 3], c: [i64; 3]| -> i64 {
        (a[0] - c[0]).pow(2) + (a[1] - c[1]).pow(2) + (a[2] - c[2]).pow(2)
    };
    if dist(cube, [r, g, b]) <= dist([gray_val, gray_val, gray_val], [r, g, b]) {
        cube_idx
    } else {
        gray_idx
    }
}

/// Port of colorize(): wrap text iff color enabled AND a color is present.
pub fn colorize(text: &str, color: Option<&str>, color_enabled: bool) -> String {
    match color {
        Some(c) if color_enabled && !c.is_empty() => format!("{}{}{}", c, text, RESET),
        _ => text.to_string(),
    }
}

/// Port of resolveColorSet(): resolve every config.colors value once (fallback dim).
pub fn resolve_color_set(colors_cfg: &Value) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Value::Object(map) = colors_cfg {
        for (key, value) in map {
            if let Some(seq) = resolve_color(Some(value), Some(dim())) {
                out.insert(key.clone(), seq);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn resolve_color_rejects_invalid_hex_without_panic() {
        let fallback = Some("fallback".to_string());

        assert_eq!(
            resolve_color(Some(&json!("#12xz34")), fallback.clone()),
            fallback
        );
        assert_eq!(
            resolve_color(Some(&json!("#12345")), Some("fallback".to_string())),
            Some("fallback".to_string())
        );
        assert_eq!(
            resolve_color(Some(&json!("not-a-color")), Some("fallback".to_string())),
            Some("fallback".to_string())
        );
    }

    #[test]
    fn resolve_color_accepts_palette_numeric_and_hex_inputs() {
        assert_eq!(
            resolve_color(Some(&json!("mint")), None),
            palette("mint").map(str::to_string)
        );
        assert_eq!(
            resolve_color(Some(&json!("45")), None),
            Some("\x1b[38;5;45m".to_string())
        );
        assert_eq!(
            resolve_color(Some(&json!(203)), None),
            Some("\x1b[38;5;203m".to_string())
        );
        assert_eq!(
            resolve_color(Some(&json!("#5fafff")), None),
            Some(format!("\x1b[38;5;{}m", nearest_xterm256(0x5f, 0xaf, 0xff)))
        );
    }

    #[test]
    fn colorize_wraps_only_when_enabled_and_color_present() {
        assert_eq!(
            colorize("text", Some("\x1b[38;5;45m"), true),
            "\x1b[38;5;45mtext\x1b[0m"
        );
        assert_eq!(colorize("text", Some("\x1b[38;5;45m"), false), "text");
        assert_eq!(colorize("text", None, true), "text");
    }
}
