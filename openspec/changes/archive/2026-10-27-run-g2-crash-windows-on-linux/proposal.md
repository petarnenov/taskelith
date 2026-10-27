## Why

The G2 crash window and duplicate delivery scenarios of item 24b (`run-g2-crash-windows`, archived on 2026-10-26) run only on macOS: on Linux the composed worker needs a delegated cgroup, an execution account, and the privileges to use them, and the only container that has them, the one of `make verify-linux-cgroup`, has no network for the `make` services. The coordinator assigned `run-g2-crash-windows-on-linux` on 2026-10-27 to run the same scenarios on Linux, chose option B (the privileged Linux test image with network to the services), and bound the Linux expectations to section 6 of the [supervisor identity contract](/docs/contracts/supervisor-identity.md).

## What Changes

- **Make target.** `make verify-linux-crash-windows` builds the workspace and the Linux test image, starts its own `make` services, and runs `apps/control-plane/test/crash-windows.integration.test.ts` in the image, privileged, with a private cgroup namespace and the host network, so the services' `127.0.0.1` URLs hold. `TASKELITH_TEST_SEED`, `TASKELITH_SCENARIO_RESULTS`, and `PATTERN` work as in the other opt-in targets. It stays out of `make verify`.
- **Container layout.** The image's cgroup layout moves into `tools/linux-cgroup/cgroup-layout.sh`, which `verify-linux-cgroup` keeps using: every process in `init/`, the containment parent `executions/` beside it. A new entry point sets the Linux launch settings (`TASKELITH_CONTAINMENT_PARENT`, `TASKELITH_EXECUTION_UID`, `TASKELITH_EXECUTION_GID`) to `executions/` and the image's `taskelith-exec` account (uid and gid 2000).
- **Harness.** The scenarios run on macOS as before and on Linux only when those three settings are present, so a plain `make verify` on Linux still skips them, now with a reason that names the target. On Linux the harness passes the settings to the composed worker, the armed supervisor gets the containment parent as CP4 passes it, and the scripted child, which runs as the execution account, can reach its release file and append to the spawn and order traces.
- **Linux expectations.** CP7 to CP9 expect the Linux rows of section 6: an empty containment ends the execution with an exit of unknown status (CP7, start unproven), and a populated one is adopted until it empties, then exits unknown (CP8 start unproven, CP9 start proven). Every other window keeps its outcome.
- **Commit of a record.** The container has no git metadata, so the scenario recorder takes the commit from `TASKELITH_SCENARIO_COMMIT` when set, which the target reads from the checkout.
- **Evidence.** `results.jsonl` of a run with seed `2776760789`. CP9 fails: after its unknown exit the control plane opens an automatic retry. It is recorded as candidate defect L1 and not fixed here; by the coordinator's decision CP9 on Linux is an expected failure matched on L1's signature, as 24b did for D1, until the separate change `stop-automatic-retry-of-unknown-exit` fixes L1 and removes it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `g2-failure-scenarios`: "Supervisor window crash recovery" gains the Linux scenarios of CP7, CP8, and CP9, and "Crash scenario records" runs the scenarios on Linux through the make target instead of skipping them there.

## Impact

`docs/local-installation.md` gains the new target. Tests of `apps/control-plane` (the scenario file, its composition, and the worker fixture), `packages/testing` (`TASKELITH_SCENARIO_COMMIT`), the Makefile, `scripts/linux-crash-windows.sh`, and `tools/linux-cgroup`. No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or dependency changes. The commits use `test`, `build`, or `docs`.
