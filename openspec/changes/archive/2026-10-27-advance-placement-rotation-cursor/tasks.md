## 1. Contract and spec

- [x] 1.1 State the cursor rule in `docs/contracts/capacity-reservation.md` sections 5 and 13, keeping section 12.
- [x] 1.2 Modify the `execution-placement` requirements "Project rotation" and "Waiting placements" and validate the change strictly.

## 2. Tests first

- [x] 2.1 `PlacementService` tests, failing on the current cursor: one slot per pass placing `a1`, `b1`, `a2`, `b2`, `a3`, `b3`; two slots per pass; a pass without a candidate; an outage in the middle of a pass.
- [x] 2.2 Domain unit tests for `RotationCursor`.

## 3. Fix

- [x] 3.1 `RotationCursor` in the scheduling domain.
- [x] 3.2 The placement service moves `#after` with `RotationCursor`, also when an outage stops the pass.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate advance-placement-rotation-cursor --strict`, `npm run verify:comments`, `make findings ARGS="validate"`, and `make verify`, and record them in `verification.md`.
- [x] 4.2 Review pass 1: a full fleet keeps the cursor (H1), stronger outage and no-candidate tests (M1, L1, L2), `#offer` returns the cursor (L3), contract, port comment, and spec wording (L4 to L6).
- [x] 4.3 Review pass 2: the cursor stops at the first fleet capacity decline (L3), one cursor event per offer (L5), service tests for a decline after it and a transaction without a candidate (L6), one name for the fleet reasons (L7), the records (L1, L2, L4), and the backoff follow-up (M1, deferred).
- [x] 4.4 Independent review pass 3: the Low documentation fixes, recorded unreviewed, and the record of pass 3.
