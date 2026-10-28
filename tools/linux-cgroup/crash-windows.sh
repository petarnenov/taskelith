#!/usr/bin/env bash
# Runs the test files it gets, the G2 crash windows by default, with the
# options it gets, as root in init/; launches run in executions/.
set -euo pipefail

# shellcheck source=tools/linux-cgroup/cgroup-layout.sh
source /usr/local/lib/taskelith/cgroup-layout.sh
TASKELITH_CONTAINMENT_PARENT="$cgroup/executions"
TASKELITH_EXECUTION_UID="$(id -u taskelith-exec)"
TASKELITH_EXECUTION_GID="$(id -g taskelith-exec)"
export TASKELITH_CONTAINMENT_PARENT TASKELITH_EXECUTION_UID TASKELITH_EXECUTION_GID
cd /repo
# An argument that is no option names a test file.
files=0
for argument in "$@"; do
  case "$argument" in -*) ;; *) files=$((files + 1)) ;; esac
done
if [ "$files" -eq 0 ]; then set -- "$@" apps/control-plane/test/crash-windows.integration.test.ts; fi
exec node --experimental-strip-types --test "$@"
