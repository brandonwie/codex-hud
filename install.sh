#!/usr/bin/env bash
# codex-hud installer — https://github.com/brandonwie/codex-hud
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh | bash
#
# Audit before running (recommended):
#   curl -fsSLO https://raw.githubusercontent.com/brandonwie/codex-hud/main/install.sh
#   less install.sh && bash install.sh
#
# This builds the codex-hud renderer from source, so it needs `git`, `node`,
# `cargo`, and a working `codex` on your PATH. It installs the stock-delegation
# launcher and registers the plugin. It does NOT replace your default `codex`
# command unless you opt in:
#   curl -fsSL .../install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash
#
# Everything lives in functions and main runs last, so a truncated download
# fails to parse instead of half-executing.

set -euo pipefail

# --- configuration (env overrides; flags below map to these) -----------------
REPO="${CODEX_HUD_REPO:-https://github.com/brandonwie/codex-hud.git}"
SRC="${CODEX_HUD_SRC:-${XDG_DATA_HOME:-$HOME/.local/share}/codex-hud/src}"
PLUGIN_NAME="brandonwie@codex-hud"

# --- output helpers ----------------------------------------------------------
if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BLUE=$'\033[1;34m'; C_YELLOW=$'\033[1;33m'
  C_RED=$'\033[1;31m'; C_GREEN=$'\033[1;32m'
else
  C_RESET=''; C_BLUE=''; C_YELLOW=''; C_RED=''; C_GREEN=''
fi
info()    { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
warn()    { printf '%swarn:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
error()   { printf '%serror:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
success() { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
err()     { error "$*"; exit 1; }

usage() {
  cat <<'EOF'
codex-hud installer

Usage:
  curl -fsSL .../install.sh | bash                       # default install
  curl -fsSL .../install.sh | CODEX_HUD_MAKE_DEFAULT=1 bash
  bash install.sh [flags]                                # when run from a file

Flags (each maps to a CODEX_HUD_* env var):
  --ref <tag|branch>   pin to a ref            (CODEX_HUD_REF; default: latest release tag)
  --src <dir>          source checkout dir     (CODEX_HUD_SRC)
  --prefix <dir>       launcher/renderer dir   (CODEX_HUD_PREFIX; default ~/.local/bin)
  --make-default       make `codex` resolve to the HUD launcher (CODEX_HUD_MAKE_DEFAULT=1)
  --force-shim         replace a foreign ~/.local/bin/codex (CODEX_HUD_FORCE_SHIM=1)
  --skip-plugin        do not run `codex plugin` registration (CODEX_HUD_SKIP_PLUGIN=1)
  --dry-run            resolve the ref and print the plan, then exit (CODEX_HUD_DRY_RUN=1)
  -h, --help           show this help
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --ref)          CODEX_HUD_REF="${2:?--ref needs a value}"; shift 2 ;;
      --ref=*)        CODEX_HUD_REF="${1#*=}"; shift ;;
      --src)          SRC="${2:?--src needs a value}"; shift 2 ;;
      --src=*)        SRC="${1#*=}"; shift ;;
      --prefix)       CODEX_HUD_PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
      --prefix=*)     CODEX_HUD_PREFIX="${1#*=}"; shift ;;
      --make-default) CODEX_HUD_MAKE_DEFAULT=1; shift ;;
      --force-shim)   CODEX_HUD_FORCE_SHIM=1; shift ;;
      --skip-plugin)  CODEX_HUD_SKIP_PLUGIN=1; shift ;;
      --dry-run)      CODEX_HUD_DRY_RUN=1; shift ;;
      -h|--help)      usage; exit 0 ;;
      *)              err "unknown argument: $1 (try --help)" ;;
    esac
  done
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "missing required command: $1${2:+ — $2}"
}

check_prereqs() {
  need_cmd git
  need_cmd node "install Node.js — https://nodejs.org"
  need_cmd cargo "install the Rust toolchain — https://rustup.rs (needed to build the renderer)"
  need_cmd codex "install the OpenAI Codex CLI first — codex-hud augments an existing Codex"
}

# Resolve the ref to install: explicit override, else the highest vX.Y.Z tag,
# else fall back to the default branch.
resolve_ref() {
  if [ -n "${CODEX_HUD_REF:-}" ]; then
    printf '%s' "$CODEX_HUD_REF"
    return 0
  fi
  local tag
  tag="$(git ls-remote --tags --refs "$REPO" 2>/dev/null \
    | awk -F/ '{print $NF}' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V | tail -n1)" || true
  if [ -n "$tag" ]; then
    printf '%s' "$tag"
  else
    warn "no release tags found; falling back to 'main'"
    printf 'main'
  fi
}

