## Context

The [product ports contract](/docs/contracts/product-ports.md) was written before G2 closed. Item 0 of G3 compared it with G2 as built and deferred its contract findings to this change; the G2 record of the placement outcome landed first as `record-placement-outcome` (#360). The design source is the owner's UI proof of concept (owner rule of 2026-10-27), read as data: its board keys every card by `runId`, its archived cards stay at the `archive` stage with that stage's gate passed ("Closed · merged"), its session indicator reads "Queued · <reason>" with labels for every Scheduling waiting reason, its ended sessions read "Ended · <outcome>" with "· cancelled", and its inbox has a "Reconcile" item for a process whose state is uncertain, answered by a `project-maintainer` with "Reconcile with evidence", which ends the execution as operator-resolved. The decisions below say where the contract follows it.

## Goals and non-goals

- Goals: a contract, living spec, and port types that agree with G2 as built for the eleven deferred findings, and tests for the values they fix.
- Non-goals: any adapter, projection, or UI; the launch invalidation obligations of product writers (pass 1 H1 and pass 2 M1, `bind-product-writers-to-launch-invalidation`); the wire schemas (item 9).

## Decisions

### D1. A card is a root run (pass 2 H1)

A G2 run holds many tasks: `submitTask` admits a task to one stage and optionally one work item of an existing run (`apps/control-plane/src/application/task-service.ts:32`), a re-admission rebinds the same task at its next ownership generation (`packages/modules/execution/src/domain/task.ts:116`), and a delegated child runs in a child run with a lineage root (`packages/modules/scheduling/src/domain/delegation-admission.ts:61`). The card is therefore the root run, keyed by `runId`; its tasks, re-admissions, and delegated children are listed in the task detail, and the inbox, counts, and merge requests name the card by `runId`. `BoardCard.taskId`, `TaskDetail.admission`, `NeedsYouFilter.taskId`, `NeedsYouCounts.byTask`, and `MergeRequest.taskId` are replaced by `runId` keys, `TaskDetail.tasks`, and `byCard`. Intake binds the root run and submits its first task.

ADR 0008 is unchanged by this. Its "task" (decision 5) has a framework, so it is a run with its change, and its card moves through every lifecycle column and is archived by the merge (decision 4), which a G2 task, bound to one stage, cannot do. The proof of concept keys its cards by `runId` too. The contract states the vocabulary: "task" without a qualifier is a G2 task, and the board's card and "task detail" are the run's. Alternatives considered: a card per G2 task, which contradicts decision 4 because a task never leaves its stage; and a card per run that shows only a "current task", which leaves parallel work items of one stage and delegated children without a place. Confirmed by the away delegate (claude fallback) on 2026-10-27. An optional owner editorial note in ADR 0008 (run and admissions wording) is pending for the owner; this change does not edit the ADR. The contract's section 3.3 states the vocabulary and reads the "admission" of decision 4 as the run's list of task admissions (`TaskDetail.tasks`).

### D2. Card fields over several tasks

The card shows, among the tasks of its current stage: the most urgent session activity, in the order `process-uncertain`, `worker-unreachable`, `waiting-for-person`, `working`, `waiting-for-admission`, `stopped`; the obstacle of the first such task in task identifier order, a `rejected` one first; and the most recent task end when none of them is active. Each task's own values are in the detail.

### D3. Completed workflow (pass 1 M1)

With every stage completed there is no first stage not completed, so the current stage is the last stage of the graph order, the completed Close stage, which the archived card keeps showing, as the proof of concept's archived cards do. G2 allows `completed` to `in-progress` (`packages/modules/sdlc/src/domain/stage-progress.ts:15`): before a merge such a restart moves the card back to that stage's column; after a merge the card stays in `archived`, because a merge cannot be undone and rule 6 already archives on merge.

### D4. Merge readiness by passed stages (pass 2 M4, pass 1 M4, pass 2 L2)

Merge-ready uses `hasStagePassed` (`packages/modules/sdlc/src/domain/stage-progress.ts:37`) for every stage before Close, with each completed, so a stage without a gate keeps the card `not-ready`. Without a request or after a withdrawal, the merge gate follows current readiness first, then the reason: `not-ready`; `withdrawn` (new) for `cancelled` and `maintainer-withdrew`; `awaiting-manual-merge` with the setting off or after `manual-merge`; else `ready` (new), the state before or at a failed enqueue. So a gate gone stale after either withdrawal shows `not-ready` (G2 `passed` to `stale`, `packages/modules/sdlc/src/domain/gate.ts:20`). For `ready` to be reachable at the same head, enqueueing moves a request withdrawn for `gate-not-passed` or `auto-merge-off` back to `queued`; the other withdrawals stay, since a person chose them. Alternative: keep `not-ready` for every withdrawn request and redefine it as "not queued"; rejected, because the card would hide that it is merge-ready. Confirmed by the away delegate (claude fallback) on 2026-10-27.

### D5. Placement obstacle (pass 2 M2 parts b and c)

The obstacle is the view's own value, mapped by item 15's aggregate: Execution cannot import Scheduling, which depends on it (`packages/modules/scheduling/package.json`), as for the merge gate. Its reason lists mirror Scheduling's (`packages/modules/scheduling/src/domain/capacity-reasons.ts:3`, `packages/modules/scheduling/src/domain/assignment.ts:44`), and `packages/modules/scheduling/test/board-obstacle-mirror.test.ts` keeps them equal. Sources, in order: the view's fleet read (`fleet`), an unplaced retry still backing off (`automatic-retry`, with its retry number, since its due time lives only in memory), the refusal on the active attempt's latest assignment (`worker`, `waiting` because the attempt is placed again), and the task's `PlacementOutcomeRecord` (`scheduler`). Per #360's coordinator decisions (its design D9): an empty fleet records nothing, so `no-candidate` comes from the fleet read; a cancellation keeps the record, so a record is shown only while the task's state matches it; and a pass that ended at a fleet decline may leave an older record, so the fleet read replaces it and `observedAt` carries each source's time. Standing reasons record nothing and are never shown. The proof of concept labels every waiting reason; the contract adds the rejecting and refusal reasons it lacks.

### D6. Task end (pass 2 M3)

A task whose last attempt ended, with no active attempt and no automatic retry, shows `cancelled`, `rejected` (G2 `endRejectedAttempt`), `retries-exhausted` (`MAX_AUTOMATIC_RETRIES`), or `uncertain-exit` (unknown status, operator-resolved, or a spawn without a proven start; `packages/modules/scheduling/src/domain/automatic-retry.ts:15`), with the attempt's `AttemptOutcome`, as the proof of concept's "Ended · <outcome> · cancelled". A clean exit is no end, because the gates decide (invariant 11). A re-admission clears it.

### D7. Reconciliation in the inbox (pass 1 M3)

A `reconciliation` kind over the G2 `ReconciliationQueue` (`packages/modules/execution/src/ports/reconciliation-queue.ts:7`), whose surface ADR 0015 decision 5 left to G3. An unknown execution (`isUnknownExecution`, `packages/modules/execution/src/domain/execution.ts:105`, including the uncertainty a worker revocation records, `apps/control-plane/src/application/worker-revocation.ts:8`) is an item of its card for a `project-maintainer`, answered `resolve-execution` with evidence (G2 `resolveByOperator`), as in the proof of concept; the answer fails with `precondition-failed` once the execution is no longer unknown or the ownership generation moved. An unrecorded process names no task or project, so it goes to an installation-scoped inbox for an `installation-owner`, who manages workers in the trust model, answered `acknowledge-process`; Taskelith never stops such a process. A new item state `closed` covers an item whose subject stopped waiting without an answer, such as an execution whose terminal fact arrived. The [trust model](/docs/trust-model.md#3-project-scoped-authorization-roles) section 3 now names the owner's answer to the installation-scoped inbox (`acknowledge-process`) among the `installation-owner` capabilities; no living spec lists role capabilities, so no requirement changes for it. Confirmed by the away delegate (claude fallback) on 2026-10-27.

### D8. Standing rule revision scope (pass 2 M5)

A policy revision is an opaque, unordered identifier (`packages/modules/sdlc/src/domain/workflow-run-binding.ts:10`) and the run's current one is what launch authorization compares. So a rule matches only on equality with the current policy revision of the request's run, and `StandingApprovalRules.active` takes that revision. A rule records the project's current revision; a new revision revokes nothing; while auto-merge is on, the writer of a new project policy revision records the `auto-merge` rule at it; turning auto-merge off revokes every `auto-merge` rule. Changing the auto-merge setting and recording, revoking, or using a rule never changes a policy revision, so they are not invalidating writers under the launch authorization section 5 bullet that `bind-product-writers-to-launch-invalidation` adds (coordinator note of 2026-10-27). Alternative: an ordered revision; rejected, because it changes the SDLC type and every reader of it. Confirmed by the away delegate (claude fallback) on 2026-10-27.

### D9. Naming (pass 2 L1)

`WAITING_REASONS` and `WaitingReason` of the board read model clashed with Scheduling's exports of another meaning; they become `CARD_WAIT_KINDS` and `CardWait`.

## Risks and limits

- The re-queue rule of D4 changes the merge queue's entry behavior, which item 23 has not implemented yet.
- The obstacle mirrors depend on a test, not the type system, to stay equal to Scheduling's lists.
- Worker refusals and delegation admission's own reasons are not in the placement outcome record (#360 design D3), so the projection reads the refusal from the assignment.
