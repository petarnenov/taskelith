## Why

G2 persists no reason why a task is not placed. A placement transaction that no candidate accepts rolls back, so its waiting reason lives only in the rolled-back failure and in the in-memory `RetrySchedule` of `PlacementService` (`apps/control-plane/src/application/placement-service.ts`); an attempt that a rejecting reason refuses ends `not-started` with no reason. The board and task detail therefore cannot show a task's scheduling wait or rejection. Item 0 of G3, `revalidate-g3-foundations`, recorded this as item 8, pass 1 M2 (its G2 part) and pass 2 M2 part a (`openspec/changes/archive/2026-10-27-revalidate-g3-foundations/findings.jsonl`), and deferred it to this change; `align-product-ports-with-g2-lifecycle` builds the board projection on it.

## What Changes

- A durable **placement outcome record** per task: the outcome of the task's last placement try that did not place it, with its disposition (`waiting` or `rejected`), its reason from capacity reservation contract section 11 (`no-candidate` when no candidate exists), its source (`scheduler`), the attempt it concerns when that attempt is stored, and the database time of the record.
- The placement transaction that ends an attempt for a rejecting reason records the `rejected` outcome in the same transaction. A placement transaction that rolls back for a waiting reason is followed by a transaction of its own that records the `waiting` outcome, only while the task still waits, so the outcome survives the rollback and never covers a later placement. A standing reason records nothing.
- A later outcome of the task replaces its record, and the placement transaction that places the task removes it.
- A `PlacementOutcomeRecords` port in `@taskelith/scheduling` with readers for one task and for given tasks, a shared conformance suite, an in-memory adapter, and a PostgreSQL adapter over a new table `placement_outcomes`.
- The capacity reservation contract states the record (sections 11 and 13).

## Capabilities

### New Capabilities

### Modified Capabilities

- `capacity-reservation`: the scheduler keeps a durable record of a task's last placement outcome that did not place it.
- `execution-placement`: the placement transaction and its rollback path write, replace, and remove that record, and readers answer it.

## Impact

`@taskelith/scheduling`, `@taskelith/postgres` (a new migration), and `@taskelith/control-plane`, all private workspace packages. No API, event, wire contract, or UI change. A placement try that rolls back for a waiting reason costs one more short transaction; with the pass ending at its first decline for lack of fleet capacity, a full fleet costs one such write per pass. The board projection is out of scope (`align-product-ports-with-g2-lifecycle`).
