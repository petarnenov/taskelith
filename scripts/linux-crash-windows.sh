#!/usr/bin/env bash
# Runs G2 test files, the crash windows by default, in the privileged Linux
# test image against services.sh run; usage: linux-crash-windows.sh IMAGE [ARGS]
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: linux-crash-windows.sh IMAGE [NODE_TEST_OPTIONS...] [-- TEST_FILES...]" >&2
  exit 2
fi
if [ -z "${TASKELITH_SERVICES_SECRETS:-}" ]; then
  echo "linux-crash-windows.sh: TASKELITH_SERVICES_SECRETS is not set; run it through services.sh run" >&2
  exit 2
fi
image="$1"
shift
repository="$(cd "$(dirname "$0")/.." && pwd)"
# The host network keeps the services' 127.0.0.1 URLs; the journal needs a
# fresh volume, not overlayfs; the commit is read here, outside the image.
options=(
  --rm --init --privileged --cgroupns=private --network host --volume /tmp
  --volume "$repository:/repo:ro" --volume "$TASKELITH_SERVICES_SECRETS:/secrets:ro"
  --env TASKELITH_POSTGRES_URL --env TASKELITH_NATS_URL --env TASKELITH_SERVICES_SECRETS=/secrets
  --env TASKELITH_TOXIPROXY_URL --env TASKELITH_POSTGRES_PROXY_URL --env TASKELITH_NATS_PROXY_URL
  --env TASKELITH_SCENARIO_COMMIT="$(git -C "$repository" rev-parse HEAD)"
)
if [ -n "${TASKELITH_TEST_SEED:-}" ]; then options+=(--env TASKELITH_TEST_SEED); fi
# A native acceptance proof's context, for the scenarios' own records.
if [ -n "${TASKELITH_ACCEPTANCE:-}" ]; then options+=(--env TASKELITH_ACCEPTANCE); fi
# The file is created here, so it stays the caller's after root appends.
if [ -n "${TASKELITH_SCENARIO_RESULTS:-}" ]; then
  touch "$TASKELITH_SCENARIO_RESULTS"
  results="$(cd "$(dirname "$TASKELITH_SCENARIO_RESULTS")" && pwd)/$(basename "$TASKELITH_SCENARIO_RESULTS")"
  options+=(--volume "$results:/results.jsonl" --env TASKELITH_SCENARIO_RESULTS=/results.jsonl)
fi
exec docker run "${options[@]}" --entrypoint /usr/local/bin/taskelith-linux-crash-windows "$image" "$@"
