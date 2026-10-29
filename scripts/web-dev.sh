#!/usr/bin/env bash
# Serves the web SPA on localhost against an installation's control plane;
# usage: web-dev.sh PROJECT. The CA copy and dev TLS key are temporary files.
set -euo pipefail

project="$1"
dir="$(mktemp -d "${TMPDIR:-/tmp}/taskelith-web-dev.XXXXXX")"
trap 'rm -rf "$dir"' EXIT

bash scripts/installation.sh installation-ca "$project" > "$dir/ca.pem"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout "$dir/dev.key" -out "$dir/dev.crt" 2>/dev/null
TASKELITH_WEB_DEV_CA="$dir/ca.pem" TASKELITH_WEB_DEV_TLS_CERT="$dir/dev.crt" \
  TASKELITH_WEB_DEV_TLS_KEY="$dir/dev.key" npm run dev --workspace=@taskelith/web
