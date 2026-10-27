#!/usr/bin/env bash
# Runs the G2 crash windows with the options it gets: the composed worker's
# home is init/, and its launches run in executions/ as taskelith-exec.
set -euo pipefail

# shellcheck source=cgroup-layout.sh
source /usr/local/lib/taskelith/cgroup-layout.sh
TASKELITH_CONTAINMENT_PARENT="$cgroup/executions"
TASKELITH_EXECUTION_UID="$(id -u taskelith-exec)"
TASKELITH_EXECUTION_GID="$(id -g taskelith-exec)"
export TASKELITH_CONTAINMENT_PARENT TASKELITH_EXECUTION_UID TASKELITH_EXECUTION_GID
cd /repo
exec node --experimental-strip-types --test "$@" apps/control-plane/test/crash-windows.integration.test.ts
