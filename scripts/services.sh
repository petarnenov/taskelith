#!/usr/bin/env bash
# Starts (up), stops (down), or runs a command against (run) one Compose
# project of the integration services; usage: services.sh ACTION PROJECT [CMD]
set -euo pipefail

compose_file="$(dirname "$0")/../infra/services/compose.yaml"
action="$1"
project="$2"
shift 2

compose() {
  docker compose --file "$compose_file" --project-name "$project" "$@"
}

up() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not available. Start Docker; make verify needs it for the integration services." >&2
    exit 1
  fi
  compose up --detach --wait --wait-timeout 120 || { compose down --volumes; exit 1; }
}

down() {
  compose down --volumes --remove-orphans
}

# The host ports are ephemeral, so the URLs are read back from Compose.
endpoint_urls() {
  echo "TASKELITH_POSTGRES_URL=postgres://taskelith:taskelith@$(compose port postgres 5432)/taskelith"
  echo "TASKELITH_NATS_URL=nats://$(compose port nats 4222)"
}

case "$action" in
  up)
    up
    echo "Integration services of project $project are up; export:"
    endpoint_urls | sed 's/^/export /'
    ;;
  down)
    down
    ;;
  run)
    up
    trap down EXIT
    env $(endpoint_urls) "$@"
    ;;
  *)
    echo "services.sh: unknown action $action" >&2
    exit 2
    ;;
esac
