## Why

The crash-window scenarios of G2 item 24b found defect D1. After a crash past W2 or W3, startup recovery seals execution E1, journals `not-started`, and continues the launch with a new execution E2 ([worker journal contract](../../../docs/contracts/worker-journal.md) section 5). E1's `execution.not-started` may still be in the outbox or on the broker, so the launch authority still sees E1 `authorized` as the attempt's owner. The ownership rule ([launch authorization contract](../../../docs/contracts/launch-authorization.md) section 4) authorizes only the same execution again, so E2 is rejected with `execution-conflict`, which is final: the worker journals `rejected-final` and the launch never resumes. The worker's runtime relaunch after a seal (a grant past its deadline, a failed preparation, or a supervisor's own seal) has the same race. The owner's delegate decided option (b) in away run `20261026T161148Z-opencode-90873`: the request reports the sealed execution, and the authority applies its `not-started` first, in the same transaction.

## What Changes

- **Contract.** `LaunchAuthorizationRequest` gets an optional, additive `reportsNotStartedFor { executionId, operationId }` (`execution.openapi.json`, schema `SealedExecution`). Launch authorization section 4 adds the reported-seal rule, section 9 maps its refusals to the existing `execution-conflict`, and the worker journal section 5 "continue the launch" row reports the sealed execution.
- **Domain.** `authorizeLaunch` applies a reported seal to the task before the ownership rule: an `authorized` execution of the request's attempt and worker moves to `not-started`; one already `not-started`, or never granted, changes nothing; anything else is `execution-conflict`. No new rejection reason.
- **Control plane.** `launch-wire.ts` maps the optional field; the deciding transaction stores the sealed execution and the new grant in one task write.
- **Worker.** Every new execution of a launch, whether continued on start or relaunched at runtime, reports the intent's last `not-started` execution from the journal, with its last granted operation, else its last one (`lastSealedExecution`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `launch-authorization`: "Execution ownership" accepts a reported seal, recorded first in the deciding transaction.
- `worker-runtime`: "Journaled launch authorization" and "Start reconciliation" report the sealed execution with the next one.

## Impact

- `packages/modules/execution`: `launch-authorization.ts` (`LaunchRequest.reportsNotStartedFor`, `SealedExecution`, `recordReportedSeal`), `journal-recovery.ts` (`lastSealedExecution`), `index.ts`.
- `apps/control-plane`: `api/launch-wire.ts`. `apps/worker`: `launch-orchestrator.ts` (`Launch.#newExecution`, `LaunchedExecution`).
- `packages/contracts/documents/execution.openapi.json`; `docs/contracts/launch-authorization.md`, `docs/contracts/worker-journal.md`.
- Tests in the execution module, the worker, and the control plane (unit, API, and PostgreSQL integration).
- The published `taskelith` package does not bundle these workspaces, so the commits are `chore`, `test`, and `docs`. No new dependency.
- Out of scope until the G2 24b harness is in `dev`: its D1 expected failures, its D1 order barrier, and its evidence rerun (tasks group 4). The worker's cancellation path of 24c is not touched.
