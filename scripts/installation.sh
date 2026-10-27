#!/usr/bin/env bash
# Runs the minimal local installation through Docker Compose; the Makefile
# passes the image pins. usage: installation.sh COMMAND PROJECT
set -euo pipefail

usage() {
  echo "usage: installation.sh build|bootstrap|broker-config|certificates|installation-ca|start|stop|enroll|enrollment-token|verify|check-reproducible|smoke|check-containment|scenario-fresh-composition|scenario-worker-disk-loss|scenario-worker-kill|scenario-worker-namespace-confinement|scenario-worker-lifecycle|scenario-native-worker-lifecycle PROJECT" >&2
  exit 2
}

if [ "$#" -ne 2 ]; then usage; fi
repository="$(cd "$(dirname "$0")/.." && pwd)"
compose_files=(--file "$repository/infra/installation/compose.yaml")
smoke_directory="$repository/infra/installation/smoke"
command="$1"
project="$2"
case "$project" in
  ''|*[!a-z0-9_-]*|[!a-z0-9]*)
    echo "installation.sh: project must be lowercase letters, digits, '_' or '-'" >&2
    exit 2
    ;;
esac
# Images are tagged per project, so worktrees never replace each other's.
export TASKELITH_IMAGE_TAG="$project"
control_plane_image="taskelith-control-plane:$project"
worker_image="taskelith-worker:$project"

compose() {
  docker compose "${compose_files[@]}" --project-name "$project" "$@"
}

require() {
  if [ -z "${!1:-}" ]; then
    echo "installation.sh: set $1 ($2)" >&2
    exit 2
  fi
}

# EPOCH, the commit time of the built revision, fixes the image's dates.
build_image() {
  local context="$1" epoch="$2" target="$3" image="$4"
  shift 4
  docker build "$@" --file "$context/infra/installation/Dockerfile" --target "$target" --tag "$image" \
    --build-arg BASE="$TASKELITH_UBUNTU_BASE" --build-arg NODE_VERSION="$TASKELITH_NODE_VERSION" \
    --build-arg NODE_SHA256_AMD64="$TASKELITH_NODE_SHA256_AMD64" \
    --build-arg NODE_SHA256_ARM64="$TASKELITH_NODE_SHA256_ARM64" \
    --build-arg SOURCE_DATE_EPOCH="$epoch" "$context"
}

commit_time() {
  git -C "$repository" log -1 --format=%ct "$1"
}

require_pins() {
  local name
  for name in TASKELITH_UBUNTU_BASE TASKELITH_NODE_VERSION TASKELITH_NODE_SHA256_AMD64 TASKELITH_NODE_SHA256_ARM64; do
    require "$name" "run through make $1"
  done
}

# The commit ID of the tracked files with their uncommitted edits: no local
# credentials or state reach an image, and every step sees one commit.
source_revision() {
  local revision
  revision="$(git -C "$repository" stash create)" || return
  if [ -z "$revision" ]; then revision="$(git -C "$repository" rev-parse --verify HEAD)" || return; fi
  echo "$revision"
}

unpack_context() {
  git -C "$repository" archive --format=tar "$1" | tar -xf - -C "$2"
}

build() (
  local revision epoch context
  require_pins installation-build
  context="$(mktemp -d)"
  trap 'rm -rf "$context"' EXIT
  revision="$(source_revision)" || exit
  epoch="$(commit_time "$revision")" || exit
  unpack_context "$revision" "$context"
  build_image "$context" "$epoch" control-plane "$control_plane_image"
  build_image "$context" "$epoch" worker "$worker_image"
)

# Removes the check's images; a failed removal fails a check that passed.
finish_reproducible() {
  local status="$1" image built=()
  rm -rf "$context"
  for image in "$first" "$second"; do
    if docker image inspect "$image" >/dev/null 2>&1; then built+=("$image"); fi
  done
  if [ "${#built[@]}" -gt 0 ] && ! docker image rm "${built[@]}" >/dev/null; then
    echo "installation.sh: the images ${built[*]} were not removed" >&2
    if [ "$status" -eq 0 ]; then status=1; fi
  fi
  exit "$status"
}

