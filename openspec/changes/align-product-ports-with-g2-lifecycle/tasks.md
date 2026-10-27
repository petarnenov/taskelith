## 1. Contract and spec

- [x] 1.1 Revise `docs/contracts/product-ports.md`: card per root run, completed workflow, merge readiness and merge gate, placement obstacle, task end, reconciliation items, standing rule revision scope, intake, merge queue entry, and required tests.
- [x] 1.2 Add the `product-ports` requirements and modify "Needs you items answered once by their source" and "Standing approval rules recorded and audited"; validate the change strictly.

## 2. Port types and tests

- [x] 2.1 Board read model: `CARD_WAIT_KINDS`, the obstacle values and `PlacementObstacle`, `TaskEnd`, `TaskView`, the merge gate values `ready` and `withdrawn`, and a card keyed by `runId`.
- [x] 2.2 Needs you: the `reconciliation` kind and reasons, `installation-owner`, scopes and subjects, the `closed` state, and counts by card; standing rules by policy revision; merge requests without a task.
- [x] 2.3 Value tests in `@taskelith/execution` and the obstacle mirror test in `@taskelith/scheduling`.

## 3. Verify

- [x] 3.1 Run the checks of `make verify` that need no Docker and record them in `verification.md`.
- [x] 3.2 Run `make verify`, which needs Docker, once the coordinator approves it.
- [x] 3.3 Review pass 1 by reviewer A.
- [x] 3.4 Review pass 2 by reviewer B.
- [x] 3.5 Review pass 3 by reviewer A, if pass 2 has findings above Low.
- [ ] 3.6 Archive the change.
