#!/usr/bin/env bash
# Serves the web SPA on localhost against an installation's control plane;
# usage: web-dev.sh PROJECT. The CA copy and dev TLS key are temporary files.
set -euo pipefail

project="${1:?usage: web-dev.sh PROJECT}"
openssl_version="$(openssl version)"
case "$openssl_version" in
  "OpenSSL "[3-9].*|"OpenSSL "[1-9][0-9].*) ;;
  *)
    echo "make web-dev needs OpenSSL 3.0 or later (found: $openssl_version)" >&2
    exit 1
    ;;
esac
dir="$(mktemp -d "${TMPDIR:-/tmp}/taskelith-web-dev.XXXXXX")"
trap 'rm -rf "$dir"' EXIT

bash scripts/installation.sh installation-ca "$project" > "$dir/ca.pem"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost \
  -keyout "$dir/dev.key" -out "$dir/dev.crt"
TASKELITH_WEB_DEV_CA="$dir/ca.pem" TASKELITH_WEB_DEV_TLS_CERT="$dir/dev.crt" \
  TASKELITH_WEB_DEV_TLS_KEY="$dir/dev.key" npm run dev --workspace=@taskelith/web
