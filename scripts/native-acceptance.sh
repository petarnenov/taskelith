#!/usr/bin/env bash
# Runs the G2 native acceptance proofs of this host's matrix entries (item
# 25b) and records each; usage: native-acceptance.sh RESULTS_FILE
set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
make_command="${MAKE:-make}"
services="${SERVICES:-taskelith-acceptance}"
supervisor_suites='packages/adapters/worker-supervisor/test/*.test.ts'
journal_suites='packages/adapters/worker-journal/test/*.test.ts packages/adapters/data-root/test/*.test.ts'
connectivity_suites='apps/worker/test/offline-launch.test.ts apps/worker/test/worker-contact.test.ts'
cancellation_suites="$supervisor_suites apps/worker/test/command-intake.test.ts"
cancellation_pattern='cancel|descendant'
crash_windows='apps/control-plane/test/crash-windows.integration.test.ts'
duplicate_pattern='redelivered'
failed_proofs=''
node_test='node --experimental-strip-types --test'

tool() {
  node --experimental-strip-types "$repository/scripts/native-acceptance.ts" "$@"
}

# The entries this host can run: macOS natively, Linux in the worker image.
default_entries() {
  case "$(uname -s)" in
    Darwin) echo 'macos linux' ;;
    Linux) echo linux ;;
    *) echo "native-acceptance.sh: $(uname -s) has no matrix entry" >&2; exit 1 ;;
  esac
}

# Summarizes a proof's log: the test counts of node:test, or its last line.
summary() {
  local counts
  counts="$(grep -E '^(ℹ|#) (tests|pass|fail|skipped|todo|cancelled) [0-9]+$' "$1" \
    | sed -E 's/^(ℹ|#) //' | paste -sd ',' - | sed 's/,/, /g')"
  if [ -n "$counts" ]; then echo "$counts"; else grep -v '^[[:space:]]*$' "$1" | tail -n 1 | cut -c 1-300; fi
}

# Runs one proof: ROW SCENARIO TARGET, then the command; the context names
# the entry, row, and command, and the proof's own records carry it too.
prove() {
  local row="$1" scenario="$2" target="$3" log status=0 outcome=passed
  shift 3
  log="$(mktemp)"
  echo "native-acceptance.sh: $entry $row: $*" >&2
  TASKELITH_ACCEPTANCE="$(tool context "$platform_file" "$row" "$*")"
  export TASKELITH_ACCEPTANCE
  set +e
  "$@" 2>&1 | tee "$log"
  status="${PIPESTATUS[0]}"
  set -e
  if [ "$status" -ne 0 ]; then outcome=failed; failed_proofs="$failed_proofs $entry/$scenario"; fi
  tool record "$scenario" "$TASKELITH_TEST_SEED" "$target" "$outcome" "exit status $status: $(summary "$log")"
  unset TASKELITH_ACCEPTANCE
  rm -f "$log"
}

# The harness compositions run against their own integration services.
harness_proofs() {
  local services_run="bash scripts/services.sh run $services"
  # shellcheck disable=SC2086
  prove process-ownership acceptance-crash-windows harness-composition \
    $services_run $node_test --test-skip-pattern="$duplicate_pattern" "$crash_windows"
  # shellcheck disable=SC2086
  prove connectivity acceptance-duplicate-delivery harness-composition \
    $services_run $node_test --test-name-pattern="$duplicate_pattern" "$crash_windows"
}

macos_entry() {
  npm run --silent build
  # shellcheck disable=SC2086
  {
    prove service-lifecycle acceptance-native-worker-lifecycle compose-installation \
      "$make_command" --no-print-directory scenario-native-worker-lifecycle
    prove process-ownership acceptance-supervisor-suites host-test-suite $node_test $supervisor_suites
    harness_proofs
    prove journal-and-storage acceptance-journal-suites host-test-suite $node_test $journal_suites
    prove cancellation acceptance-cancellation-suites host-test-suite \
      $node_test --test-name-pattern="$cancellation_pattern" $cancellation_suites
    prove connectivity acceptance-connectivity-suites host-test-suite $node_test $connectivity_suites
  }
}

linux_entry() {
  local suites="$make_command --no-print-directory linux-test-suites"
  # shellcheck disable=SC2086
  {
    prove service-lifecycle acceptance-worker-lifecycle compose-installation \
      "$make_command" --no-print-directory scenario-worker-lifecycle
    prove process-ownership acceptance-worker-kill compose-installation \
      "$make_command" --no-print-directory scenario-worker-kill
    prove process-ownership acceptance-linux-cgroup linux-test-container \
      "$make_command" --no-print-directory verify-linux-cgroup
    prove journal-and-storage acceptance-journal-suites linux-test-container $suites SUITES="$journal_suites"
    prove journal-and-storage acceptance-worker-disk-loss compose-installation \
      "$make_command" --no-print-directory scenario-worker-disk-loss
    prove cancellation acceptance-linux-cgroup-cancellation linux-test-container \
      "$make_command" --no-print-directory verify-linux-cgroup PATTERN="$cancellation_pattern"
    prove cancellation acceptance-cancellation-suites linux-test-container \
      $suites SUITES="$cancellation_suites" PATTERN="$cancellation_pattern"
    prove connectivity acceptance-connectivity-suites linux-test-container $suites SUITES="$connectivity_suites"
  }
}

# Every entry runs all its proofs; the run fails if any proof failed.
main() {
  local results kind
  if [ "$#" -ne 1 ]; then
    echo "usage: native-acceptance.sh RESULTS_FILE" >&2
    exit 2
  fi
  case "$1" in
    /*) results="$1" ;;
    *) results="$PWD/$1" ;;
  esac
  cd "$repository"
  TASKELITH_TEST_SEED="$(tool seed)"
  export TASKELITH_TEST_SEED TASKELITH_SCENARIO_RESULTS="$results"
  echo "native-acceptance.sh: seed $TASKELITH_TEST_SEED, results $results" >&2
  platform_file="$(mktemp)"
  for kind in ${ENTRIES:-$(default_entries)}; do
    case "$kind" in
      macos|linux) ;;
      *) echo "native-acceptance.sh: unknown entry kind $kind; use macos or linux" >&2; exit 2 ;;
    esac
    if [ "$kind" = linux ]; then "$make_command" --no-print-directory linux-test-image; fi
    tool platform "$kind" > "$platform_file"
    entry="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).entry' "$platform_file")"
    echo "native-acceptance.sh: entry $entry" >&2
    "${kind}_entry"
  done
  rm -f "$platform_file"
  if [ -n "$failed_proofs" ]; then
    echo "native-acceptance.sh: failed proofs:$failed_proofs; see $results" >&2
    exit 1
  fi
  echo "native-acceptance.sh: every proof passed; see $results" >&2
}

# Tests source this file for its functions; only a run calls main.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
