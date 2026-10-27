## Why

G2 work item 25, `run-g2-native-worker-acceptance` ([docs/g2-plan.md](../../../docs/g2-plan.md)), runs item 24's scenarios and the other G2 rows of the [native acceptance gates](../../../docs/worker-platforms.md#native-acceptance-gates) on each matrix entry that D11 selects, recording OS, architecture, file system, and versions, while rows that depend on later gates stay open. The coordinator split the item: 25a (`harden-worker-container-seccomp`) decided the worker container's seccomp profile, and 25b (`run-g2-native-acceptance-arm64`) added the acceptance runner and ran the two arm64 entries; both are archived. 25c, the macOS x86_64 run on the iMac, belongs to another worker. 25b ran the Linux entry only under Docker Desktop, in a Linux VM with the `linuxkit` kernel. This change runs the Linux entry on a real native Linux host, so that the native kernel, cgroup v2, and Docker Engine are observed.

## What Changes

- **Evidence run.** `make native-acceptance` runs the Linux entry, `linux-ubuntu-24.04-x86_64`, on a native Ubuntu x86_64 host with Docker Engine, and records its eight proofs into this change's `results.jsonl`.
- **Seccomp check on x86_64.** `make scenario-worker-namespace-confinement`, the 25a scenario that 25a assigns to the x86_64 iMac, also runs on the same host and is recorded with the run.
- **Records.** This change directory carries `results.jsonl` and `acceptance.md`, the table of rows, proofs, outcomes, and open reasons for this host, labelled as native-host evidence, which `close-g2` cites.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change is evidence only and has no spec delta.

## Impact

Only this change directory: `results.jsonl`, `acceptance.md`, and the OpenSpec artifacts. No product code, runner, test, script, `make` target, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, document, or npm dependency changes. A proof that fails is reported to the coordinator as a candidate defect, not fixed here. The commits use `test` or `docs`.
