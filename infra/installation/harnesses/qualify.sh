#!/usr/bin/env bash
# Credential-free harness qualification steps inside the worker-harnesses
# image, run without a network; prints one "name: value" line per step.
set -uo pipefail

modules=/opt/harnesses/node_modules
arch="$(node -p process.arch)"
claude="$modules/@anthropic-ai/claude-agent-sdk-linux-$arch/claude"
codex="$(find "$modules/@openai/codex-linux-$arch/vendor" -path '*/bin/codex' -type f)"
export HOME=/var/lib/taskelith/qualify-home
export CLAUDE_CONFIG_DIR="$HOME/claude" CODEX_HOME="$HOME/codex" DISABLE_TELEMETRY=1

observe() {
  local name="$1" output status
  shift
  output="$("$@" 2>&1)"
  status=$?
  printf '%s: exit %s: %s\n' "$name" "$status" "$(printf '%s' "$output" | tr '\n' ' ')"
}

tree_hash() {
  find /opt/harnesses -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

mkdir -p "$CLAUDE_CONFIG_DIR" "$CODEX_HOME"
printf 'check_for_update_on_startup = false\n' > "$CODEX_HOME/config.toml"
before="$(tree_hash)"
observe platform uname -sm
observe os sh -c '. /etc/os-release && echo "$PRETTY_NAME"'
observe node node --version
observe user id -un
observe claude-path echo "${claude#"$modules/"}"
observe claude-sha256 sh -c "sha256sum '$claude' | cut -d' ' -f1"
observe claude-version "$claude" --version
observe claude-musl-package-absent test ! -e "$modules/@anthropic-ai/claude-agent-sdk-linux-$arch-musl"
observe claude-auth-status "$claude" auth status
observe codex-path echo "${codex#"$modules/"}"
observe codex-sha256 sh -c "sha256sum '$codex' | cut -d' ' -f1"
observe codex-version codex --version
observe codex-login-status codex login status
observe codex-schema codex app-server generate-json-schema --out "$HOME/schema"
observe codex-schema-sha256 sh -c \
  "cd '$HOME/schema' && find . -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1"
observe harness-write-refused sh -c "! touch '$claude' '$codex' 2>/dev/null"
observe harness-tree-sha256 echo "$before"
observe harness-tree-unchanged test "$before" = "$(tree_hash)"
