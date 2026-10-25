#!/usr/bin/env bash
# Credential-free harness qualification steps inside the worker-harnesses
# image, run without a network; prints one "name: value" line per step.
set -uo pipefail

modules=/opt/harnesses/node_modules
listings=/tmp/qualify-listings
arch="$(node -p process.arch)"
claude="$modules/@anthropic-ai/claude-agent-sdk-linux-$arch/claude"
codex="$(find "$modules/@openai/codex-linux-$arch/vendor" -path '*/bin/codex' -type f)"
export HOME=/var/lib/taskelith/qualify-home
export CLAUDE_CONFIG_DIR="$HOME/claude" CODEX_HOME="$HOME/codex" DISABLE_TELEMETRY=1
unexpected=0

# Runs one step; another exit status, or output without PATTERN, fails it.
expect() {
  local name="$1" expected="$2" pattern="$3" output status
  shift 3
  output="$("$@" 2>&1)"
  status=$?
  if [ "$status" -ne "$expected" ] || ! grep -Eq -- "$pattern" <<< "$output"; then unexpected=1; fi
  printf '%s: exit %s (expected %s): %s\n' "$name" "$status" "$expected" \
    "$(printf '%s' "$output" | tr '\n' ' ')"
}

observe() {
  expect "$1" "$2" '' "${@:3}"
}

sha256_of() {
  local hash
  hash="$(sha256sum "$1" | cut -d' ' -f1)" || return 1
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] && echo "$hash"
}

# Lists entries with type, mode, and link target, then file hashes.
listing() {
  find "$@" -printf '%y %m %p -> %l\n' | sort
  find "$@" -type f -print0 | sort -z | xargs -0 -r sha256sum
}

fail_setup() {
  echo "setup: $1"
  exit 1
}

if [ ! -x "$claude" ] || [ -z "$codex" ] || [ ! -x "$codex" ]; then
  fail_setup "missing binaries: claude '$claude', codex '$codex'"
fi
mkdir -p "$CLAUDE_CONFIG_DIR" "$CODEX_HOME" "$listings" || fail_setup "directories"
printf 'check_for_update_on_startup = false\n' > "$CODEX_HOME/config.toml" || fail_setup "config.toml"
listing /opt/harnesses "$HOME" > "$listings/before.txt" && [ -s "$listings/before.txt" ] \
  || fail_setup "listing before"
observe environment 0 sh -c \
  'env | grep -E "^(PATH|HOME|CLAUDE_CONFIG_DIR|CODEX_HOME|DISABLE_AUTOUPDATER|DISABLE_TELEMETRY)=" | sort'
observe environment-names 0 sh -c 'env | cut -d= -f1 | sort'
expect secret-like-names-absent 1 '' sh -c 'env | cut -d= -f1 | grep -E "KEY|TOKEN|SECRET"'
observe platform 0 uname -sm
observe os 0 sh -c '. /etc/os-release && echo "$PRETTY_NAME"'
observe node 0 node --version
observe user 0 id -un
observe claude-path 0 echo "${claude#"$modules/"}"
observe claude-sha256 0 sha256_of "$claude"
observe claude-version 0 "$claude" --version
observe claude-musl-package-absent 0 test ! -e "$modules/@anthropic-ai/claude-agent-sdk-linux-$arch-musl"
expect claude-auth-status 1 '"loggedIn": false' "$claude" auth status
observe codex-path 0 echo "${codex#"$modules/"}"
observe codex-sha256 0 sha256_of "$codex"
observe codex-version 0 "$codex" --version
expect codex-login-status 1 '^Not logged in' "$codex" login status
observe codex-schema 0 "$codex" app-server generate-json-schema --out "$HOME/schema"
observe codex-schema-files 0 bash -c \
  "count=\$(find '$HOME/schema' -type f | wc -l); echo \"\$count\"; test \"\$count\" -gt 0"
observe codex-schema-sha256 0 bash -o pipefail -c \
  "cd '$HOME/schema' && find . -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1"
expect claude-write-refused 1 'Permission denied' touch "$claude"
expect codex-write-refused 1 'Permission denied' touch "$codex"
listing /opt/harnesses "$HOME" > "$listings/after.txt" && [ -s "$listings/after.txt" ] \
  || fail_setup "listing after"
observe harness-tree-unchanged 0 diff <(grep ' /opt/harnesses' "$listings/before.txt") \
  <(grep ' /opt/harnesses' "$listings/after.txt")
exit "$unexpected"
