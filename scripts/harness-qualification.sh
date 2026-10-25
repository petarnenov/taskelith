#!/usr/bin/env bash
# Builds the worker-harnesses variant for each platform in PLATFORMS and runs
# the credential-free steps in it. usage: harness-qualification.sh OUT
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: harness-qualification.sh OUT" >&2
  exit 2
fi
repository="$(cd "$(dirname "$0")/.." && pwd)"
out="$1"
read -r -a platforms <<< "${PLATFORMS:-linux/amd64 linux/arm64}"
for name in TASKELITH_UBUNTU_BASE TASKELITH_NODE_VERSION TASKELITH_NODE_SHA256_AMD64 TASKELITH_NODE_SHA256_ARM64; do
  if [ -z "${!name:-}" ]; then
    echo "harness-qualification.sh: set $name (run through make qualify-harnesses)" >&2
    exit 2
  fi
done

build_variant() {
  local context="$1" platform="$2" image="$3"
  docker build --quiet --platform "$platform" --file "$context/infra/installation/Dockerfile" \
    --target worker-harnesses --tag "$image" --build-arg BASE="$TASKELITH_UBUNTU_BASE" \
    --build-arg NODE_VERSION="$TASKELITH_NODE_VERSION" \
    --build-arg NODE_SHA256_AMD64="$TASKELITH_NODE_SHA256_AMD64" \
    --build-arg NODE_SHA256_ARM64="$TASKELITH_NODE_SHA256_ARM64" "$context" >/dev/null
}

# Runs the steps once, then lists every path the run changed in the image.
qualify() {
  local context="$1" platform="$2" image="$3" result="$4" container
  container="$(docker create --platform "$platform" --network none \
    --volume "$context/infra/installation/harnesses/qualify.sh:/qualify.sh:ro" \
    --entrypoint bash "$image" /qualify.sh)"
  docker start --attach "$container" > "$result/steps.txt"
  # The generated schema files are a step's output, hashed in steps.txt.
  docker diff "$container" | grep -v ' /var/lib/taskelith/qualify-home/schema/' > "$result/changes.txt"
  docker rm "$container" >/dev/null
  {
    echo "platform: $platform"
    echo "image-id: $(docker image inspect --format '{{.Id}}' "$image")"
    echo "base: $TASKELITH_UBUNTU_BASE"
    echo "revision: $(git -C "$repository" rev-parse HEAD)"
    echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$result/image.txt"
}

# The build context holds only tracked files, as in scripts/installation.sh.
main() (
  local context revision platform image result
  context="$(mktemp -d)"
  trap 'rm -rf "$context"' EXIT
  revision="$(git -C "$repository" stash create)"
  git -C "$repository" archive --format=tar "${revision:-HEAD}" | tar -xf - -C "$context"
  for platform in "${platforms[@]}"; do
    image="taskelith-worker-harnesses:qualify-${platform#linux/}"
    result="$out/${platform#linux/}"
    mkdir -p "$result"
    build_variant "$context" "$platform" "$image"
    qualify "$context" "$platform" "$image" "$result"
    docker image rm "$image" >/dev/null
    echo "harness-qualification.sh: $platform done, see $result"
  done
)

main