fetch_source() {
  local ref="$1"
  if [ -d "$SRC/.git" ]; then
    info "Updating existing checkout at $SRC"
    git -C "$SRC" remote set-url origin "$REPO"
    git -C "$SRC" fetch --tags --force --depth 1 origin "$ref" || err "git fetch of $ref failed"
    git -C "$SRC" checkout -q --detach FETCH_HEAD || err "git checkout of $ref failed"
  elif [ -e "$SRC" ] && [ -n "$(ls -A "$SRC" 2>/dev/null)" ]; then
    err "$SRC exists and is not a codex-hud checkout. Remove it or set CODEX_HUD_SRC to an empty path."
  else
    info "Cloning $REPO@$ref -> $SRC"
    mkdir -p "$(dirname "$SRC")"
    git clone --quiet --depth 1 --branch "$ref" "$REPO" "$SRC" \
      || err "git clone of $ref failed"
  fi
}

build_renderer() {
  info "Building the codex-hud renderer (cargo build --release)…"
  cargo build --release --manifest-path "$SRC/rust/Cargo.toml" \
    || err "cargo build failed — see the output above"
  [ -x "$SRC/rust/target/release/codex-hud" ] \
    || err "renderer binary missing after build ($SRC/rust/target/release/codex-hud)"
  success "renderer built"
}

install_launcher() {
  local args
  args=(--mode stock)
  [ -n "${CODEX_HUD_PREFIX:-}" ] && args+=(--prefix "$CODEX_HUD_PREFIX")
  if [ "${CODEX_HUD_MAKE_DEFAULT:-0}" = "1" ]; then
    args+=(--make-default)
    [ "${CODEX_HUD_FORCE_SHIM:-0}" = "1" ] && args+=(--force-shim)
  fi
  info "Installing the stock-delegation launcher…"
  node "$SRC/scripts/install-patched-codex.js" "${args[@]}" \
    || err "launcher install failed"
  success "launcher installed"
}

register_plugin() {
  if [ "${CODEX_HUD_SKIP_PLUGIN:-0}" = "1" ]; then
    info "Skipping plugin registration (CODEX_HUD_SKIP_PLUGIN=1)"
    return 0
  fi
  info "Registering the Codex plugin…"
  if ! codex plugin marketplace add "$SRC"; then
    warn "could not add the local marketplace (already registered?) — if this is a fresh install, run: codex plugin marketplace add \"$SRC\""
  fi
  if ! codex plugin add "$PLUGIN_NAME"; then
    warn "could not add the plugin (already added?) — if this is a fresh install, run: codex plugin add $PLUGIN_NAME"
  fi
}

print_plan() {
  local ref="$1"
  info "DRY RUN — nothing will be changed"
  printf '  repo:          %s\n' "$REPO"
  printf '  ref:           %s\n' "$ref"
  printf '  source dir:    %s\n' "$SRC"
  printf '  prefix:        %s\n' "${CODEX_HUD_PREFIX:-~/.local/bin (installer default)}"
  printf '  make default:  %s\n' "$([ "${CODEX_HUD_MAKE_DEFAULT:-0}" = "1" ] && echo yes || echo 'no (opt in with CODEX_HUD_MAKE_DEFAULT=1)')"
  printf '\nWould run:\n'
  printf '  git clone --depth 1 --branch %s %s %s\n' "$ref" "$REPO" "$SRC"
  printf '  cargo build --release --manifest-path %s/rust/Cargo.toml\n' "$SRC"
  printf '  node %s/scripts/install-patched-codex.js --mode stock%s\n' "$SRC" \
    "$([ "${CODEX_HUD_MAKE_DEFAULT:-0}" = "1" ] && echo ' --make-default')"
  printf '  codex plugin marketplace add %s\n' "$SRC"
  printf '  codex plugin add %s\n' "$PLUGIN_NAME"
}

print_success() {
  printf '\n'
  success "codex-hud installed from $SRC"
  printf '\nNext steps:\n'
  printf '  • Start a new Codex thread so the refreshed plugin/skill list loads.\n'
  printf '  • Diagnose the launch chain:  node %s/scripts/install-patched-codex.js --doctor\n' "$SRC"
  if [ "${CODEX_HUD_MAKE_DEFAULT:-0}" != "1" ]; then
    printf '  • `codex` is unchanged. To make it resolve to the HUD launcher, re-run with\n'
    printf '    CODEX_HUD_MAKE_DEFAULT=1 (the launcher lives at ~/.local/bin/codex-hud-tui).\n'
  fi
  printf '\nThe stock launcher delegates to your real Codex; the in-TUI footer is the\n'
  printf 'experimental patched mode — see the README "Patched Codex Footer" section.\n'
}

main() {
  parse_args "$@"
  info "codex-hud installer"
  local ref
  # A dry run is previewable without the build toolchain installed, so resolve
  # the ref (best effort) and print the plan before the hard prereq check.
  if [ "${CODEX_HUD_DRY_RUN:-0}" = "1" ]; then
    ref="$(resolve_ref)"
    print_plan "$ref"
    exit 0
  fi
  check_prereqs
  ref="$(resolve_ref)"
  info "Target ref: $ref"
  fetch_source "$ref"
  build_renderer
  install_launcher
  register_plugin
  print_success
}

main "$@"