# Builds the worker image twice from fresh contexts of one revision, without
# the build cache, and passes only when both builds give one image ID.
check_reproducible() (
  local revision epoch first="$worker_image-first" second="$worker_image-second" context="" image
  local first_id second_id
  require_pins verify-worker-image-reproducible
  trap 'finish_reproducible $?' EXIT
  revision="$(source_revision)" || exit
  epoch="$(commit_time "$revision")" || exit
  for image in "$first" "$second"; do
    rm -rf "$context"
    context="$(mktemp -d)"
    unpack_context "$revision" "$context"
    build_image "$context" "$epoch" worker "$image" --no-cache
  done
  first_id="$(docker image inspect --format '{{.Id}}' "$first")"
  second_id="$(docker image inspect --format '{{.Id}}' "$second")"
  if [ "$first_id" != "$second_id" ]; then
    echo "installation.sh: two builds of one revision gave $first_id and $second_id" >&2
    exit 1
  fi
  echo "installation.sh: both builds gave the worker image $first_id"
)

# Prints the init result once: it holds the operator secret (contract 4).
bootstrap() {
  require TASKELITH_ACTOR "make installation-bootstrap ACTOR=..."
  require TASKELITH_REASON "make installation-bootstrap REASON=..."
  compose up --detach --wait --wait-timeout 120 postgres
  compose run --rm --no-deps -T admin init --actor "$TASKELITH_ACTOR" --reason "$TASKELITH_REASON"
  broker_config
}

# Installs the broker trust and TLS files that init wrote, and the public
# CA for the worker; repeatable after a failure.
broker_config() {
  compose run --rm --no-deps -T nats-setup >&2
}

# Issues new server certificates from the kept authority, installs the
# broker's, and restarts the broker and control plane that run.
certificates() {
  local service running=()
  compose run --rm --no-deps -T admin issue-installation-certificates
  broker_config
  for service in nats control-plane; do
    if [ -n "$(compose ps --quiet --status running "$service")" ]; then running+=("$service"); fi
  done
  if [ "${#running[@]}" -gt 0 ]; then compose restart "${running[@]}" >&2; fi
}

# Prints the installation's public CA certificate, which clients trust.
installation_ca() {
  compose run --rm --no-deps -T --entrypoint cat admin /var/lib/taskelith/control-plane/installation-ca.pem
}

# Exports the installation CA for this script's Node.js tools, which reach
# the API over HTTPS; remove_project deletes the file.
trust_installation_ca() {
  ca_file="$(mktemp "${TMPDIR:-/tmp}/taskelith-installation-ca.XXXXXX")"
  installation_ca > "$ca_file"
  export NODE_EXTRA_CA_CERTS="$ca_file"
}

start() {
  local worker
  if ! compose up --detach --wait --wait-timeout 120 postgres nats control-plane; then
    stop_failed_control_plane
  fi
  worker="$(compose --profile worker ps --all --quiet worker)"
  # Recreates an enrolled worker from a rebuilt image; its volume stays.
  if [ -n "$worker" ]; then
    compose --profile worker up --detach --no-deps --wait --wait-timeout 120 worker
  fi
}

stop() {
  compose --profile worker stop
}

# Stops the control plane, so that a start failure does not restart it in a
# loop, and shows why it failed: its last error, or else its last lines.
stop_failed_control_plane() {
  local logs reason
  logs="$(compose logs --no-color --no-log-prefix control-plane 2>&1 || true)"
  compose stop control-plane >&2 || true
  reason="$(printf '%s\n' "$logs" | grep '"error"' | tail -n 1 || true)"
  printf '%s\n' "${reason:-$(printf '%s\n' "$logs" | tail -n 20)}" >&2
  echo "installation.sh: the installation did not start; the control plane is stopped" >&2
  exit 1
}

# Issues a single-use enrollment token; prints {"enrollmentToken": ...}.
enrollment_token() {
  require TASKELITH_OPERATOR_TOKEN "the operatorSecret that bootstrap printed"
  local options=()
  if [ -n "${TASKELITH_WORKER_PLATFORM:-}" ]; then options+=(--platform "$TASKELITH_WORKER_PLATFORM"); fi
  if [ -n "${TASKELITH_WORKER_ARCHITECTURE:-}" ]; then options+=(--architecture "$TASKELITH_WORKER_ARCHITECTURE"); fi
  if [ -n "${TASKELITH_WORKER_HOSTNAME:-}" ]; then options+=(--hostname "$TASKELITH_WORKER_HOSTNAME"); fi
  compose run --rm --no-deps -T --env TASKELITH_OPERATOR_TOKEN admin issue-enrollment-token "${options[@]}"
}

