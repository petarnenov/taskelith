## Why

G2 work item 25, `run-g2-native-worker-acceptance` ([docs/g2-plan.md](../../../docs/g2-plan.md)), runs item 24's scenarios and the other G2 rows of the [native acceptance gates](../../../docs/worker-platforms.md#native-acceptance-gates) on each matrix entry that D11 selects, recording OS, architecture, file system, and versions, while rows that depend on later gates stay open. The coordinator split the item: 25a decided the worker container's seccomp profile; 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/proposal.md)) added the acceptance runner and its records and ran the two arm64 entries; 25c, this change, runs the same runner unchanged on the 2020 Intel iMac for the two x86_64 entries, `macos-26-x86_64` natively and `linux-ubuntu-24.04-x86_64` in the worker image under Docker Desktop for x86_64.

## What Changes

- **Evidence run.** `make native-acceptance RESULTS=openspec/changes/run-g2-native-acceptance-x86-64/results.jsonl` on the iMac runs the macOS entry natively and the Linux entry under Docker Desktop, recording every proof through the harness's scenario recorder with its acceptance context.
- **Evidence.** This change directory carries `results.jsonl` of the x86_64 runs and `acceptance.md`, the table of rows, entries, proofs, outcomes, and open reasons that `close-g2` cites, in the form of 25b's table.
- **Open rows stay open.** Rows and parts of rows that depend on later G2 work (24c) or later gates (G3, G6) are recorded as open, as in 25b.
- **Failures are reported, not fixed.** A proof that fails on anything but a known, cited defect is a candidate defect, reported to the coordinator with its record; this change does not fix it.
- **Runner fix.** `scripts/native-acceptance.sh` builds the checkout before it draws the seed, because `scripts/native-acceptance.ts` imports the built harness; on a worktree that was not built, the run failed with `ERR_MODULE_NOT_FOUND` before any proof. The build moves from the macOS entry to the start of the run, with a runner test of the order. Found in this change's preflight; the coordinator placed the fix in 25c.
- **Namespace confinement extra.** `make scenario-worker-namespace-confinement` (item 25a) runs after the acceptance run as a recorded extra on the Linux x86_64 entry, into the same `results.jsonl`.
- **Documents.** After the run, the platform documents that name only arm64 evidence (`docs/worker-platforms.md`, `docs/local-installation.md`, the Ubuntu register row in `docs/dependencies.md`) gain the x86_64 observations, without claiming more than the records show. The seccomp line of `docs/local-installation.md` already cites 25a's x86_64 confinement evidence; 25c's run is appended after it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The run exercises the existing requirements of `native-worker-acceptance` ("Native acceptance runner", "Matrix entry detection", "Acceptance table") without changing them, so the change sets `skip_specs: true` and adds no `specs/` files.

## Impact

This change directory, the three documents named above, `scripts/native-acceptance.sh`, and `test/native-acceptance-runner.test.ts`. No product code, Makefile target, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or npm dependency changes. The commits use `chore` for the runner fix, which is outside the published package, and `docs` for the rest.
