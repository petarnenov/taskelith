#!/usr/bin/env bash
# Runs a command with the Node.js version in .nvmrc, for this run only; the
# calling shell keeps its own Node.js until `nvm use`.
# Usage: with-pinned-node.sh <install|use> <command> [args...]
#   install (make setup): installs the pinned version through nvm if missing
#     (nvm install looks the version up online even when it is installed) and
#     makes it nvm's default, so that new shells start with it.
#   use (make doctor, make verify): switches to the pinned version when nvm
#     has it; otherwise the shell's Node.js stays, and the command reports the
#     mismatch.
set -eu

usage="usage: with-pinned-node.sh <install|use> <command> [args...]"
if [ $# -lt 2 ]; then
  echo "$usage" >&2
  exit 2
fi
mode="$1"
shift
: "${NODE_PIN:?NODE_PIN must be set; run this through make.}"

INVOKING_NODE="$(node -v 2>/dev/null || true)"
export INVOKING_NODE

nvm_script="${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh"

install_pinned_node() {
  set +eu
  . "$nvm_script" --no-use
  { nvm use --silent "$NODE_PIN" >/dev/null 2>&1 || nvm install "$NODE_PIN"; } && nvm alias default "$NODE_PIN"
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
  nvm use --silent "$NODE_PIN" >/dev/null 2>&1
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
    echo "$usage" >&2
    exit 2
    ;;
esac

exec "$@"