field() {
  sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"
}

wait_for_enrollment() {
  local attempt
  for attempt in $(seq 1 60); do
    if compose --profile worker exec -T worker test -s /var/lib/taskelith/worker/identity 2>/dev/null; then return 0; fi
    sleep 1
  done
  compose --profile worker logs worker >&2
  echo "installation.sh: the worker did not enroll" >&2
  exit 1
}

# Enrolls the Linux worker container on its first start with a fresh token.
enroll() {
  local token
  token="$(TASKELITH_WORKER_PLATFORM=linux enrollment_token | field enrollmentToken)"
  if [ -z "$token" ]; then
    echo "installation.sh: no enrollment token was issued" >&2
    exit 1
  fi
  TASKELITH_ENROLLMENT_TOKEN="$token" compose --profile worker up --detach --wait --wait-timeout 120 worker
  wait_for_enrollment
}

check_image() {
  local image="$1" user entries
  user="$(docker image inspect --format '{{.Config.User}}' "$image")"
  if [ "$user" != "taskelith" ]; then
    echo "installation.sh: $image does not run as the taskelith user" >&2
    exit 1
  fi
  entries="$(docker run --rm --entrypoint find "$image" /var/lib/taskelith -mindepth 1)"
  if [ -n "$entries" ]; then
    echo "installation.sh: $image ships state in its data root" >&2
    exit 1
  fi
  if ! docker run --rm --entrypoint test "$image" ! -e "/opt/taskelith/$2"; then
    echo "installation.sh: $image contains the untracked file $2, or the check failed" >&2
    exit 1
  fi
}

check_running() {
  local service
  sleep 5
  for service in postgres nats control-plane worker; do
    if [ "$(compose --profile worker ps --format '{{.State}}' "$service")" != "running" ]; then
      compose --profile worker logs "$service" >&2
      echo "installation.sh: $service is not running" >&2
      exit 1
    fi
  done
}

remove_project() {
  if [ -n "${sentinel:-}" ]; then rm -f "$repository/$sentinel"; fi
  if [ -n "${ca_file:-}" ]; then rm -f "$ca_file"; fi
  compose --profile setup --profile admin --profile worker down --volumes --remove-orphans >/dev/null 2>&1 \
    && docker image rm "$control_plane_image" "$worker_image" >/dev/null 2>&1
}

# Without leftovers the images are absent, so only the final removal counts.
remove_leftovers() {
  remove_project || true
}

# A failed check shows the control plane's log before the project goes.
finish_verify() {
  if [ "$1" -ne 0 ]; then compose logs --no-color control-plane >&2 || true; fi
  remove_leftovers
}

# A throwaway project: a random database password, ephemeral host ports,
# and no leftovers of an earlier run.
fresh_project() {
  export TASKELITH_POSTGRES_PASSWORD TASKELITH_API_PUBLISH_PORT='' TASKELITH_NATS_PUBLISH_PORT=''
  TASKELITH_POSTGRES_PASSWORD="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  remove_leftovers
}

# Bootstraps and keeps the printed operator secret for the later steps.
bootstrap_operator() {
  local result
  result="$(TASKELITH_ACTOR="$1" TASKELITH_REASON="$2" bootstrap)"
  export TASKELITH_OPERATOR_TOKEN
  TASKELITH_OPERATOR_TOKEN="$(printf '%s' "$result" | field operatorSecret)"
  require TASKELITH_OPERATOR_TOKEN "bootstrap printed no operatorSecret"
}

# The final removal of a throwaway project, which must succeed.
remove_throwaway() {
  trap - EXIT
  if ! remove_project; then
    echo "installation.sh: the throwaway project was not fully removed" >&2
    exit 1
  fi
  echo "installation.sh: $1"
}

