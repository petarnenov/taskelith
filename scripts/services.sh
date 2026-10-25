#!/usr/bin/env bash
# Starts (up), stops (down), or runs a command against (run) one Compose
# project of the integration services; usage: services.sh ACTION PROJECT [CMD]
set -euo pipefail

usage() {
  echo "usage: services.sh up|down PROJECT, or services.sh run PROJECT COMMAND..." >&2
  exit 2
}

if [ "$#" -lt 2 ]; then usage; fi
repository="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="$repository/infra/services/compose.yaml"
action="$1"
project="$2"
shift 2
# A Compose project name, which also names the secrets directory below.
case "$project" in
  ''|*[!a-z0-9_-]*|[!a-z0-9]*)
    echo "services.sh: project must be lowercase letters, digits, '_' or '-'" >&2
    exit 2
    ;;
esac
# Test broker trust and certificates of this project, outside the checkout.
export TASKELITH_SERVICES_SECRETS="${TMPDIR:-/tmp}/taskelith-services/$project"

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
  prepare_secrets
  compose up --detach --wait --wait-timeout 120
}

down() {
  compose down --volumes --remove-orphans
  rm -rf "$TASKELITH_SERVICES_SECRETS"
}

# Test operator, accounts, users (D9 a) and a test CA by the postgres image's
# openssl (O3 c); a running project keeps the secrets its server loaded.
prepare_secrets() {
  local postgres_image
  if [ -f "$TASKELITH_SERVICES_SECRETS/server-cert.pem" ]; then return; fi
  rm -rf "$TASKELITH_SERVICES_SECRETS"
  mkdir -p "$TASKELITH_SERVICES_SECRETS"
  chmod 700 "$TASKELITH_SERVICES_SECRETS"
  node --experimental-strip-types "$repository/scripts/integration-broker.ts" "$TASKELITH_SERVICES_SECRETS"
  postgres_image="$(sed -n 's/^ *image: \(postgres:.*\)$/\1/p' "$compose_file")"
  docker run --rm --user "$(id -u):$(id -g)" --volume "$TASKELITH_SERVICES_SECRETS:/out" \
    --entrypoint sh "$postgres_image" -c "$(test_ca_script)" >/dev/null 2>&1
}

test_ca_script() {
  cat <<'SCRIPT'
set -e
cd /out
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
  -subj "/CN=Taskelith test CA" -keyout ca-key.pem -out ca.pem
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -subj "/CN=localhost" -keyout server-key.pem -out server.csr
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\n' > server.ext
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
  -days 3650 -extfile server.ext -out server-cert.pem
rm -f ca-key.pem server.csr server.ext ca.srl
chmod 600 server-key.pem
SCRIPT
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
    echo "export TASKELITH_SERVICES_SECRETS=$TASKELITH_SERVICES_SECRETS"
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
