## Why

Worker step 3 of `docs/agent-task-protocol.md` lists the commit types for private work as `chore`, `build`, `docs`, and `test`, while the release table in `docs/releases.md` now also names `ci:` as a no-release type. The release table also omits the two other patch triggers of the commit analyzer's default rules, `perf:` and a revert, which the change `list-build-commits-in-release-table` found and left out of its scope.

## What Changes

- Add `ci` to the private-work commit types in worker step 3, and name `perf` and a revert with `feat` and `fix` as the types reserved for the published package, because they trigger a release.
- Add `perf:` and a revert to the release table in `docs/releases.md`, each as a patch release.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only, under the existing `automated-releases` and `agent-task-protocol` requirements, so `.openspec.yaml` sets `skip_specs: true`. The release configuration is unchanged.
