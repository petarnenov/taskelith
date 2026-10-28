#!/usr/bin/env bash
# Runs node:test with OPTIONS [-- FILES], the G2 crash windows without
# files, as root in init/; launches run in executions/.
set -euo pipefail

crash_windows=apps/control-plane/test/crash-windows.integration.test.ts

# Prints the node:test arguments, one per line: the options before `--`,
# then the files after it, or the crash windows when none follow.
test_arguments() {
  local files=()
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do
    printf '%s\n' "$1"
    shift
  done
  if [ "$#" -gt 0 ]; then shift; files=("$@"); fi
  if [ "${#files[@]}" -eq 0 ]; then files=("$crash_windows"); fi
  printf '%s\n' "${files[@]}"
}

main() {
  # shellcheck source=tools/linux-cgroup/cgroup-layout.sh
  source /usr/local/lib/taskelith/cgroup-layout.sh
  TASKELITH_CONTAINMENT_PARENT="$cgroup/executions"
  TASKELITH_EXECUTION_UID="$(id -u taskelith-exec)"
  TASKELITH_EXECUTION_GID="$(id -g taskelith-exec)"
  # The harnesses fail without the launch rather than fall back silently.
  export TASKELITH_REQUIRE_LINUX_LAUNCH=1
  export TASKELITH_CONTAINMENT_PARENT TASKELITH_EXECUTION_UID TASKELITH_EXECUTION_GID
  cd /repo
  local arguments
  mapfile -t arguments < <(test_arguments "$@")
  exec node --experimental-strip-types --test "${arguments[@]}"
}

# Tests source this file for its functions; only a run calls main.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
