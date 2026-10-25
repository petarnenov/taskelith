## Why

Every recorded run of `make doctor`, `make setup`, and `make verify` so far was on macOS. The Docker integration services (PostgreSQL, NATS, and Toxiproxy through `scripts/services.sh` and isolated Compose projects), the Linux-specific tests, and the opt-in target `make verify-linux-cgroup` had not been observed on a Linux host. The coordinator (Niki) assigned this observation on 2026-10-25.

## What Changes

- Run `make doctor`, `make setup`, `make verify`, and `make verify-linux-cgroup` on an x86_64 Ubuntu 24.04 host, from a fresh worktree of `origin/dev`.
- Add `docs/linux-verify-observation.md` with the host environment, the results and timing of each target, and each failure with its output and cause.
- Link the record from the readiness ledger in `docs/foundation.md`.

Failures are recorded and reported to the coordinator; this change fixes no product code, script, or test.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The change records observed evidence and adds no requirement or behavior; the existing `development-environment` requirements define what the targets must do. It is documentation only, so `.openspec.yaml` sets `skip_specs: true`.

## Impact

Documentation only. No product code, dependency, or tooling changes.
