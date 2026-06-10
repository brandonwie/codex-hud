use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const DEFAULT_TIMEOUT_MS: u64 = 1200;

/// Port of run(): spawn, capture stdout, kill on timeout. Returns None on
/// spawn error / non-zero exit / timeout, else trimmed stdout.
pub fn run(command: &str, args: &[&str], cwd: Option<&Path>, timeout_ms: u64) -> Option<String> {
    let mut cmd = Command::new(command);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = cmd.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if start.elapsed() >= Duration::from_millis(timeout_ms) {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = reader.join();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return None,
        }
    };
    let out = reader.join().ok()?;
    if !status.success() {
        return None;
    }
    Some(out.trim().to_string())
}

pub fn read_text(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// Port of findUp(): walk parents from startDir looking for fileName.
pub fn find_up(start_dir: &Path, file_name: &str) -> Option<PathBuf> {
    let mut current = absolute(start_dir);
    loop {
        let candidate = current.join(file_name);
        if candidate.exists() {
            return Some(candidate);
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return None,
        }
    }
}

/// Port of findProjectFile(): walk up from cwd for <dir>/<...relParts>,
/// stopping at git root / fs root and skipping $HOME.
pub fn find_project_file(
    cwd: &Path,
    git_root: Option<&Path>,
    rel_parts: &[&str],
) -> Option<PathBuf> {
    let mut current = absolute(cwd);
    let home = absolute(&home_dir());
    let stop_at = match git_root {
        Some(root) => absolute(root),
        None => fs_root_of(&current),
    };
    loop {
        let mut candidate = current.clone();
        for part in rel_parts {
            candidate = candidate.join(part);
        }
        if current != home && candidate.exists() {
            return Some(candidate);
        }
        if current == stop_at {
            return None;
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return None,
        }
    }
}

pub fn fs_root_of(path: &Path) -> PathBuf {
    let mut root = path.to_path_buf();
    while let Some(parent) = root.parent() {
        root = parent.to_path_buf();
    }
    root
}

/// path.resolve equivalent: absolute without resolving symlinks.
pub fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

pub fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let var = std::env::var("USERPROFILE");
    #[cfg(not(windows))]
    let var = std::env::var("HOME");
    PathBuf::from(var.unwrap_or_default())
}

/// Port of nowMs() honoring the CODEX_HUD_NOW_MS test pin.
pub fn now_ms() -> f64 {
    if let Ok(raw) = std::env::var("CODEX_HUD_NOW_MS") {
        let t = raw.trim();
        let parsed = if t.is_empty() {
            0.0
        } else {
            t.parse::<f64>().unwrap_or(f64::NAN)
        };
        if parsed.is_finite() && parsed > 0.0 {
            return parsed;
        }
    }
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/// new Date().toISOString() equivalent (UTC, millisecond precision).
pub fn iso_utc(ms: f64) -> String {
    let total_ms = ms as i64;
    let millis = total_ms.rem_euclid(1000);
    let secs = total_ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let day_secs = secs.rem_euclid(86_400);
    let (h, m, s) = (day_secs / 3600, (day_secs % 3600) / 60, day_secs % 60);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, h, m, s, millis
    )
}

// Howard Hinnant's civil_from_days algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
