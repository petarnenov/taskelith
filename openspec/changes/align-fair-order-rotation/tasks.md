## 1. Contract and spec

- [x] 1.1 State the rotation in `docs/contracts/capacity-reservation.md` sections 5 and 13.
- [x] 1.2 Modify the `execution-placement` requirement "Waiting placements" and validate the change strictly.

## 2. Tests first

- [x] 2.1 A `PlacementService` test with one free slot per pass that offers `b1` before `a2`, failing on the current order.
- [x] 2.2 A placement queue conformance case with a cursor whose read the domain order keeps, failing on the current order for both queues.
- [x] 2.3 Domain unit tests for `fairPlacementOrder(waiting, after)`, failing on the current order.

## 3. Fix

- [x] 3.1 `fairWaitingOrder` and `fairPlacementOrder(waiting, after)` in the scheduling domain.
- [x] 3.2 The in-memory queue orders with `fairWaitingOrder`.
- [x] 3.3 The placement service offers in the domain order with the read's cursor.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate align-fair-order-rotation --strict`, `npm run verify:comments`, `make findings ARGS="validate"`, and `make verify`, and record them in `verification.md`.
- [x] 4.2 Review pass 1: state the round order relative to a cursor between two projects, with a domain test and a shared conformance case.
- [x] 4.3 Review pass 2: narrow the section 12 claim to the proven case and widen the cursor follow-up, in the records only.
- [ ] 4.4 Independent review pass 3 and record it in `verification.md`.
