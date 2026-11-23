#!/bin/sh
# Runs one command in a project directory with the clean configuration of the
# hosted runner: no maintainer Cargo, npm or Git configuration applies, and of
# the Node settings only NODE_OPTIONS is removed (other variables, such as
# NODE_EXTRA_CA_CERTS, pass through; so does CARGO_BUILD_JOBS).
#
#   sh scripts/run-isolated.sh <state-dir> <project-dir> <command> [args...]
#
# ci-mac-gate.sh runs its toolchain probes and the PR's checks through this
# script. Cargo, npm, node and Git can print a configured value, such as a proxy
# URL with a user name and token, in their own errors, so the checks must not
# read the maintainer's configuration:
#   - HOME is an empty directory in <state-dir>: Cargo's libgit2 reads
#     http.proxy from ~/.gitconfig and ignores GIT_CONFIG_GLOBAL, and npm reads
#     ~/.npmrc. XDG_CONFIG_HOME is unset;
#   - CARGO_HOME is an empty directory in <state-dir>, every CARGO_* variable
#     except CARGO_BUILD_JOBS is unset, and so are RUSTC, RUSTC_WRAPPER,
#     RUSTC_WORKSPACE_WRAPPER, RUSTFLAGS, RUSTDOCFLAGS and RUSTUP_TOOLCHAIN;
#   - a Cargo config file above the project directory stops the run (Cargo reads
#     .cargo/config.toml in every parent of its working directory);
#   - npm reads empty user and global config files (two files: npm refuses to
#     load one file twice); every npm_config_* variable is unset, and the npm
#     cache stays the maintainer's ~/.npm (packages only);
#   - Git reads an empty global config, no system config and no system
#     attributes; every inherited GIT_* variable is unset first, among them the
#     command-level config (GIT_CONFIG_COUNT, GIT_CONFIG_KEY_<n>,
#     GIT_CONFIG_VALUE_<n>, GIT_CONFIG_PARAMETERS) and GIT_TEMPLATE_DIR;
#   - every variable whose name contains "proxy" in any case (http_proxy,
#     HTTPS_PROXY, ALL_PROXY, NO_PROXY, GIT_PROXY_COMMAND, ...) is unset, so no
#     tool uses a proxy or prints a proxy URL;
#   - NODE_OPTIONS is unset;
#   - the Rust toolchain and Node binaries are found before HOME changes and put
#     first in PATH, so version-manager shims (asdf keeps its data in HOME and
#     sets CARGO_HOME itself) do not run.
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
  for file in "$dir/.cargo/config" "$dir/.cargo/config.toml"; do
    if [ -e "$file" ]; then
      fail "Cargo would read $file, which is above the project directory; move the project or that file and rerun"
    fi
  done
done

: "${HOME:?}"
npm_cache=$HOME/.npm
jobs=${CARGO_BUILD_JOBS:-}
unset NODE_OPTIONS XDG_CONFIG_HOME RUSTC RUSTC_WRAPPER RUSTC_WORKSPACE_WRAPPER RUSTFLAGS RUSTDOCFLAGS RUSTUP_TOOLCHAIN
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

HOME=$state/home
CARGO_HOME=$state/cargo-home
GIT_CONFIG_GLOBAL=$state/gitconfig
GIT_CONFIG_NOSYSTEM=1
GIT_ATTR_NOSYSTEM=1
npm_config_userconfig=$state/npmrc-user
npm_config_globalconfig=$state/npmrc-global
npm_config_cache=$npm_cache
PATH=$sysroot/bin:$node_bin:$PATH
export HOME CARGO_HOME GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_ATTR_NOSYSTEM PATH
export npm_config_userconfig npm_config_globalconfig npm_config_cache
if [ -n "$jobs" ]; then
  CARGO_BUILD_JOBS=$jobs
  export CARGO_BUILD_JOBS
fi
exec "$@"
