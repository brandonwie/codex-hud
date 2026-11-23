#!/bin/sh
set -u

# CDPATH would let the relative cd enter another checkout.
unset CDPATH
cd "$(dirname "$0")/.." || exit 1

: "${CARGO_BUILD_JOBS:=4}"
export CARGO_BUILD_JOBS

failed=""

run() {
  name=$1
  shift
  printf '\n==> %s\n' "$name"
  start=$(date +%s)
  if "$@"; then
    status=ok
  else
    status=FAILED
    failed="$failed
  - $name"
  fi
  printf '==> %s: %s (%ss)\n' "$name" "$status" "$(($(date +%s) - start))"
}

run "Format (Rust)" cargo fmt --manifest-path rust/Cargo.toml -- --check
run "Lint (Rust)" cargo clippy --manifest-path rust/Cargo.toml -- -D warnings
run "Test" npm test
run "Test (Rust)" npm run test:rust

if [ -n "$failed" ]; then
  printf '\nci-local: failed checks:%s\n' "$failed" >&2
  exit 1
fi
printf '\nci-local: all checks passed on %s\n' "$(uname -sm)"
