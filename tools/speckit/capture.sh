#!/usr/bin/env bash
# Runs inside the taskelith-speckit image with --network none. Scaffolds a SpecKit project,
# runs the deterministic CLI, helper scripts, and workflow engine, and writes the scaffolded
# tree, the created feature directories, and a probe transcript to /out, with dates, timestamps,
# and workflow run identifiers normalized so that repeated captures are identical.
set -euo pipefail

readonly OUT=/out
readonly PROJECT=/tmp/demo
readonly TRANSCRIPT="$OUT/probes.md"
readonly SCRIPTS=.specify/scripts/bash
readonly PROBE_WORKFLOW=/tools/gate-probe.yml
readonly INTERACTIVE_PROBE_WORKFLOW=/tools/gate-probe-interactive.yml
TODAY="$(date +%Y-%m-%d)"
readonly TODAY
readonly NORMALIZE_TIME=(-e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+\+00:00/<timestamp>/g' -e "s/$TODAY/<date>/g")

# probe_in <directory> <title> <command>: runs the command with bash and records it, its output, and its exit code.
probe_in() {
  local directory="$1" title="$2" command="$3" status=0 output
  output="$(cd "$directory" && bash -o pipefail -c "$command" 2>&1 </dev/null)" || status=$?
  {
    printf '## %s\n\n```console\n$ %s\n%s\n```\n\n' "$title" "$command" "$output"
    printf 'Exit code: %s\n\n' "$status"
  } >>"$TRANSCRIPT"
}

probe() {
  probe_in "$PROJECT" "$@"
}

latest_run_id() {
  (cd "$PROJECT" && specify workflow status --json) |
    python -c 'import json, sys; print(max(json.load(sys.stdin)["runs"], key=lambda run: run["updated_at"])["run_id"])'
}

# copy_normalized <source directory> <target directory>: copies a tree with dates and timestamps normalized.
copy_normalized() {
  mkdir -p "$2"
  cp -R "$1/." "$2/"
  find "$2" -type f -exec sed -E -i "${NORMALIZE_TIME[@]}" {} +
}

# Replaces dates, timestamps, and the identifiers of the runs that the probes created.
normalize_transcript() {
  local run_ids=() run
  for run in "$PROJECT"/.specify/workflows/runs/*/; do
    run_ids+=(-e "s/$(basename "$run")/<run-id>/g")
  done
  sed -E -i "${NORMALIZE_TIME[@]}" "${run_ids[@]}" "$TRANSCRIPT"
}

probe_scaffold() {
  probe_in /tmp "Scaffold options" "specify init --help"
  probe_in /tmp "Scaffold a project" \
    "specify init demo --integration generic --integration-options='--commands-dir .agent/commands/' --script sh --non-interactive --ignore-agent-tools"
  copy_normalized "$PROJECT" "$OUT/scaffold"
  probe "Version" "pip show specify-cli | grep -E '^(Name|Version):'; python --version"
  probe "Scaffolded files" "find . -type f | LC_ALL=C sort"
}

probe_helper_scripts() {
  probe "Prerequisites without a feature" "bash $SCRIPTS/check-prerequisites.sh --json"
  probe "Create the first feature" "bash $SCRIPTS/create-new-feature.sh --json --short-name user-auth 'Add user authentication'"
  probe "Current feature pointer" "cat .specify/feature.json"
  probe "Prerequisites without a plan" "bash $SCRIPTS/check-prerequisites.sh --json"
  probe "Set up the plan" "bash $SCRIPTS/setup-plan.sh --json"
  probe "Prerequisites with a plan" "bash $SCRIPTS/check-prerequisites.sh --json"
  probe "Prerequisites requiring tasks" "bash $SCRIPTS/check-prerequisites.sh --json --require-tasks"
  probe "Set up tasks, output keys only" "bash $SCRIPTS/setup-tasks.sh --json | python -c 'import json, sys; print(sorted(json.load(sys.stdin)))'"
  probe "Feature files after setting up tasks" "ls specs/001-user-auth"
  probe "Create a second feature" "bash $SCRIPTS/create-new-feature.sh --json --short-name audit-log 'Add an audit log'"
  probe "Current feature pointer after the second feature" "cat .specify/feature.json"
  probe "Path resolution with an override" "SPECIFY_FEATURE_DIRECTORY=specs/001-user-auth bash $SCRIPTS/check-prerequisites.sh --json --paths-only"
  probe "Current feature pointer after path resolution" "cat .specify/feature.json"
  probe "Validation with an override" "SPECIFY_FEATURE_DIRECTORY=specs/001-user-auth bash $SCRIPTS/check-prerequisites.sh --json"
  probe "Current feature pointer after validation" "cat .specify/feature.json"
  probe "Empty plan" ": > specs/002-audit-log/plan.md; SPECIFY_FEATURE_DIRECTORY=specs/002-audit-log bash $SCRIPTS/check-prerequisites.sh --json"
  copy_normalized "$PROJECT/specs" "$OUT/features"
}

probe_workflow_engine() {
  local run_id
  probe "Installed workflows" "specify workflow list"
  probe "Bundled workflow" "specify workflow info speckit"
  probe "Run the bundled workflow without an agent CLI" "specify workflow run speckit -i 'spec=Add user authentication' --json"
  probe "Run the gate probe without a TTY" "specify workflow run $PROBE_WORKFLOW --json"
  run_id="$(latest_run_id)"
  probe "Resume without a verdict" "specify workflow resume $run_id --json"
  probe "Resume with an approving verdict" "specify workflow resume $run_id -i verdict=approve --json"
  probe "Resume a completed run" "specify workflow resume $run_id --json"
  probe "Run the gate probe again" "specify workflow run $PROBE_WORKFLOW --json"
  probe "Resume with a rejecting verdict" "specify workflow resume $(latest_run_id) -i verdict=reject --json"
  probe "Run with a verdict outside the options" "specify workflow run $PROBE_WORKFLOW -i verdict=maybe --json"
  probe "Run a gate without a verdict input" "specify workflow run $INTERACTIVE_PROBE_WORKFLOW --json"
  probe "Resume a gate without a verdict input, passing a verdict" "specify workflow resume $(latest_run_id) -i verdict=approve --json"
  probe "Run status, ordered by update time" \
    "specify workflow status --json | python -c 'import json, sys; print(json.dumps(sorted(json.load(sys.stdin)[\"runs\"], key=lambda run: run[\"updated_at\"]), indent=2))'"
  probe "Persisted run files" "find .specify/workflows/runs -type f | sed -E 's#runs/[^/]+/#runs/<run-id>/#' | LC_ALL=C sort | uniq -c"
}

main() {
  printf '# SpecKit probe transcript\n\nGenerated by `make speckit-capture` (`tools/speckit/capture.sh`); dates, timestamps, and workflow run identifiers are normalized.\n\n' >"$TRANSCRIPT"
  probe_scaffold
  probe_helper_scripts
  probe_workflow_engine
  normalize_transcript
}

main "$@"
