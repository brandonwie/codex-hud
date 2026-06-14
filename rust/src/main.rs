mod collect;
mod colors;
mod compat;
mod hudcfg;
mod render;
mod util;

use serde_json::{json, Value};
use std::io::BufRead;
use std::path::Path;

fn usage() -> String {
    format!(
        "codex-hud {}

Usage:
  codex-hud             Print a multiline Codex context HUD
  codex-hud --line      Print compact model, git, usage, and tokens
  codex-hud --line --color
                        Print compact usage with 256-color ANSI styling
  codex-hud --status-line
                        Alias for --line
  codex-hud --json      Print the same data as JSON
  codex-hud --watch 5   Refresh the text HUD every 5 seconds
  codex-hud --init-config
                        Write a starter codex-hud.toml in CODEX_HOME (--force to overwrite)
  codex-hud --print-config
                        Print the resolved, merged HUD config as JSON
  codex-hud --config-path
                        Show which codex-hud.toml files are in effect
  codex-hud --help      Show this help

Codex HUD complements Codex's native [tui].status_line.",
        collect::VERSION
    )
}

/// Port of --init-config: scaffold a commented codex-hud.toml into CODEX_HOME.
fn init_config(force: bool) -> i32 {
    let codex_home = hudcfg::resolve_codex_home();
    let target = codex_home.join(hudcfg::HUD_CONFIG_FILENAME);
    if std::fs::create_dir_all(&codex_home).is_err() {
        eprintln!(
            "codex-hud: failed to write {}: cannot create directory",
            target.display()
        );
        return 1;
    }
    if !force && target.exists() {
        eprintln!(
            "codex-hud: {} already exists (use --init-config --force to overwrite)",
            target.display()
        );
        return 1;
    }
    match std::fs::write(&target, hudcfg::CONFIG_SCAFFOLD) {
        Ok(()) => {
            println!("wrote {}", target.display());
            0
        }
        Err(err) => {
            eprintln!("codex-hud: failed to write {}: {}", target.display(), err);
            1
        }
    }
}

/// Port of --config-path: candidate files, highest precedence first.
fn print_config_path() {
    let codex_home = hudcfg::resolve_codex_home();
    let cwd = std::env::current_dir().unwrap_or_else(|_| ".".into());
    let git = collect::git_info(&cwd);
    let git_root = git
        .get("root")
        .and_then(|r| r.as_str())
        .map(std::path::PathBuf::from);
    let env_raw = std::env::var("CODEX_HUD_CONFIG")
        .ok()
        .filter(|v| !v.is_empty());

    let rows: Vec<(&str, Option<std::path::PathBuf>)> = vec![
        (
            "env     ($CODEX_HUD_CONFIG)",
            env_raw.map(|raw| util::absolute(Path::new(&raw))),
        ),
        (
            "project (./.codex)",
            util::find_project_file(
                &cwd,
                git_root.as_deref(),
                &[".codex", hudcfg::HUD_CONFIG_FILENAME],
            ),
        ),
        (
            "user    ($CODEX_HOME)",
            Some(codex_home.join(hudcfg::HUD_CONFIG_FILENAME)),
        ),
    ];
    println!("codex-hud config search (highest precedence first):");
    for (label, candidate) in rows {
        let status = match &candidate {
            Some(path) => {
                if path.exists() {
                    "found  "
                } else {
                    "absent "
                }
            }
            None => "unset  ",
        };
        let suffix = candidate
            .map(|p| format!("  {}", p.display()))
            .unwrap_or_default();
        println!("  {}{}{}", status, label, suffix);
    }
}

/// Port of --print-config: merged config + contributors + warnings as JSON.
fn print_merged_config() {
    let cwd = std::env::current_dir().unwrap_or_else(|_| ".".into());
    let git = collect::git_info(&cwd);
    let git_root = git
        .get("root")
        .and_then(|r| r.as_str())
        .map(std::path::PathBuf::from);
    let result = hudcfg::load_hud_config(&hudcfg::resolve_codex_home(), &cwd, git_root.as_deref());
    println!(
        "{}",
        serde_json::to_string_pretty(&result).unwrap_or_default()
    );
}

fn print_text() {
    let data = collect::collect();
    render::emit_hud_warnings(&data);
    println!("{}", render::format_text(&data));
}

fn print_line(color: bool) {
    let data = collect::collect();
    render::emit_hud_warnings(&data);
    println!("{}", render::format_usage_line(&data, color));
}

/// Port of parseWatchSeconds().
fn parse_watch_seconds(args: &[String]) -> Option<f64> {
    let index = args.iter().position(|a| a == "--watch")?;
    let parsed = match args.get(index + 1) {
        Some(raw) if !raw.is_empty() => raw.trim().parse::<f64>().unwrap_or(f64::NAN),
        _ => 5.0,
    };
    if !parsed.is_finite() || parsed <= 0.0 {
        return Some(5.0);
    }
    Some(parsed.max(1.0))
}

/// Hidden parity mode: read JSONL requests {"mode","color","data"} on stdin,
/// emit one JSON-encoded rendered string per line. Used by the golden harness.
fn render_json_batch() {
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(err) => {
                eprintln!("codex-hud: bad --render-json request: {}", err);
                std::process::exit(1);
            }
        };
        let data = request.get("data").cloned().unwrap_or(Value::Null);
        let color = compat::truthy(request.get("color"));
        let output = match request.get("mode").and_then(|m| m.as_str()) {
            Some("text") => render::format_text(&data),
            _ => render::format_usage_line(&data, color),
        };
        println!("{}", json!(output));
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let has = |flag: &str| args.iter().any(|a| a == flag);

    if has("--help") || has("-h") {
        println!("{}", usage());
        return;
    }
    if has("--render-json") {
        render_json_batch();
        return;
    }
    if has("--config-path") {
        print_config_path();
        return;
    }
    if has("--print-config") {
        print_merged_config();
        return;
    }
    if has("--init-config") {
        std::process::exit(init_config(has("--force")));
    }
    if has("--line") || has("--status-line") {
        print_line(has("--color") || has("--colors"));
        return;
    }
    if has("--json") {
        println!(
            "{}",
            serde_json::to_string_pretty(&collect::collect()).unwrap_or_default()
        );
        return;
    }
    if let Some(watch_seconds) = parse_watch_seconds(&args) {
        loop {
            print!("\x1Bc");
            print_text();
            println!(
                "\nRefreshing every {}s. Press Ctrl+C to stop.",
                compat::num_to_string(watch_seconds)
            );
            std::thread::sleep(std::time::Duration::from_secs_f64(watch_seconds));
        }
    }

    print_text();
}
