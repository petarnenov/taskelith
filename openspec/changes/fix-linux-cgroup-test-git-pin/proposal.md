## Why

The Linux test image of `make verify-linux-cgroup`, built from `tools/linux-cgroup/Dockerfile`, has no `/usr/bin/git`. Since `wire-git-workspace-into-worker` (#409, merge `62217e7a`) the worker, also the one that the crash-window and G2 scenario harnesses compose, checks its Git client (`apps/worker/src/workspace-composition.ts:53`) against the Linux pin `GIT_CLIENT_PINS.linux` (`packages/modules/workspace/src/domain/git-client.ts:14`), `git version 2.43.0`, so it refuses to start with `git-client-mismatch`, and `make verify-linux-crash-windows` fails every case on `dev` `163fe9e5`. These Linux targets run outside `make verify`, so the failure went unnoticed until a Linux run was needed for 11c (`require-existing-project-for-runs`, #439), whose verification left them as a remaining gate.

## What Changes

- `tools/linux-cgroup/Dockerfile` installs the pinned package `git=1:2.43.0-1ubuntu7.4` through `ARG GIT_PACKAGE_VERSION`, with the same `dpkg-query` and `git --version` build checks as the worker stage of `infra/installation/Dockerfile`. Both images build on `UBUNTU_BASE` of the `Makefile`, Ubuntu 24.04 (noble).
- A new test, `test/git-package-pin.test.ts`, checks that both Dockerfiles pin the same package version and check the version string of `GIT_CLIENT_PINS.linux`, so the two pins cannot drift apart.
- No change to the Git client pin or to the worker.

## Capabilities

### New Capabilities

### Modified Capabilities

None. No behavior description changes: the `native-worker-acceptance` requirement "Linux test image per architecture" and the `git-workspace-port` requirements on the worker image's Git package stay true as written, and the change makes the opt-in Linux targets run again, so it sets `skip_specs: true`.

## Impact

Test tooling outside the published package: the image of `make verify-linux-cgroup`, `make verify-linux-crash-windows`, `make verify-linux-g2-scenarios`, and `make linux-test-suites` now holds the pinned Git client, and its build needs the Ubuntu package mirror. `make verify` gains the agreement test.
