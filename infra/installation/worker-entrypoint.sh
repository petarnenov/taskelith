#!/usr/bin/env bash
# Delegates the container's cgroup v2 subtree, then runs the worker as root
# with SETUID, SETGID, and KILL only (docs/local-installation.md).
set -euo pipefail

# The override is for tests only; the worker always reads /sys/fs/cgroup.
cgroup_root="${TASKELITH_TEST_CGROUP_ROOT:-/sys/fs/cgroup}"
home="$cgroup_root/init"
parent="${TASKELITH_CONTAINMENT_PARENT:-}"
data_root="${TASKELITH_DATA_DIR:-/var/lib/taskelith}"

fail() {
  echo "worker-entrypoint: $1" >&2
  exit 1
}

if [ "$(id -u)" != 0 ]; then fail "start the worker container as root (compose.yaml)"; fi
if [ ! -f "$cgroup_root/cgroup.controllers" ]; then fail "cgroup v2 is not mounted at $cgroup_root"; fi
# A sibling of the worker's own cgroup, never the root or the home itself.
case "$parent" in
  "$cgroup_root"/*/*|"$home") fail "TASKELITH_CONTAINMENT_PARENT must be a child of $cgroup_root other than init" ;;
  "$cgroup_root"/?*) ;;
  *) fail "TASKELITH_CONTAINMENT_PARENT must be a child of $cgroup_root" ;;
esac

# Docker mounts the private cgroup namespace read-only.
if [ ! -w "$cgroup_root/cgroup.procs" ]; then mount -o remount,rw "$cgroup_root"; fi
mkdir -p "$home" "$parent"
# The root may hold no process, so that its children can be delegated.
# A copy of the list, since each move shortens the file while it is read.
for pid in $(cat "$cgroup_root/cgroup.procs"); do
  echo "$pid" > "$home/cgroup.procs" 2>/dev/null || true
done
if [ -n "$(cat "$cgroup_root/cgroup.procs")" ]; then fail "processes remain in the cgroup root $cgroup_root"; fi

# The worker checks that root owns its data root; a 23a volume is taskelith's.
if [ "$(stat -c %u "$data_root")" != 0 ]; then chown -R 0:0 "$data_root"; fi

# A child switches to the execution account, which clears its capabilities.
exec setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --no-new-privs -- "$@"
