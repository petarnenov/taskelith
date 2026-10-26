#!/usr/bin/env bash
# Re-archive flow on two parallel edits of one requirement; usage:
# rearchive-demo.sh <path to the pinned openspec binary>
set -eu
OPENSPEC="$1"
root="$(mktemp -d "${TMPDIR:-/tmp}/rearchive-demo-XXXXXX")"
trap 'rm -rf "$root"' EXIT
export OPENSPEC_TELEMETRY=0 DO_NOT_TRACK=1 OPENSPEC_NO_UPDATE_CHECK=1
cd "$root"
g() { git -c user.name=Demo -c user.email=demo@example.invalid -c core.hooksPath=/dev/null -c commit.gpgsign=false "$@"; }
os() { "$OPENSPEC" "$@" >/dev/null; }

requirement() {
  printf '### Requirement: Demo rule\nThe system SHALL %s.\n\n#### Scenario: Demo\n- **WHEN** it runs\n- **THEN** it works\n' "$1"
}
living() {
  printf '# demo Specification\n\n## Purpose\nA demonstration capability for the re-archive flow of the protocol.\n\n## Requirements\n\n'
  requirement "$1"
}
change() {
  local name="$1" text="$2" dir="openspec/changes/$1"
  mkdir -p "$dir/specs/demo"
  printf 'schema: spec-driven\ncreated: 2026-10-26\n' > "$dir/.openspec.yaml"
  printf '## Why\n\nDemonstration change %s for the re-archive flow of the protocol.\n\n## What Changes\n\n- Demo rule.\n' "$name" > "$dir/proposal.md"
  printf '## 1. Demo\n\n- [x] 1.1 Edit the demo rule.\n' > "$dir/tasks.md"
  { printf '## MODIFIED Requirements\n\n'; requirement "$text"; } > "$dir/specs/demo/spec.md"
}
archive() { os archive "$1" --yes; g add -A; g commit -qm "archive $1"; }
rule() { grep 'SHALL' openspec/specs/demo/spec.md; }

g init -q -b dev
mkdir -p openspec/specs/demo openspec/changes/archive
printf 'schema: spec-driven\n' > openspec/config.yaml
living "log each run" > openspec/specs/demo/spec.md
touch openspec/changes/archive/.keep
g add -A; g commit -qm base

g switch -qc task
change task-edit "log each run with its duration"
g add -A; g commit -qm "task change"
archive task-edit
archive_commit="$(g rev-parse HEAD)"

g switch -q dev
change dev-edit "log each run and its exit status"
g add -A; g commit -qm "dev change"
archive dev-edit

g switch -q task
echo "1. Merge of dev into the archived task branch:"
g merge -q --no-edit dev >/dev/null 2>&1 && echo "   clean" || { echo "   conflict in: $(g diff --name-only --diff-filter=U | tr '\n' ' ')"; g merge --abort; }

g revert --no-commit "$archive_commit"; g commit -qm "restore the active task change"
g merge -q --no-edit dev
echo "2. After revert and merge, living rule: $(rule)"
restored="$(g rev-parse HEAD)"

archive task-edit
echo "3. Naive re-archive, living rule: $(rule)"
echo "   git diff dev -- openspec/specs:"; g diff dev -- openspec/specs | grep '^[-+]The' | sed 's/^/     /'

g reset -q --hard "$restored"
change task-edit "log each run with its duration and its exit status"
g add -A; g commit -qm "reconcile the task delta with dev"
archive task-edit
echo "4. Reconciled re-archive, living rule: $(rule)"
echo "   git diff dev -- openspec/specs:"; g diff dev -- openspec/specs | grep '^[-+]The' | sed 's/^/     /'
os validate --all --strict && echo "   validate --all --strict: passed"
