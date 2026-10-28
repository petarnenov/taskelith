## Why

G3 item 43 (`docs/g3-plan.md`) carries the G2 native acceptance rows that ADR 0015 defers to G3. On Linux, the system-level cancellation part (start, cancel, and result races, disconnected workers, stale generations) and the connectivity part (partition and reconnect, stale writes) of the Cancellation and Connectivity (G2) rows are open on every entry: the 24c scenarios ran only through the test-side process-group launch host (`test/g2-scenarios/process-group-supervision.ts`), not through the worker's Linux cgroup supervisor, and `make native-acceptance` does not run them. This change closes the Linux x86_64 parts of item 43; the item stays open.

## What Changes

- The worker's Linux launch host `supervisionHost` moves from `apps/worker/src/main.ts` to `apps/worker/src/execution-supervision.ts` and is exported, so that the G2 scenario workers can compose it.
- When the delegated cgroup and the execution account are set, the scenario workers (`ScenarioWorker`, and through it the crash-before-ack fixture) launch through that host, each under its own containment parent; otherwise they keep the process-group launch host. The privileged runner requires that launch, so a missing or partial one fails the scenario files instead of falling back. A guard checks that the scripted process of race h, and of race c when its cancel lands after the start, runs in a containment directly below its worker's own containment parent. The cancel signal that `assertCancelled` expects in races b, c, e, and f is `SIGKILL` under the cgroup supervisor and `SIGTERM` otherwise.
- The Linux launch settings and the execution account admission of the crash-window harness move to `@taskelith/testing` and serve both harnesses.
- The privileged runner of `make verify-linux-crash-windows` accepts test files and forwards the Toxiproxy URLs; the new opt-in target `make verify-linux-g2-scenarios` runs the races, stale generations, and partitions through it. `make verify-linux-crash-windows` behaves as before.
- The Linux entry of `make native-acceptance` gains the proofs `acceptance-cancellation-races` (cancellation) and `acceptance-partition` (connectivity), not applicable off Linux.
- Evidence: two seeded `make native-acceptance ENTRIES=linux` runs on this native Ubuntu x86_64 host, recorded in `results.jsonl` and `acceptance.md`.
- Docs: `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 rows of `docs/g3-plan.md`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `native-worker-acceptance`: adds "Linux cancellation and connectivity scenarios in native acceptance".
- `g2-failure-scenarios`: adds "Scenarios through the Linux cgroup supervisor" and modifies "Cancel after W4" (the cancel signal per launch host).

## Impact

Test tooling and one move of product code without a behavior change: `apps/worker/src/main.ts`, `apps/worker/src/execution-supervision.ts`, and its index export; `packages/testing` (private); the G2 scenario helpers and race file; `apps/control-plane/test/harness-composition.ts`; `scripts/native-acceptance.sh`, `scripts/linux-crash-windows.sh`, `tools/linux-cgroup/crash-windows.sh`, and the `Makefile`. No published package content changes. Item 43's macOS rows, the `macos-26-arm64` re-run, and the `linux-ubuntu-24.04-arm64` entry stay open.
