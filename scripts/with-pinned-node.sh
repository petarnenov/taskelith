#!/usr/bin/env bash
# Runs a command with the Node.js version in .nvmrc, for this run only; the
# calling shell keeps its own Node.js until `nvm use`.
# Usage: with-pinned-node.sh <install|use> <command> [args...]
#   install (make setup): installs the pinned version through nvm if missing
#     and makes it nvm's default, so that new shells start with it.
#   use (make doctor, make verify): switches to the pinned version when nvm
#     has it; otherwise the shell's Node.js stays, and the command reports the
#     mismatch.
set -eu

mode="$1"
shift
: "${NODE_PIN:?NODE_PIN must be set; run this through make.}"

INVOKING_NODE="$(node -v 2>/dev/null || true)"
export INVOKING_NODE

nvm_script="${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh"

install_pinned_node() {
  set +eu
  . "$nvm_script" --no-use
  nvm install && nvm alias default "$NODE_PIN"
  nvm_status=$?
  set -eu
  if [ "$nvm_status" -ne 0 ]; then
    echo "make setup: 'nvm install' or 'nvm alias default' failed for the version in .nvmrc." >&2
    exit 1
  fi
}

use_pinned_node() {
  set +eu
  . "$nvm_script" --no-use
  nvm use --silent >/dev/null 2>&1
  set -eu
}

case "$mode" in
  install)
    if [ -s "$nvm_script" ]; then install_pinned_node; fi
    ;;
  use)
    if [ "$INVOKING_NODE" != "v$NODE_PIN" ] && [ -s "$nvm_script" ]; then use_pinned_node; fi
    ;;
  *)
    echo "with-pinned-node.sh: unknown mode '$mode'; expected install or use." >&2
    exit 2
    ;;
esac

remedy="Install nvm (https://github.com/nvm-sh/nvm) and run make setup, or install Node.js $NODE_PIN yourself."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. $remedy" >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 6) ? 0 : 1)'; then
  echo "Node.js $(node -v) cannot run the repository scripts. $remedy" >&2
  exit 1
fi

exec "$@"
