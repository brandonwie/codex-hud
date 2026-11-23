#!/bin/sh
# Runs one command in a project directory with the clean configuration of the
# hosted runner: the command gets a new environment that holds only the
# variables listed below, so no maintainer Cargo, npm, Git, rustfmt or Clippy
# configuration and no other inherited variable reaches it.
#
#   sh scripts/run-isolated.sh <state-dir> <project-dir> <command> [args...]
#
# ci-mac-gate.sh runs its toolchain probes and the PR's checks through this
# script. Cargo, npm, node, Git, rustfmt and Clippy can print a configured
# value, such as a proxy URL with a user name and token, in their own errors,
# and an inherited variable can change what a check does (RUSTFMT selects
# another formatter) or print the environment (NODE_DEBUG), so the checks must
# not read the maintainer's configuration or environment. The command's
# environment holds:
#   - PATH, with the Rust toolchain and Node binaries first. Both are found
#     before HOME changes, so version-manager shims (asdf keeps its data in HOME
#     and sets CARGO_HOME itself) do not run;
#   - HOME, an empty directory in <state-dir>: Cargo's libgit2 reads http.proxy
#     from ~/.gitconfig and ignores GIT_CONFIG_GLOBAL, npm reads ~/.npmrc, and
#     rustfmt reads a global config from the home directory;
#   - CARGO_HOME, an empty directory in <state-dir>;
#   - GIT_CONFIG_GLOBAL, an empty file, GIT_CONFIG_NOSYSTEM=1 and
#     GIT_ATTR_NOSYSTEM=1: Git reads no global or system config and no system
#     attributes;
#   - npm_config_userconfig and npm_config_globalconfig, two empty files (npm
#     refuses to load one file twice), and npm_config_cache, the maintainer's
#     ~/.npm (packages only);
#   - CARGO_BUILD_JOBS, TMPDIR, LANG, LC_ALL, LC_CTYPE, TERM, USER and LOGNAME,
#     when set.
# Every other variable is gone: CARGO_*, RUSTC*, RUSTFLAGS, RUSTFMT,
# CLIPPY_CONF_DIR, npm_config_*, NODE_* (NODE_OPTIONS, NODE_DEBUG,
# NODE_EXTRA_CA_CERTS), GIT_* (GIT_CONFIG_COUNT, GIT_CONFIG_PARAMETERS,
# GIT_TEMPLATE_DIR), XDG_CONFIG_HOME, every variable whose name contains
# "proxy" in any case, and the rest.
# Cargo, rustfmt and Clippy also read config files in every parent of the
# project directory, so a .cargo/config, .cargo/config.toml, rustfmt.toml,
# .rustfmt.toml, clippy.toml or .clippy.toml above it stops the run.
# This script's own messages are fixed and never print a configured value.
set -u

fail() {
  echo "run-isolated: $*" >&2
  exit 1
}

[ "$#" -ge 3 ] || fail "usage: sh scripts/run-isolated.sh <state-dir> <project-dir> <command> [args...]"
state=$1
project=$2
shift 2
# CDPATH would let a relative project path enter another directory.
unset CDPATH

mkdir -p "$state" 2>/dev/null || fail "cannot create the state directory"
state=$(cd "$state" && pwd -P) || fail "cannot enter the state directory"
cd "$project" 2>/dev/null || fail "cannot enter the project directory"
project=$(pwd -P) || fail "cannot resolve the project directory"

dir=$project
while [ "$dir" != / ]; do
  dir=$(dirname "$dir")
  for file in "$dir/.cargo/config" "$dir/.cargo/config.toml" "$dir/rustfmt.toml" \
    "$dir/.rustfmt.toml" "$dir/clippy.toml" "$dir/.clippy.toml"; do
    if [ -e "$file" ]; then
      fail "Cargo, rustfmt or Clippy would read $file, which is above the project directory; move the project or that file and rerun"
    fi
  done
done

: "${HOME:?}"
npm_cache=$HOME/.npm
jobs=${CARGO_BUILD_JOBS:-}
# The discovery below runs rustc and node from the inherited PATH; clear the
# settings that change what they run or print first.
unset BASH_ENV ENV NODE_OPTIONS NODE_DEBUG XDG_CONFIG_HOME RUSTC RUSTC_WRAPPER RUSTC_WORKSPACE_WRAPPER RUSTFLAGS RUSTDOCFLAGS RUSTUP_TOOLCHAIN
for var in $(env | sed -n 's/^\(CARGO_[A-Za-z0-9_]*\)=.*/\1/p; s/^\([Nn][Pp][Mm]_[Cc][Oo][Nn][Ff][Ii][Gg]_[A-Za-z0-9_]*\)=.*/\1/p'); do
  unset "$var"
done
for var in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' |
  grep -i -e proxy -e '^GIT_'); do
  unset "$var"
done

sysroot=$(rustc --print sysroot 2>/dev/null) || fail "rustc --print sysroot failed; install Rust and rerun"
[ -x "$sysroot/bin/cargo" ] && [ -x "$sysroot/bin/rustc" ] ||
  fail "the Rust toolchain from rustc --print sysroot has no bin/cargo or bin/rustc"
node_bin=$(node -p 'require("path").dirname(process.execPath)' 2>/dev/null) || fail "node not found"
[ -x "$node_bin/node" ] && [ -x "$node_bin/npm" ] || fail "the node in PATH has no npm next to it"

mkdir -p "$state/home" "$state/cargo-home" 2>/dev/null || fail "cannot create the isolated home"
for file in gitconfig npmrc-user npmrc-global; do
  : >"$state/$file" || fail "cannot create the isolated config files"
done

# A new environment with the listed variables only.
exec env -i \
  "PATH=$sysroot/bin:$node_bin:$PATH" \
  "HOME=$state/home" \
  "CARGO_HOME=$state/cargo-home" \
  "GIT_CONFIG_GLOBAL=$state/gitconfig" \
  GIT_CONFIG_NOSYSTEM=1 \
  GIT_ATTR_NOSYSTEM=1 \
  "npm_config_userconfig=$state/npmrc-user" \
  "npm_config_globalconfig=$state/npmrc-global" \
  "npm_config_cache=$npm_cache" \
  ${jobs:+"CARGO_BUILD_JOBS=$jobs"} \
  ${TMPDIR+"TMPDIR=$TMPDIR"} \
  ${LANG+"LANG=$LANG"} \
  ${LC_ALL+"LC_ALL=$LC_ALL"} \
  ${LC_CTYPE+"LC_CTYPE=$LC_CTYPE"} \
  ${TERM+"TERM=$TERM"} \
  ${USER+"USER=$USER"} \
  ${LOGNAME+"LOGNAME=$LOGNAME"} \
  "$@"
