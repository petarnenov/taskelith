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
- [ ] 4.3 Independent review pass 2 and record it in `verification.md`.
