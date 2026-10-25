#!/usr/bin/env bash
# Moves every process into a leaf, so that the namespace's root cgroup can
# hold the delegated containment parent, then runs the privileged tests.
set -euo pipefail

cgroup=/sys/fs/cgroup
mkdir -p "$cgroup/init" "$cgroup/executions"
while read -r pid; do
  echo "$pid" > "$cgroup/init/cgroup.procs" 2>/dev/null || true
done < "$cgroup/cgroup.procs"
cd /repo
exec node --experimental-strip-types --test packages/adapters/worker-supervisor/test/linux-cgroup.privileged.ts
