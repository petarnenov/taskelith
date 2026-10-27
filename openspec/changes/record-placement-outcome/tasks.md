## 1. Contract and spec

- [x] 1.1 State the recorded placement outcome in `docs/contracts/capacity-reservation.md` section 11 and section 13, "Recorded outcome".
- [x] 1.2 Add the `capacity-reservation` requirement "Recorded placement outcome"; modify the scenario "No capacity" of the `execution-placement` requirement "Placement transaction" and add "Placement outcome writes" and "Placement outcome readers"; validate the change strictly.

## 2. Port and adapters

- [x] 2.1 `PlacementOutcomeRecord` and its dispositions, sources, and waiting reasons in `@taskelith/scheduling`, and the `PlacementOutcomeRecords` port.
- [x] 2.2 The shared suite `PLACEMENT_OUTCOME_RECORDS_CONFORMANCE`, `InMemoryPlacementOutcomeRecords`, and its conformance run.
- [x] 2.3 Migration `1792932600000_placement-outcomes`, `PostgresPlacementOutcomeRecords` as `PostgresTransaction.placementOutcomes`, its conformance run, and the migration tests.

## 3. Tests first

- [x] 3.1 Unit tests over the in-memory store, failing before the wiring: a waiting reason recorded although its transaction rolls back, a later decline replacing the record and the placement removing it, a rejected record with its attempt, no record for a task that stopped waiting, and a failed write stopping the pass.
- [x] 3.2 PostgreSQL integration tests: a waiting record without the rolled-back attempt, removal on placement, the rejected record in the ending transaction, and its rollback.

## 4. Wiring

- [x] 4.1 `PlacementService` writes the waiting record in its rollback path, the rejected record in `endRejectedAttempt`, and removes the record on placement; `ControlPlaneTransaction.placementOutcomes`.
- [x] 4.2 Adapt the scripted unit store and the two lost-commit tests of the rotation to the waiting record's transaction; add the transaction count test and the reason guard tests.

## 5. Verify

- [x] 5.1 Run the checks of `make verify` that need no Docker and record them in `verification.md`.
- [x] 5.2 Run `make verify`, which needs Docker, once the coordinator approves it.
- [x] 5.3 Review pass 1 by reviewer A.
- [x] 5.4 Review pass 2 by reviewer B.
- [x] 5.5 Review pass 3 by reviewer A, if pass 2 has findings above Low.
