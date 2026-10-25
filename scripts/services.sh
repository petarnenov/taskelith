#!/usr/bin/env bash
# Starts (up), stops (down), or runs a command against (run) one Compose
# project of the integration services; usage: services.sh ACTION PROJECT [CMD]
set -euo pipefail

usage() {
  echo "usage: services.sh up|down PROJECT, or services.sh run PROJECT COMMAND..." >&2
  exit 2
}

if [ "$#" -lt 2 ]; then usage; fi
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
  compose up --detach --wait --wait-timeout 120
}

down() {
  compose down --volumes --remove-orphans
}

# Teardown and the stop of the command ignore further signals, so a second
# Ctrl-C cannot cut the removal of the project short.
teardown() {
  trap '' INT TERM HUP
  down
}

# Prints a process and all its descendants, parents first.
process_tree() {
  local child
  echo "$1"
  for child in $(pgrep -P "$1" 2>/dev/null || true); do process_tree "$child"; done
}

# Sends TERM to the command's process tree, waits up to 30 seconds, then
# sends KILL to what is left of it.
stop_command() {
  trap '' INT TERM HUP
  if [ -n "${command_pid:-}" ]; then
    local tree waited=0
    tree="$(process_tree "$command_pid")"
    kill -TERM $tree 2>/dev/null || true
    while kill -0 "$command_pid" 2>/dev/null && [ "$waited" -lt 30 ]; do
      sleep 1
      waited=$((waited + 1))
    done
    kill -KILL $tree 2>/dev/null || true
    wait "$command_pid" 2>/dev/null || true
  fi
  exit "$1"
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
  local postgres nats toxiproxy postgres_route nats_route
  postgres="$(published_address postgres 5432)"
  nats="$(published_address nats 4222)"
  toxiproxy="$(published_address toxiproxy 8474)"
  postgres_route="$(published_address toxiproxy 15432)"
  nats_route="$(published_address toxiproxy 14222)"
  export TASKELITH_POSTGRES_URL="postgres://taskelith:taskelith@$postgres/taskelith"
  export TASKELITH_NATS_URL="nats://$nats"
  export TASKELITH_TOXIPROXY_URL="http://$toxiproxy"
  export TASKELITH_POSTGRES_PROXY_URL="postgres://taskelith:taskelith@$postgres_route/taskelith"
  export TASKELITH_NATS_PROXY_URL="nats://$nats_route"
}

case "$action" in
  up)
    require_docker
    up || { down; exit 1; }
    export_endpoint_urls
    echo "Integration services of project $project are up; export:"
    echo "export TASKELITH_POSTGRES_URL=$TASKELITH_POSTGRES_URL"
    echo "export TASKELITH_NATS_URL=$TASKELITH_NATS_URL"
    echo "export TASKELITH_TOXIPROXY_URL=$TASKELITH_TOXIPROXY_URL"
    echo "export TASKELITH_POSTGRES_PROXY_URL=$TASKELITH_POSTGRES_PROXY_URL"
    echo "export TASKELITH_NATS_PROXY_URL=$TASKELITH_NATS_PROXY_URL"
    ;;
  down)
    down
    ;;
  run)
    if [ "$#" -lt 1 ]; then usage; fi
    require_docker
    trap teardown EXIT
    # Signals become exits, after the command stops, so the EXIT trap runs.
    trap 'stop_command 130' INT
    trap 'stop_command 143' TERM HUP
    up
    export_endpoint_urls
    # In the background, so that a signal interrupts the wait at once.
    "$@" &
    command_pid=$!
    wait "$command_pid"
    ;;
  *)
    echo "services.sh: unknown action $action" >&2
    exit 2
    ;;
esac
