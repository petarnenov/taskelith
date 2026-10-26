## Context

20c launches each accepted intent and leaves every execution that a previous process, or a stopped launch, left open untouched (its design D1). Item 14's journal plans the recovery actions (`planJournalRecovery`), and item 15's supervisor adapter decides a journaled record through `recoverExecution` and removes it through `removeRecord`. This change connects them on start.

## Coordinator decisions (2026-10-26)

- **Q1 (A): scope.** 20d is the start reconciliation (every `planJournalRecovery` action, recover and adopt, retry or uncertain, a dead supervisor, record removal, leftovers, the expired-pending and deadline-cycle fixes), the AsyncAPI 0.5.0 amendment for `boot-changed` and `namespace-ended` (approved, with a compatibility check and a version bump), and structured logs. The heartbeat, the `status()` watcher, lost-contact and offline mode, the inventory on every reconnect, and the failed-first-connect requirement change go to 20d2 (`implement-worker-contact-and-offline`).
- **Q2 (A): evidence facts.** 20d adds the journal facts and wire mapping of `termination-unproven` and `cancellation.not-applied`. `unrecorded-process` (the Linux cgroup scan) is a separate follow-up.
- **Journal format.** The terminal-confirmed query, the W3 `expired` outcome, and the new fact kinds are approved, with a format step, a migration, and a spec delta.
- **Review pass 2, M-B (option B): narrow, do not decouple.** Decided by the owner's away delegate (OpenCode `kimi-k2.7-code`, run `20261026T095212Z-opencode-38865`), not by the owner. Start reconciliation and record removal run only in a worker with `TASKELITH_WORKER_COMMAND`, because only that worker builds a supervision host. A worker without it logs each inherited open execution once as `worker.reconciliation.deferred` and leaves its journal rows and record for a later start with the command.
- **Obligation for 20d2 (`implement-worker-contact-and-offline`).** Decouple the supervision host's construction from the launch command, so start reconciliation and record removal run without `TASKELITH_WORKER_COMMAND`.

## Goals / Non-Goals

**Goals:** every recovery action on start, liveness of a watched supervisor, record removal after confirmation, the evidence facts, the AsyncAPI amendment, journal format 3, and logs.

**Non-Goals:** contact and offline mode (20d2); `unrecorded-process`; admission pressure, the disk floor, and the backlog limit (20e).

## Decisions

### D1: inherited executions are reconciled once

The orchestrator's first pass records the set of non-terminal executions in the journal: the inherited ones. Each `seal-execution`, `recover-execution-record`, or `retry-authorization` action is taken only for an inherited execution without a live launch, and the execution leaves the set when it is taken. An execution of this process that a stopped launch left open is not reconciled until the next start, which keeps a live launch the only actor on its own executions. An `uncertain` execution is therefore reported once per process.

- **Alternative:** reconcile every open execution on every pass. A launch that is still running would race its own reconciliation.

### D2: the deadline cycle ends an operation, not an execution

20c sealed the execution and reported `not-started` after each deadline without a decision, so a long outage produced one sealed execution per cycle. Before W4 nothing can spawn, so the seal proves nothing new. W3 now records `expired`, and the same execution is authorized again with a new `operationId` and `reportsNotStarted`. The launch authority grants a new operation for its owning `authorized` execution only when it reports it has not started, and an unknown execution regardless (`applyOwnershipRule`), so this is accepted in both cases. An `expired` answer is handled the same way. A grant that arrives past the deadline is still sealed, because the authority recorded it. An execution with a grant is never authorized again: the worker never sends a new operation for it, and a journal that shows a later `expired` or retryable operation after a grant is sealed as an unused grant, like the retryable case of 20c.

- W6 also expires the pending operations of its execution, and the format 3 migration expires those of executions already `not-started`, so no operation stays `pending` forever.

### D3: `ExecutionWatch` follows a record to its terminal fact

`ExecutionWatch` holds what a live launch and a reconciliation share:

- `reconcile` asks the recovery table (`recover('first')`, then `recover('after-retry')` after one poll interval for a `retry`): `uncertain` is reported with its reason, `not-started` committed, and anything else observed.
- `observe` reads the record at the poll interval, forwards a cancellation once, and commits each fact once per watch: W5s only for a claim under the journaled grant, the first survivors, an unapplied cancellation for each journaled cancellation of the execution, then W5e or W6. Every tenth poll of a claimed record asks the recovery table, so a dead supervisor is adopted or decided.

### D4: record removal

Format 3 stores each execution's terminal sequence (the outbox sequence of its W5e or W6). An execution is removable when it is terminal, not removed, and no outbox row remains at that sequence, because only a confirmed entry is pruned. Each pass removes removable records through the supervisor adapter, which takes the record's lock; a held lock keeps the record for a later pass, logged at debug. The removal is journaled after the directory is gone, and a missing directory counts as removed, so a crash in between only repeats it.

### D5: leftovers are reported, not removed

A directory under `worker/executions` that no journal row names may hold a process nobody journaled. The first pass logs `worker.execution.leftover` for it and keeps it; the `unrecorded-process` follow-up decides it.

### D6: journal format 3

Format 3 adds `terminal_sequence`, `record_removed`, and `termination_unproven` to the execution table, the `expired` outcome to the authorization request check (a table rebuild), and the `cancellation_not_applied` table. The migration backfills the terminal sequence from the outbox (0 when the entry was already pruned, which makes it removable) and runs after the format 1 step in the same transaction.

### D7: logs

`main.ts` logs JSON lines to standard error through `Logger`. The events are `worker.reconciliation.planned`, `worker.execution.recovered`, `worker.execution.uncertain`, `worker.supervisor.lost`, `worker.execution.leftover`, `worker.execution.record-removed`, `worker.execution.record-kept`, and, in a worker without a launch command, `worker.reconciliation.deferred`. The logger is optional in the orchestrator and the worker start, and silent by default.

## Risks / Trade-offs

- **An inherited execution of a cancelled intent with a retryable rejection** is not retried; the cancellation's evidence is recorded once it is settled.
- **Leftovers accumulate** until the `unrecorded-process` follow-up; they are logged on every start.
