#!/usr/bin/env bash
# Builds the worker-harnesses variant for each platform in PLATFORMS and runs
# the credential-free steps in it. usage: harness-qualification.sh OUT
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: harness-qualification.sh OUT" >&2
  exit 2
fi
repository="$(cd "$(dirname "$0")/.." && pwd -P)"
read -r -a platforms <<< "${PLATFORMS:-linux/amd64 linux/arm64}"
if [ "${#platforms[@]}" -eq 0 ]; then
  echo "harness-qualification.sh: PLATFORMS names no platform" >&2
  exit 2
fi
for platform in "${platforms[@]}"; do
  case "$platform" in
    linux/amd64|linux/arm64) ;;
    *)
      echo "harness-qualification.sh: unsupported platform '$platform'" >&2
      exit 2
      ;;
  esac
done
for name in TASKELITH_UBUNTU_BASE TASKELITH_NODE_VERSION TASKELITH_NODE_SHA256_AMD64 TASKELITH_NODE_SHA256_ARM64; do
  if [ -z "${!name:-}" ]; then
    echo "harness-qualification.sh: set $name (run through make qualify-harnesses)" >&2
    exit 2
  fi
done
# OUT is checked before it is created, so a refused path leaves nothing.
if [ -e "$1" ]; then
  out="$(cd "$1" && pwd -P)"
else
  out="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
fi
case "$out/" in
  "$repository/"*)
    echo "harness-qualification.sh: OUT must be outside the worktree" >&2
    exit 2
    ;;
esac
mkdir -p "$out"

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

build_variant() {
  local context="$1" platform="$2" image="$3"
  docker build --quiet --platform "$platform" --file "$context/infra/installation/Dockerfile" \
    --target worker-harnesses --tag "$image" --build-arg BASE="$TASKELITH_UBUNTU_BASE" \
    --build-arg NODE_VERSION="$TASKELITH_NODE_VERSION" \
    --build-arg NODE_SHA256_AMD64="$TASKELITH_NODE_SHA256_AMD64" \
    --build-arg NODE_SHA256_ARM64="$TASKELITH_NODE_SHA256_ARM64" "$context" >/dev/null
}

describe_run() {
  local context="$1" platform="$2" image="$3" tree="$4" id engine input hash
  id="$(docker image inspect --format '{{.Id}}' "$image")" || return 1
  engine="$(docker version --format '{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}')" || return 1
  echo "platform: $platform"
  echo "image-id: $id"
  echo "base: $TASKELITH_UBUNTU_BASE"
  echo "tree: $tree"
  echo "engine: $engine"
  for input in infra/installation/Dockerfile infra/installation/harnesses/package.json \
    infra/installation/harnesses/package-lock.json infra/installation/harnesses/qualify.sh \
    scripts/harness-qualification.sh; do
    hash="$(sha256_of "$context/$input")" && [ -n "$hash" ] || return 1
    echo "sha256 $input: $hash"
  done
  echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# Runs the steps once; the generated schema files are hashed in steps.txt.
qualify() {
  local context="$1" platform="$2" image="$3" result="$4" container status=0
  container="$(docker create --platform "$platform" --network none \
    --volume "$context/infra/installation/harnesses/qualify.sh:/qualify.sh:ro" \
    --entrypoint bash "$image" /qualify.sh)"
  docker start --attach "$container" > "$result/steps.txt" || status=$?
  docker cp "$container:/tmp/qualify-listings/." "$result/" || status=1
  docker diff "$container" > "$result/changes.txt" || status=1
  sed -i.all '\| /var/lib/taskelith/qualify-home/schema/|d' "$result/changes.txt" || status=1
  rm -f "$result/changes.txt.all"
  diff "$result/before.txt" "$result/after.txt" > "$result/listing-changes.txt" || :
  docker rm "$container" >/dev/null
  find_credentials "$platform" "$image" > "$result/credential-files.txt" || status=1
  if [ -s "$result/credential-files.txt" ]; then status=1; fi
  return "$status"
}

# Searches the whole image as root for the harnesses' credential files.
find_credentials() {
  docker run --rm --platform "$1" --network none --user root --entrypoint find "$2" \
    / -xdev \( -name auth.json -o -name .credentials.json \) -print
}

# A failed platform is recorded in error.txt, and the others still run.
run_platform() {
  local context="$1" tree="$2" platform="$3" image result status=0
  image="taskelith-worker-harnesses:qualify-${platform#linux/}"
  result="$out/${platform#linux/}"
  rm -rf -- "$result"
  mkdir -p "$result"
  if ! build_variant "$context" "$platform" "$image" 2> "$result/error.txt"; then
    echo "harness-qualification.sh: $platform build failed, see $result/error.txt" >&2
    return 1
  fi
  qualify "$context" "$platform" "$image" "$result" 2> "$result/error.txt" || status=$?
  describe_run "$context" "$platform" "$image" "$tree" > "$result/image.txt" || status=1
  docker image rm "$image" >/dev/null
  if [ "$status" -ne 0 ]; then
    echo "harness-qualification.sh: $platform steps failed ($status), see $result" >&2
    return 1
  fi
  rm -f "$result/error.txt"
  echo "harness-qualification.sh: $platform done, see $result"
}

# The build context holds only tracked files, as in scripts/installation.sh.
main() (
  local context tree platform failed=0
  context="$(mktemp -d)"
  trap 'rm -rf "$context"' EXIT
  tree="$(git -C "$repository" stash create)"
  tree="${tree:-$(git -C "$repository" rev-parse HEAD)}"
  git -C "$repository" archive --format=tar "$tree" | tar -xf - -C "$context"
  for platform in "${platforms[@]}"; do
    run_platform "$context" "$tree" "$platform" || failed=1
  done
  exit "$failed"
)

main
