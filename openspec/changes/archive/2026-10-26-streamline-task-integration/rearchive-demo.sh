#!/usr/bin/env bash
# Re-archive flow on two parallel edits of one requirement; usage:
# rearchive-demo.sh <path to the pinned openspec binary>
set -eu
OPENSPEC="$1"
export OPENSPEC_TELEMETRY=0 DO_NOT_TRACK=1 OPENSPEC_NO_UPDATE_CHECK=1
g() { git -c user.name=Demo -c user.email=demo@example.invalid -c core.hooksPath=/dev/null -c commit.gpgsign=false "$@"; }
os() { "$OPENSPEC" "$@" >/dev/null; }

requirement() {
  printf '### Requirement: Demo rule\nThe system SHALL %s.\n\n#### Scenario: Demo\n- **WHEN** it runs\n- **THEN** %s\n' "$1" "$2"
}
living() {
  printf '# demo Specification\n\n## Purpose\nA demonstration capability for the re-archive flow of the protocol.\n\n## Requirements\n\n'
  requirement "$1" "$2"
}
change() {
  local name="$1" dir="openspec/changes/$1"
  mkdir -p "$dir/specs/demo"
  printf 'schema: spec-driven\ncreated: 2026-10-26\n' > "$dir/.openspec.yaml"
  printf '## Why\n\nDemonstration change %s for the re-archive flow of the protocol.\n\n## What Changes\n\n- Demo rule.\n' "$name" > "$dir/proposal.md"
  printf '## 1. Demo\n\n- [x] 1.1 Edit the demo rule.\n' > "$dir/tasks.md"
  { printf '## MODIFIED Requirements\n\n'; requirement "$2" "$3"; } > "$dir/specs/demo/spec.md"
}
archive() { os archive "$1" --yes; g add -A; g commit -qm "archive $1"; }
show() { echo "   living rule: $(grep -h 'SHALL\|THEN' openspec/specs/demo/spec.md | tr '\n' ' ')"; }
# Usage: spec_diff <from> [<to>]; prints the changed spec lines.
spec_diff() {
  echo "   git diff $* -- openspec/specs:"
  local lines
  lines="$(g diff "$@" -- openspec/specs | grep -v '^\(---\|+++\) ' | grep '^[-+]' || true)"
  if [ -n "$lines" ]; then printf '%s\n' "$lines" | sed 's/^/     /'; else echo "     (empty)"; fi
}

# Usage: run_case <title> <task rule> <dev rule> <dev THEN> <reconciled rule>
run_case() {
  local root
  root="$(mktemp -d "${TMPDIR:-/tmp}/rearchive-demo-XXXXXX")"
  (
    cd "$root"
    echo "== $1"
    g init -q -b dev
    mkdir -p openspec/specs/demo openspec/changes/archive
    printf 'schema: spec-driven\n' > openspec/config.yaml
    living "log each run" "it works" > openspec/specs/demo/spec.md
    touch openspec/changes/archive/.keep
    g add -A; g commit -qm base

    g switch -qc task
    change task-edit "$2" "it works"
    g add -A; g commit -qm "task change"
    archive task-edit
    local archive_commit
    archive_commit="$(g rev-parse HEAD)"

    g switch -q dev
    change dev-edit "$3" "$4"
    g add -A; g commit -qm "dev change"
    archive dev-edit

    g switch -q task
    echo "1. Coordinator: git merge --no-commit --no-ff dev"
    if g merge -q --no-commit --no-ff dev >/dev/null 2>&1; then
      echo "   clean"; show
      g commit -qm "a committed merge, for the base check only"
      echo "   committed, dev's edits from merge-base HEAD dev, which is dev:"
      spec_diff "$(g merge-base HEAD dev)" dev
      echo "   dev's edits from the merge base of the archive commit and dev:"
      spec_diff "$(g merge-base "$archive_commit" dev)" dev
      g reset -q --hard "$archive_commit"
    else
      echo "   conflict in: $(g diff --name-only --diff-filter=U | tr '\n' ' ')"
      g merge --abort
    fi

    local base
    base="$(g merge-base "$archive_commit" dev)"
    g revert --no-commit "$archive_commit"; g commit -qm "restore the active task change"
    g merge -q --no-edit dev
    echo "2. Worker: revert the archive commit, merge dev"; show
    echo "   dev's edits since the base:"; spec_diff "$base" dev
    local restored
    restored="$(g rev-parse HEAD)"

    archive task-edit
    echo "3. Naive re-archive of the restored delta"; show; spec_diff dev

    g reset -q --hard "$restored"
    change task-edit "$5" "$4"
    g add -A; g commit -qm "reconcile the task delta with dev"
    archive task-edit
    echo "4. Reconciled re-archive"; show; spec_diff dev
    os validate --all --strict && echo "   validate --all --strict: passed"
  )
  rm -rf "$root"
}

run_case "Conflicting merge: both edit the rule line" \
  "log each run with its duration" "log each run and its exit status" "it works" \
  "log each run with its duration and its exit status"
run_case "Clean merge: dev edits the scenario of the same requirement" \
  "log each run with its duration" "log each run" "it records the run" \
  "log each run with its duration"
