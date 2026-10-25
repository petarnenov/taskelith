#!/usr/bin/env bash
# Runs the minimal local installation through Docker Compose; the Makefile
# passes the image pins. usage: installation.sh COMMAND PROJECT
set -euo pipefail

usage() {
  echo "usage: installation.sh build|bootstrap|start|stop|enroll|enrollment-token|verify PROJECT" >&2
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

compose() {
  docker compose --file "$compose_file" --project-name "$project" "$@"
}

require() {
  if [ -z "${!1:-}" ]; then
    echo "installation.sh: set $1 ($2)" >&2
    exit 2
  fi
}

build() {
  compose --profile worker build control-plane worker
}

# Prints the init result once: it holds the operator secret (contract 4).
bootstrap() {
  require TASKELITH_ACTOR "make installation-bootstrap ACTOR=..."
  require TASKELITH_REASON "make installation-bootstrap REASON=..."
  compose up --detach --wait --wait-timeout 120 postgres
  compose run --rm --no-deps -T admin init --actor "$TASKELITH_ACTOR" --reason "$TASKELITH_REASON"
  compose run --rm --no-deps -T nats-setup >&2
}

start() {
  compose up --detach --wait --wait-timeout 120 postgres nats control-plane
  if [ -n "$(compose --profile worker ps --all --quiet worker)" ]; then
    compose --profile worker start worker
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

# Enrolls the Linux worker container on its first start with a fresh token.
enroll() {
  local token
  token="$(TASKELITH_WORKER_PLATFORM=linux enrollment_token | sed -n 's/.*"enrollmentToken":"\([^"]*\)".*/\1/p')"
  if [ -z "$token" ]; then
    echo "installation.sh: no enrollment token was issued" >&2
    exit 1
  fi
  TASKELITH_ENROLLMENT_TOKEN="$token" compose --profile worker up --detach --wait --wait-timeout 120 worker
}

field() {
  sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"
}

check_image() {
  local image="$1"
  if [ "$(docker image inspect --format '{{.Config.User}}' "$image")" != "taskelith" ]; then
    echo "installation.sh: $image does not run as the taskelith user" >&2
    exit 1
  fi
  if [ -n "$(docker run --rm --entrypoint find "$image" /var/lib/taskelith -mindepth 1)" ]; then
    echo "installation.sh: $image ships state in its data root" >&2
    exit 1
  fi
}

wait_for_enrollment() {
  local attempt
  for attempt in $(seq 1 60); do
    if compose --profile worker exec -T worker test -s /var/lib/taskelith/worker/identity; then return 0; fi
    sleep 1
  done
  compose --profile worker logs worker >&2
  echo "installation.sh: the worker did not enroll" >&2
  exit 1
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

# Opt-in end-to-end check on a throwaway project with random secrets and
# ephemeral host ports; it removes the project and its volumes at the end.
verify() {
  trap 'compose --profile setup --profile admin --profile worker down --volumes --remove-orphans >/dev/null 2>&1' EXIT
  export TASKELITH_POSTGRES_PASSWORD TASKELITH_API_PUBLISH_PORT='' TASKELITH_NATS_PUBLISH_PORT=''
  TASKELITH_POSTGRES_PASSWORD="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  build
  check_image taskelith-control-plane:local
  check_image taskelith-worker:local
  local result
  result="$(TASKELITH_ACTOR=verify-installation TASKELITH_REASON='opt-in check' bootstrap)"
  export TASKELITH_OPERATOR_TOKEN
  TASKELITH_OPERATOR_TOKEN="$(printf '%s' "$result" | field operatorSecret)"
  require TASKELITH_OPERATOR_TOKEN "bootstrap printed no operatorSecret"
  start
  enroll
  wait_for_enrollment
  stop
  start
  check_running
  echo "installation.sh: built, bootstrapped, started, enrolled, restarted"
}

case "$command" in
  build) build ;;
  bootstrap) bootstrap ;;
  start) start ;;
  stop) stop ;;
  enroll) enroll ;;
  enrollment-token) enrollment_token ;;
  verify) verify ;;
  *) usage ;;
esac
