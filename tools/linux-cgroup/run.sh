#!/usr/bin/env bash
# Runs the privileged tests with the options it gets, in the cgroup layout
# of cgroup-layout.sh.
set -euo pipefail

# shellcheck source=cgroup-layout.sh
source /usr/local/lib/taskelith/cgroup-layout.sh
cd /repo
exec node --experimental-strip-types --test "$@" packages/adapters/worker-supervisor/test/linux-cgroup.privileged.ts
