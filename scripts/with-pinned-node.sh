#!/usr/bin/env bash
# Runs a repository TypeScript script with the Node.js version in .nvmrc.
# When nvm is installed, the pinned version is installed if missing and used
# for this run only; the calling shell keeps its own Node.js until `nvm use`.
set -eu

INVOKING_NODE="$(node -v 2>/dev/null || true)"
export INVOKING_NODE

nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [ -s "$nvm_script" ]; then
  set +eu
  . "$nvm_script" --no-use
  nvm install
  nvm_status=$?
  set -eu
  if [ "$nvm_status" -ne 0 ]; then
    echo "make setup: 'nvm install' failed for the version in .nvmrc." >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "make setup: Node.js not found. Install nvm (https://github.com/nvm-sh/nvm), then run make setup again." >&2
  exit 1
fi

exec node --experimental-strip-types "$@"
