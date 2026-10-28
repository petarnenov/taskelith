#!/usr/bin/env bash
# Runs the Linux tests of the Git workspace adapter in the worker image, as
# root with its three capabilities; usage: linux-git-workspace.sh IMAGE [ARGS]
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: linux-git-workspace.sh IMAGE [NODE_TEST_OPTIONS...]" >&2
  exit 2
fi
image="$1"
shift
repository="$(cd "$(dirname "$0")/.." && pwd)"
# The image's entrypoint delegates the cgroup subtree and keeps SETUID,
# SETGID, and KILL; the tests add the execution group and umask 0007.
exec docker run --rm --init --privileged --cgroupns=private --network none --user 0 \
  --volume "$repository:/repo:ro" --workdir /repo "$image" \
  bash -c 'umask 0007 && exec setpriv --groups=10003 -- node --experimental-strip-types --test "$@" \
    packages/adapters/git-workspace/test/linux-git-workspace.privileged.ts' linux-git-workspace "$@"
