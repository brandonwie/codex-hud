//! JS-semantics helpers. The Node renderer is the parity oracle, so every
//! numeric/string coercion here mirrors the exact JS builtin it replaces.

use serde_json::Value;

/// JS truthiness for a JSON value ("" / 0 / null / NaN are falsy; {} / [] truthy).
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_)) | Some(Value::Object(_)) => true,
    }
}

/// JS `Number(value)` for the value shapes this codebase feeds it.
/// `None` represents JS `undefined` (-> NaN). Objects/arrays -> NaN (close enough
/// for this data; the oracle never feeds arrays to Number()).
pub fn js_number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                0.0
            } else if let Some(n) = parse_prefixed_integer(t) {
                n
            } else {
                t.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
        Some(_) => f64::NAN,
    }
}

fn parse_prefixed_integer(text: &str) -> Option<f64> {
    let (digits, radix) = [
        ("0x", 16),
        ("0X", 16),
        ("0b", 2),
        ("0B", 2),
        ("0o", 8),
        ("0O", 8),
    ]
    .iter()
    .find_map(|(prefix, radix)| text.strip_prefix(prefix).map(|digits| (digits, *radix)))?;
    if digits.is_empty() {
        return None;
    }
    let mut out = 0.0;
    for ch in digits.chars() {
        let digit = ch.to_digit(radix)?;
        out = out * radix as f64 + digit as f64;
    }
    Some(out)
}

/// JS `Number.isFinite(value)` (NO coercion: only actual numbers pass).
pub fn as_finite_number(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(n)) => n.as_f64().filter(|f| f.is_finite()),
        _ => None,
    }
}

/// JS `Math.round(x)`: half-up toward +Infinity.
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// JS number-to-string for the magnitudes this HUD prints (integers lose the
/// decimal point: 75.0 -> "75"; 75.5 -> "75.5").
pub fn num_to_string(x: f64) -> String {
    if x == x.trunc() && x.abs() < 1e15 {
        format!("{}", x as i64)
    } else {
        format!("{}", x)
    }
}

/// JS `x.toFixed(1)` for the non-negative values this HUD formats.
pub fn to_fixed1(x: f64) -> String {
    let r = js_round(x * 10.0) as i64;
    format!("{}.{}", r / 10, (r % 10).abs())
}

/// JSON-number Value from an f64, preferring integer representation when exact
/// (keeps `--json` output looking like the Node oracle's).
pub fn number_value(x: f64) -> Value {
    if x.is_finite() && x == x.trunc() && x.abs() < 9.007199254740992e15 {
        Value::from(x as i64)
    } else if x.is_finite() {
        Value::from(x)
    } else {
        Value::Null
    }
}

/// Object member access treating non-objects as `undefined` (JS `a && a.b` chains).
pub fn get<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    value.and_then(|v| v.get(key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_number_accepts_js_prefixed_integer_strings() {
        assert_eq!(js_number(Some(&Value::String("0x10".into()))), 16.0);
        assert_eq!(js_number(Some(&Value::String("0b11".into()))), 3.0);
        assert_eq!(js_number(Some(&Value::String("0o10".into()))), 8.0);
        assert_eq!(js_number(Some(&Value::String("  0Xf  ".into()))), 15.0);
        assert!(js_number(Some(&Value::String("0xffffffffffffffffffff".into()))) > u64::MAX as f64);
        assert!(js_number(Some(&Value::String("+0x10".into()))).is_nan());
    }
}
