#!/usr/bin/env bash
# Starts (up), stops (down), or runs a command against (run) one Compose
# project of the integration services; usage: services.sh ACTION PROJECT [CMD]
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: services.sh up|down|run PROJECT [COMMAND...]" >&2
  exit 2
fi
compose_file="$(dirname "$0")/../infra/services/compose.yaml"
action="$1"
project="$2"
shift 2

compose() {
  docker compose --file "$compose_file" --project-name "$project" "$@"
}

require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not available. Start Docker; make verify needs it for the integration services." >&2
    exit 1
  fi
}

up() {
  compose up --detach --wait --wait-timeout 120 || { compose down --volumes; exit 1; }
}

down() {
  compose down --volumes --remove-orphans
}

# Prints the host address of a service port; host ports are ephemeral.
published_address() {
  local address
  address="$(compose port "$1" "$2" 2>/dev/null || true)"
  if [ -z "$address" ]; then
    echo "services.sh: project $project publishes no port for $1:$2" >&2
    exit 1
  fi
  echo "$address"
}

export_endpoint_urls() {
  local postgres nats
  postgres="$(published_address postgres 5432)"
  nats="$(published_address nats 4222)"
  export TASKELITH_POSTGRES_URL="postgres://taskelith:taskelith@$postgres/taskelith"
  export TASKELITH_NATS_URL="nats://$nats"
}

case "$action" in
  up)
    require_docker
    up
    export_endpoint_urls
    echo "Integration services of project $project are up; export:"
    echo "export TASKELITH_POSTGRES_URL=$TASKELITH_POSTGRES_URL"
    echo "export TASKELITH_NATS_URL=$TASKELITH_NATS_URL"
    ;;
  down)
    down
    ;;
  run)
    require_docker
    trap down EXIT
    # Turns signals into exits, so the EXIT trap removes the project.
    trap 'exit 130' INT
    trap 'exit 143' TERM HUP
    up
    export_endpoint_urls
    # In the background, so that a signal interrupts the wait at once.
    "$@" &
    command_pid=$!
    trap 'kill "$command_pid" 2>/dev/null; exit 130' INT
    trap 'kill "$command_pid" 2>/dev/null; exit 143' TERM HUP
    wait "$command_pid"
    ;;
  *)
    echo "services.sh: unknown action $action" >&2
    exit 2
    ;;
esac
