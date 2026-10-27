## Why

G3 item 0, `revalidate-g3-foundations`, re-reviewed item 8 `product-ports` against G2 as built and deferred eleven findings to this change ([its findings](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl), item 8: pass 1 M1, M3, M4; pass 2 H1, M2 parts b and c, M3, M4, M5, L1, L2). The [product ports contract](/docs/contracts/product-ports.md) assumed one task per card through every stage, had no current stage once a workflow completes, no placement obstacle, no task end without a merge, no reconciliation in the inbox, a merge readiness that holds vacuously for a stage without a gate, withdrawn merge requests mapped by reason alone, and standing rules compared by the age of an opaque, run-scoped policy revision. `record-placement-outcome` (#360) has since stored the placement outcome that the obstacle projection reads.

## What Changes

- **Card mapping.** A card is one root workflow run, keyed by `runId`; a G2 task is one admission of a stage of the run; a re-admitted task stays the same task; delegated child tasks belong to their lineage root's card. The task detail lists every task with its admission; inbox subjects, counts, and merge requests name the card by its run. Intake binds the root run and submits its first task.
- **Completed workflow.** When every stage has completed, the completed Close stage is the card's current stage; a merged card stays in `archived` through a rework restart.
- **Merge readiness.** Merge-ready uses the G2 rule `hasStagePassed` for every pre-merge stage, every stage other than Close and those depending on it; the merge gate follows current readiness after a withdrawal, with the new values `ready` and `withdrawn`; enqueueing re-queues a request withdrawn for `gate-not-passed` or `auto-merge-off` at the same head.
- **Placement obstacle.** A structured obstacle with reason, disposition, source, and observation time, from the fleet read, an automatic retry backing off, a worker refusal, and the placement outcome record, gated on the task's state.
- **Task end.** `cancelled`, `rejected`, `retries-exhausted`, or `uncertain-exit` with the attempt's outcome; a re-admission clears it.
- **Reconciliation.** A `reconciliation` inbox kind over the G2 reconciliation queue: unknown executions on their card for a `project-maintainer`, unrecorded processes in an installation-scoped inbox for an `installation-owner`, with evidence, generation checks, and a `closed` item state.
- **Standing rule revision scope.** A rule matches only when its policy revision equals the current one of the request's run; the auto-merge rule follows a new policy revision while auto-merge is on; the setting and rules are not policy revision writers.
- **Naming.** `WAITING_REASONS` and `WaitingReason` of the board read model become `CARD_WAIT_KINDS` and `CardWait`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ports`: card per root run, completed workflow projection, merge readiness by passed stages, placement obstacle, task end, reconciliation in the inbox, and the standing rule revision scope.

## Impact

`docs/contracts/product-ports.md`; the port types `board-read-model.ts`, `needs-you.ts`, and `standing-approval-rules.ts` of `@taskelith/execution` and `auto-merge.ts` of `@taskelith/integrations`, all private workspace packages with no implementation yet; their value tests and a Scheduling test that keeps the obstacle reason mirrors equal. No API, event, wire contract, adapter, or UI change. Out of scope: the obligations of product writers to launch invalidation (`bind-product-writers-to-launch-invalidation`).
