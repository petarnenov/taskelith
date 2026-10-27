## Context

`PlacementService` (`apps/control-plane/src/application/placement-service.ts`) places each waiting task in its own SERIALIZABLE transaction. When no candidate accepts and the last reason waits, `placeTask` returns a failure whose details carry the reason, so the whole transaction rolls back, including the attempt it opened or the ownership it claimed; the reason then lives only in that failure and in the in-memory `RetrySchedule`. When the last reason rejects, `endRejectedAttempt` ends the attempt `not-started` and closes the task's delegation, but the attempt outcome has no field for the reason. Nothing durable says why a task waits or was rejected, so a board projection cannot show it (`openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl`, item 8, pass 1 M2 and pass 2 M2 part a). The reasons are those of capacity reservation contract section 11, classified in `packages/modules/scheduling/src/domain/capacity-reasons.ts`.

## Goals and non-goals

- Goal: a durable record per task of its last placement try that did not place it, with reason, disposition, source, and time, written so that a waiting outcome survives the rollback, and readers that a board projection can use.
- Non-goals: the board projection and any product port or UI (`align-product-ports-with-g2-lifecycle`), records for delegation admission's own reasons and for worker refusals, a history of outcomes, and a change to when or how placement decides.

## Decisions

### D1. One current record per task

The record is keyed by task: a later record replaces the earlier one, and the placement of the task removes it (D6). A history per attempt was considered and rejected: the board shows why a task does not run now, and a history would need its own retention rule. The record carries the attempt it concerns when that attempt is stored, so a reader can tell whether the record is about the active attempt or an ended one.

### D2. Reason and disposition

`disposition` is `waiting` or `rejected` (`OUTCOME_DISPOSITIONS`). A `waiting` record carries a waiting reason of section 11 or `no-candidate` (`RecordedWaitingReason`), a `rejected` record a rejecting reason (`RejectingReason`); `PlacementOutcomeRecord` is a union over the two, so a mismatched pair does not type-check. A standing reason (`attempt-already-reserved`, `attempt-not-reservable`) records nothing: section 13 "Standing reasons" says the placement changes nothing, so the record of the task's last real try stays. The PostgreSQL table checks the disposition and the source; it does not check the reason, so that a reason added to the contract needs no migration, and the adapter's writer is typed.

### D3. Source

`source` names the party that raised the reason, in the vocabulary of the "Raised by" column of contract section 11: `scheduler` (`OUTCOME_SOURCES`). In this change only the placement pass writes records, and every reason it records is raised by the scheduler, including those it re-checks from the worker's declared state. Alternatives considered:

- The component, for example `placement-pass`: a second term for what the contract calls the scheduler (one term per concept).
- The worker of the last candidate: for a waiting reason after every candidate was tried, the last candidate is arbitrary, and quota reasons concern no worker.

Delegation admission (`delegation-awaiting-capacity`, "Task admission" in section 11) and worker refusals ("Worker") would add their own source values, with a migration of the table's check, when a later change records them.

### D4. Rejected record in the placement transaction

`endRejectedAttempt` writes the `rejected` record after it ends the attempt and closes the delegation, with the transaction's database time, in the same transaction. The record and the end commit together or not at all; a failed write rolls the end back and stops the pass as an outage does.

### D5. Waiting record in the rollback path

A waiting reason must roll the placement transaction back, or the attempt it opened and the ownership it claimed would commit (requirement "Placement transaction", scenario "No capacity"). Returning success with a `waiting` result instead was considered and rejected for that reason. So `PlacementService.#recordWait` writes the record after the rollback, in a SERIALIZABLE transaction of its own, through `recordWaiting`, which first asks `PlacementQueue.stillWaiting` for the task and writes nothing when the task no longer waits. The record names the active attempt when one is stored, which the rolled-back try did not open; for a task's first try it has none.

Concurrency: a placement that commits between the rollback and the write holds a reservation, so the task no longer waits and no stale `waiting` record covers it. Both transactions are SERIALIZABLE, and the write reads the waiting state it depends on, so PostgreSQL orders it before or after such a placement; when it is ordered before, the placement's removal (D6) deletes it. A cancellation in between also ends the wait. Two writes of the same task by different control-plane instances may still race, and the last wins; G2 runs one instance (contract section 13, "Durable cursor", Limitation).

### D6. Removal on placement

The placement transaction that places the task removes its record (`removeOutcome`), so a placed task has none. Nothing else removes a record: a task cancelled while it waits keeps its last `waiting` record, and a rejected task keeps its `rejected` record until a later try replaces it or a placement removes it. A reader combines the record with the task's state, as the contract states.

### D7. A failed write stops the pass

The writes of D4, D5, and D6 fail only when the store does. A failed waiting write returns its failure from `#offer`, before the cursor counts the decline and before the task's backoff settles, so the pass stops as an outage does: the next passes back off, the end-of-pass cursor move is not stored, and the next pass offers the task again. Ignoring the failure was considered: it would let a pass go on with a store that just failed, and a later pass writes the record anyway.

### D8. Port and adapters

`PlacementOutcomeRecords` (`packages/modules/scheduling/src/ports/placement-outcome-records.ts`) sits next to the other placement ports: `record`, `remove`, `get`, and `list` of given tasks in task id order by code unit, the order of the `"C"` collation. It is a member of `ControlPlaneTransaction` (`placementOutcomes`), so that the placement transaction writes it, and a projection reads it through `readCommitted`. The shared suite `PLACEMENT_OUTCOME_RECORDS_CONFORMANCE` runs over `InMemoryPlacementOutcomeRecords` and over `PostgresPlacementOutcomeRecords`, whose table `placement_outcomes` is created by migration `1792932600000_placement-outcomes`.

## Fail-before evidence

The unit tests of `apps/control-plane/test/placement-outcome.test.ts` were committed in `d744f2ff`, before the wiring in `cc2ad0a9`, and all five failed against the services of `d744f2ff` (`verification.md`, Evidence check). Their fixture stages the records of each transaction and applies them only on its commit, so a waiting record written inside the rolled-back placement transaction would be lost there too.

## Risks and limits

- A pass that finds no candidate worker opens no placement transaction, so it records nothing; a task that waits only because the fleet is empty has no record, or keeps an older one. A retry that still backs off keeps the record of its last try.
- A cancelled task keeps its last record (D6); the projection must read the task's state too.
- A try that rolls back for a waiting reason costs one more short transaction. With the pass ending at its first decline for lack of fleet capacity, a full fleet costs one such write per pass; an own-reason decline backs the task off, which bounds its writes.
- Two existing tests of `apps/control-plane/test/placement-rotation.test.ts` count commits to lose a commit reply; each now counts the waiting record's commit too, so the lost reply still hits the placement it is about.