# Opt-in end-to-end check on a fresh throwaway project with random secrets
# and ephemeral host ports, removed with its volumes and images at the end.
verify() {
  sentinel=".installation-sentinel-$$"
  fresh_project
  trap 'finish_verify $?' EXIT
  : > "$repository/$sentinel"
  build
  check_image "$control_plane_image" "$sentinel"
  check_image "$worker_image" "$sentinel"
  bootstrap_operator verify-installation 'opt-in check'
  broker_config
  start
  enroll
  stop
  start
  check_running
  remove_throwaway "built, bootstrapped, started, enrolled, restarted, removed"
}

# The control plane's published API port, for example 127.0.0.1:55012.
api_url() {
  local address
  address="$(compose port control-plane 8080)"
  if [ -z "$address" ]; then
    echo "installation.sh: the control-plane API port is not published" >&2
    exit 1
  fi
  echo "https://$address"
}

# The capabilities of the worker process: KILL, SETGID, and SETUID only.
WORKER_CAPABILITIES='CapInh: 0000000000000000 CapPrm: 00000000000000e0 CapEff: 00000000000000e0 CapBnd: 00000000000000e0 CapAmb: 0000000000000000'

# The execution account (uid 10003) cannot move a process into the worker's
# cgroup, and the worker process holds exactly its three capabilities.
check_containment() {
  local refusal capabilities
  if refusal="$(compose --profile worker exec -T --user 10003:10003 worker \
    bash -c 'echo $$ > /sys/fs/cgroup/init/cgroup.procs' 2>&1)"; then
    echo "installation.sh: the execution account can write the worker's cgroup.procs" >&2
    exit 1
  fi
  case "$refusal" in
    *"Permission denied"*) ;;
    *) echo "installation.sh: the cgroup.procs probe failed: $refusal" >&2; exit 1 ;;
  esac
  capabilities="$(compose --profile worker exec -T worker bash -c \
    'grep -E "^Cap(Inh|Prm|Eff|Bnd|Amb):" "/proc/$(pgrep -o -f "^node apps/worker/dist/main.js")/status"' \
    | tr -s ' \t\n' ' ' | sed 's/ $//')"
  if [ "$capabilities" != "$WORKER_CAPABILITIES" ]; then
    echo "installation.sh: the worker process has other capabilities: $capabilities" >&2
    exit 1
  fi
}

# A failed smoke shows both services' logs before the project goes.
finish_smoke() {
  if [ "$1" -ne 0 ]; then compose --profile worker logs --no-color control-plane worker >&2 || true; fi
  remove_leftovers
}

# Opt-in end-to-end smoke on a fresh throwaway project: an operator submits
# a task, the worker container executes it, and the result is stored.
smoke() {
  compose_files+=(--file "$smoke_directory/compose.yaml")
  fresh_project
  trap 'finish_smoke $?' EXIT
  build
  bootstrap_operator installation-smoke 'opt-in smoke'
  start
  enroll
  check_containment
  local url
  trust_installation_ca
  url="$(api_url)"
  node --experimental-strip-types "$repository/scripts/installation-smoke.ts" "$url" "$smoke_directory/workflows.json"
  remove_throwaway "submitted, assigned, executed, stored the result, removed"
}

# The G2 failure scenarios (item 24a), defined apart so tests can load them.
# shellcheck source=installation-scenarios.sh
source "$repository/scripts/installation-scenarios.sh"

case "$command" in
  build) build ;;
  bootstrap) bootstrap ;;
  broker-config) broker_config ;;
  certificates) certificates ;;
  installation-ca) installation_ca ;;
  start) start ;;
  stop) stop ;;
  enroll) enroll ;;
  enrollment-token) enrollment_token ;;
  verify) verify ;;
  check-reproducible) check_reproducible ;;
  smoke) smoke ;;
  check-containment) check_containment ;;
  scenario-fresh-composition) fresh_composition_scenario ;;
  scenario-worker-disk-loss) disk_loss_scenario ;;
  scenario-worker-kill) worker_kill_scenario ;;
  scenario-worker-namespace-confinement) namespace_confinement_scenario ;;
  scenario-worker-lifecycle) worker_lifecycle_scenario ;;
  scenario-native-worker-lifecycle) native_worker_lifecycle_scenario ;;
  *) usage ;;
esac
