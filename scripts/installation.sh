#!/usr/bin/env bash
# Runs the minimal local installation through Docker Compose; the Makefile
# passes the image pins. usage: installation.sh COMMAND PROJECT
set -euo pipefail

usage() {
  echo "usage: installation.sh build|bootstrap|broker-config|start|stop|enroll|enrollment-token|verify PROJECT" >&2
  exit 2
}

if [ "$#" -ne 2 ]; then usage; fi
repository="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="$repository/infra/installation/compose.yaml"
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
  docker compose --file "$compose_file" --project-name "$project" "$@"
}

require() {
  if [ -z "${!1:-}" ]; then
    echo "installation.sh: set $1 ($2)" >&2
    exit 2
  fi
}

build_image() {
  local context="$1" target="$2" image="$3"
  docker build --file "$context/infra/installation/Dockerfile" --target "$target" --tag "$image" \
    --build-arg BASE="$TASKELITH_UBUNTU_BASE" --build-arg NODE_VERSION="$TASKELITH_NODE_VERSION" \
    --build-arg NODE_SHA256_AMD64="$TASKELITH_NODE_SHA256_AMD64" \
    --build-arg NODE_SHA256_ARM64="$TASKELITH_NODE_SHA256_ARM64" "$context"
}

# The build context holds only tracked files, with their uncommitted edits,
# so local credentials or state never reach an image.
build() (
  local name revision context
  for name in TASKELITH_UBUNTU_BASE TASKELITH_NODE_VERSION TASKELITH_NODE_SHA256_AMD64 TASKELITH_NODE_SHA256_ARM64; do
    require "$name" "run through make installation-build"
  done
  context="$(mktemp -d)"
  trap 'rm -rf "$context"' EXIT
  revision="$(git -C "$repository" stash create)"
  git -C "$repository" archive --format=tar "${revision:-HEAD}" | tar -xf - -C "$context"
  build_image "$context" control-plane "$control_plane_image"
  build_image "$context" worker "$worker_image"
)

# Prints the init result once: it holds the operator secret (contract 4).
bootstrap() {
  require TASKELITH_ACTOR "make installation-bootstrap ACTOR=..."
  require TASKELITH_REASON "make installation-bootstrap REASON=..."
  compose up --detach --wait --wait-timeout 120 postgres
  compose run --rm --no-deps -T admin init --actor "$TASKELITH_ACTOR" --reason "$TASKELITH_REASON"
  broker_config
}

# Installs the broker trust that init wrote; repeatable after a failure.
broker_config() {
  compose run --rm --no-deps -T nats-setup >&2
}

start() {
  local worker
  compose up --detach --wait --wait-timeout 120 postgres nats control-plane
  worker="$(compose --profile worker ps --all --quiet worker)"
  # Recreates an enrolled worker from a rebuilt image; its volume stays.
  if [ -n "$worker" ]; then
    compose --profile worker up --detach --no-deps --wait --wait-timeout 120 worker
  fi
}

stop() {
  compose --profile worker stop
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
  rm -f "$repository/$sentinel"
  compose --profile setup --profile admin --profile worker down --volumes --remove-orphans >/dev/null 2>&1 \
    && docker image rm "$control_plane_image" "$worker_image" >/dev/null 2>&1
}

# Without leftovers the images are absent, so only the final removal counts.
remove_leftovers() {
  remove_project || true
}

# Opt-in end-to-end check on a fresh throwaway project with random secrets
# and ephemeral host ports, removed with its volumes and images at the end.
verify() {
  sentinel=".installation-sentinel-$$"
  export TASKELITH_POSTGRES_PASSWORD TASKELITH_API_PUBLISH_PORT='' TASKELITH_NATS_PUBLISH_PORT=''
  TASKELITH_POSTGRES_PASSWORD="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  remove_leftovers
  trap remove_leftovers EXIT
  : > "$repository/$sentinel"
  build
  check_image "$control_plane_image" "$sentinel"
  check_image "$worker_image" "$sentinel"
  local result
  result="$(TASKELITH_ACTOR=verify-installation TASKELITH_REASON='opt-in check' bootstrap)"
  export TASKELITH_OPERATOR_TOKEN
  TASKELITH_OPERATOR_TOKEN="$(printf '%s' "$result" | field operatorSecret)"
  require TASKELITH_OPERATOR_TOKEN "bootstrap printed no operatorSecret"
  broker_config
  start
  enroll
  stop
  start
  check_running
  trap - EXIT
  if ! remove_project; then
    echo "installation.sh: the throwaway project was not fully removed" >&2
    exit 1
  fi
  echo "installation.sh: built, bootstrapped, started, enrolled, restarted, removed"
}

case "$command" in
  build) build ;;
  bootstrap) bootstrap ;;
  broker-config) broker_config ;;
  start) start ;;
  stop) stop ;;
  enroll) enroll ;;
  enrollment-token) enrollment_token ;;
  verify) verify ;;
  *) usage ;;
esac
