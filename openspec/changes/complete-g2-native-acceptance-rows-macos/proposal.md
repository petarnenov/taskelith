## Why

G3 item 43 (`docs/g3-plan.md`) carries the G2 native acceptance rows that ADR 0015 defers to G3. `complete-g2-native-acceptance-rows` closed its Linux x86_64 parts on the native Linux host. On macOS, the system-level cancellation part (start, cancel, and result races, disconnected workers, stale generations) and the connectivity part (partition and reconnect, stale writes) of the Cancellation and Connectivity (G2) rows are still open, and cancellation race g, an adopting macOS supervisor that ignores a cancel, has no record: the 24c scenario files skip outside Linux (`SCENARIO_HOST`), because their workers compose the test-side process-group launch host, which reads `/proc`. This change takes the `macos-26-x86_64` parts, run on the coordinator's 2020 Intel iMac; the item stays open.

## What Changes

- Under `TASKELITH_MACOS_SCENARIOS=1` on macOS the scenario workers (`ScenarioWorker`, and through it the crash-before-ack fixture) launch through the worker's own launch host, `supervisionHost`, which composes the macOS supervisor there, with the worker's own admission check and volume probe. The variable set off macOS fails the scenario files; without it `make verify` on macOS still skips them.
- A guard checks that the scripted process of race h, and of race c when its cancel lands after the start, is a child of a launch supervisor of its own worker. The leftover process listing reads `ps` on macOS, which has no `/proc`.
- Race g runs through the macOS supervisor: it kills the launching supervisor, lets the worker adopt, cancels, and checks the not-applied evidence, the child that keeps running, and the `uncertain` execution left for reconciliation; it stays skipped on every other launch host.
- The new opt-in target `make verify-macos-g2-scenarios` runs the three 24c files that way against its own services; the macOS entry of `make native-acceptance` gains the proofs `acceptance-cancellation-races` and `acceptance-partition` through it.
- Evidence: two seeded `make native-acceptance ENTRIES=macos` runs on this host, recorded in `results.jsonl` and `acceptance.md`.
- Docs: `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 row of `docs/g3-plan.md`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `g2-failure-scenarios`: adds "Scenarios through the macOS supervisor" and "Adoption cancel scenario", modifies "Cancel after W4" (the cancel signal under the macOS supervisor), and removes "Adoption cancel scenario on Linux", whose Linux skip becomes a scenario of "Adoption cancel scenario".
- `native-worker-acceptance`: adds "macOS cancellation and connectivity scenarios in native acceptance".

## Impact

Test tooling only: the G2 scenario helpers (`test/g2-scenarios/scenario-launch.ts`, `scenario-worker.ts`, `scenario-run.ts`, `leftover-processes.ts`), the race file and the launch unit tests, `scripts/native-acceptance.sh` and its runner tests, and the `Makefile`. No product code and no published package content changes. Out of scope, and open under item 43: `macos-26-arm64` with its process ownership re-run, which needs the owner's physical access to the MacBook Air; `linux-ubuntu-24.04-arm64`; and the hosted `ubuntu-24.04` re-dispatch.
