## Why

Change `fix-launch-recovery-reauthorization` (D1) lets a launch request report a sealed execution in `reportsNotStartedFor`, so the authority records its `not-started` before the ownership rule even when the observation has not reached it. The worker reports only the intent's last sealed execution. Its design named the gap ("Risks", follow-up candidate): after a runtime seal (a grant past its deadline, a failed preparation, or a supervisor's seal) a single crash between the relaunch's W2 and its request leaves two sealed executions. The next start reports only the newer one, which the authority never granted, so the older, still `authorized` owner rejects the launch with the final `execution-conflict`. A startup double fault (crash after a grant, restart seals it, crash again before the next request) ends the same way. The coordinator scoped this change to report every unconfirmed sealed execution.

## What Changes

- **Contract.** `reportsNotStartedFor` becomes a list of 1 to 8 `SealedExecution` entries, oldest first, replacing the unreleased single object; `execution.openapi.json` declares the breaking change as 0.4.0. Launch authorization section 4 applies the entries in order in the deciding transaction, each with D1's rules, and a longer list is `invalid`; sections 10 and 11 follow. Worker journal section 5 defines an unconfirmed sealed execution and reports all of them.
- **Domain.** `authorizeLaunch` applies each entry in order (`recordReportedSeals`); the first conflicting entry rejects the request with `execution-conflict` and records none. `REPORTED_SEALS_LIMIT` is 8. `unconfirmedSealedExecutions` replaces `lastSealedExecution`.
- **Control plane.** `launch-wire.ts` parses the list and refuses an empty one or one over the limit as `invalid`.
- **Worker.** `Launch.#nextExecution` reports `unconfirmedSealedExecutions` for every new or resumed execution.
- **Evidence.** Two crash windows: one crash after a runtime seal, and the startup double fault; both fail on the base code.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `launch-authorization`: "Execution ownership" accepts a list of reported seals, applied in order, at most 8.
- `worker-runtime`: "Journaled launch authorization" reports every unconfirmed sealed execution; "Start reconciliation" covers the double fault on start.

## Impact

- `packages/modules/execution`: `launch-authorization.ts`, `journal-recovery.ts`, `index.ts`. `apps/control-plane`: `api/launch-wire.ts`. `apps/worker`: `launch-orchestrator.ts`.
- `packages/contracts/documents/execution.openapi.json` 0.4.0; `docs/contracts/launch-authorization.md`, `docs/contracts/worker-journal.md`, `docs/contracts/execution-wire-contracts.md`.
- Tests in the execution module, the worker, the control plane, and the crash-window harness (`crash-windows.integration.test.ts` and its fixtures).
- No journal format change and no new dependency. The changed workspaces are not bundled in the published `taskelith` package, so the commits are `chore`, `test`, and `docs`.
- Upgrade order as in D1: the control plane before its workers, or both together.
