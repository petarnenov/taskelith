## Why

[G2 work plan](../../../docs/g2-plan.md) item 20 builds the worker application, split by the coordinator into changes; this is 20d. After 20c the worker launches accepted assignments, but an execution that an earlier process left open (a pending W2, an unused grant, or a journaled record) is never touched again, an execution record is never removed, and a long outage seals one execution and reports one `not-started` per deadline cycle. The [worker journal contract](../../../docs/contracts/worker-journal.md) section 5 recovery table and the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) recovery rules require the start reconciliation.

## What Changes

- **Start reconciliation.** On its first pass the worker takes every `planJournalRecovery` action for the executions an earlier process left open, each once: a pending W2 or an unused grant is sealed and reported `not-started`; a journaled record goes to the supervisor's recovery table (recover, adopt and observe, retry after the liveness wait, or `uncertain` with a reason); an operation of an execution without a grant that expired or was rejected as retryable is authorized again for the same execution. Nothing is spawned for an inherited execution.
- **Supervisor liveness.** A watched record with a claim has its supervisor's liveness checked every tenth poll; a dead supervisor is decided by the recovery table.
- **Record removal.** Once the journal reports an execution's terminal fact confirmed, its record directory is removed and the removal journaled; a supervisor still holding the lock keeps it for a later pass.
- **Leftovers.** A record directory that no journal row names is logged and kept (the `unrecorded-process` scan is a follow-up).
- **Deadline cycle and expired answer.** An operation past its deadline without a decision, or answered `expired`, is journaled with the new W3 outcome `expired`, and the same execution is authorized again with `reportsNotStarted`; no seal and no `not-started` are needed.
- **Execution evidence.** `execution.termination-unproven` (the survivors with their process group) and `cancellation.not-applied` get their journal facts and wire mapping; every recovery termination evidence maps to `execution.exited`.
- **AsyncAPI 0.5.0.** `execution.exited` accepts `boot-changed` and `namespace-ended` (approved amendment owed by 20c).
- **Journal format 3** with a migration from format 1 or 2, and the contract text for it.
- **Structured logs** of the reconciliation through `@taskelith/observability`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: start reconciliation, supervisor liveness, record removal, execution evidence observations, reconciliation logs, and the changed deadline and offline rules.
- `worker-journal-adapter`: journal format 3 and removable records.
- `worker-journal`: format versioning across several formats and the `expired` operation.
- `execution-wire-contracts`: recovery termination evidence in version 0.5.0.

## Impact

- `apps/worker`: `ExecutionWatch`, the reconciling orchestrator, the observation mapping, the record listing, and the logger in `main.ts`; a new workspace dependency on `@taskelith/observability`.
- `@taskelith/execution`: the `expired` outcome, two observation facts, the journal port methods, and the retry rule of the recovery plan.
- `@taskelith/worker-journal`: format 3 and its migration.
- `@taskelith/worker-supervisor`: survivors carry their process group; the reported facts include the survivors and an unapplied cancellation.
- `@taskelith/contracts`: `execution.asyncapi.json` 0.5.0.
- `docs/contracts/worker-journal.md` and `docs/contracts/execution-wire-contracts.md`.
- No new third-party dependency.
