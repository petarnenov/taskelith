## 1. Contract and spec

- [x] 1.1 State in `docs/contracts/capacity-reservation.md` sections 5 and 13 and in `docs/operational-targets.md` that a decline for lack of fleet capacity does not back off, and the batch bound per pass.
- [x] 1.2 Modify the `execution-placement` requirement "Placement backoff" with the scenario "Capacity decline", and validate the change strictly, also after an archive in a scratch copy.

## 2. Tests first

- [x] 2.1 `PlacementService` tests, failing on the current backoff: fifty tasks of one project and one of another with one slot per pass; an own-reason decline next to a fleet capacity decline; a pass without a candidate.
- [x] 2.2 PostgreSQL integration test of the fifty-to-one case, and the no-capacity test reading the task again.

## 3. Fix

- [x] 3.1 `isFleetCapacityDecline` in the placement service, over `lacksFleetCapacity`, for the cursor and the backoff; `#settle` keeps the wait after such a decline.
- [x] 3.2 Comments of the scheduling backoff constants and the fleet reasons.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate placement-backoff-preserves-rotation --strict`, `make findings ARGS="validate"`, and `make verify`, and record them in `verification.md`.
- [x] 4.2 Review pass 1: the comments of `isFleetCapacityDecline` and `#placeDue` (M1, L1), a test of the kept failure count (L2), the request-dependent fleet reason (L3), and the spec citation of the record (L4).
- [ ] 4.3 Review pass 2 by reviewer B, checking the pass 1 fixes, and any later pass.
