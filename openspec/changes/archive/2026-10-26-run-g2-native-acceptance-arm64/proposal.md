## Why

G2 work item 25, `run-g2-native-worker-acceptance` ([docs/g2-plan.md](/docs/g2-plan.md)), runs item 24's scenarios and the other G2 rows of the [native acceptance gates](/docs/worker-platforms.md#native-acceptance-gates) on each matrix entry that D11 selects, recording OS, architecture, file system, and versions, while rows that depend on later gates stay open; [ADR 0007](/docs/decisions/0007-g0-closure.md) deferred that acceptance to G2. The coordinator split the item: 25a (`harden-worker-container-seccomp`) decided the worker container's seccomp profile; 25b, this change, adds the acceptance runner and its records and runs the two arm64 entries, macOS 26 on Apple Silicon natively and Linux arm64 in the worker image under Docker; 25c runs the same runner on the x86_64 iMac for macOS x86_64 and Linux x86_64.

## What Changes

- **Acceptance runner.** `make native-acceptance RESULTS=<file>` detects the host's matrix entries (macOS 26 natively; the Linux entry in the worker image under the host's Docker), runs the proofs of the G2 rows on each, every proof even after a failure, and records each through the harness's scenario recorder. Nothing is assumed about the architecture, so 25c runs it unchanged on x86_64.
- **Acceptance context in the records.** The recorder gains an optional `acceptance` field, read from `TASKELITH_ACCEPTANCE`: the matrix entry, the acceptance row, the proof's command, and the platform (OS, architecture, kernel, file system, Node.js, Docker). Two targets join the existing two: `host-test-suite` (node:test suites run on the host) and `linux-test-container` (the suites in the Linux test image). Existing records and callers keep working.
- **Minimal new proofs.** `make scenario-worker-lifecycle` (install, start, stop, and restart of the Linux worker container with its volume and execution account), `make scenario-native-worker-lifecycle` (the same for a native worker of this host), and journal tests for data roots with spaces and case-variant paths on a case-insensitive volume.
- **Linux tests on every architecture.** `make verify-linux-cgroup` builds its test image with the Node.js tarball of the Docker host's architecture instead of refusing arm64, and `make linux-test-suites` runs test suites unprivileged in that image.
- **Evidence.** This change directory carries `results.jsonl` of the arm64 runs and `acceptance.md`, the table of rows, entries, proofs, outcomes, and open reasons that `close-g2` cites.

## Capabilities

### New Capabilities

- `native-worker-acceptance`: the acceptance runner, its records, the lifecycle scenarios, and the acceptance table of the G2 native acceptance rows.

### Modified Capabilities

- `deterministic-test-harness`: scenario result records accept two more targets and an optional acceptance context.

## Impact

`@taskelith/testing` (the recorder) and its tests; `scripts/native-acceptance.sh` and `scripts/native-acceptance.ts` with tests; two scenarios in `scripts/installation-scenarios.sh` and `scripts/installation.sh` with stub tests; a journal test file; `tools/linux-cgroup/`; the `make` targets `native-acceptance`, `linux-test-image`, `linux-test-suites`, `scenario-worker-lifecycle`, `scenario-native-worker-lifecycle`, and `verify-linux-cgroup`; `docs/local-installation.md`, `docs/worker-platforms.md`, and the register row of the Ubuntu image in `docs/dependencies.md`. No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or npm dependency changes. A product defect found by a proof is recorded, not fixed. The commits use `test`, `build`, `chore`, or `docs`.
