#!/usr/bin/env bash
# Moves every process into a leaf, so the root cgroup can hold the delegated
# containment parent; runs the privileged tests with the options it gets.
set -euo pipefail

cgroup=/sys/fs/cgroup
mkdir -p "$cgroup/init" "$cgroup/executions"
while read -r pid; do
  echo "$pid" > "$cgroup/init/cgroup.procs" 2>/dev/null || true
done < "$cgroup/cgroup.procs"
cd /repo
exec node --experimental-strip-types --test "$@" packages/adapters/worker-supervisor/test/linux-cgroup.privileged.ts
