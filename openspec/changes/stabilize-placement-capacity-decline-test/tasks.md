## 1. Diagnose

- [x] 1.1 Trace the waiting order from the queue's SQL and `fairWaitingOrder` to the submit's `tx.now()`.
- [x] 1.2 Reproduce the failure by stamping `task-a02` 1 ms before `task-a01`.

## 2. Fix

- [x] 2.1 Pin the waiting ages in the capacity decline test with `waitingSince`.
- [x] 2.2 Add the scenario "Older stored stamp of a later submit" to "Waiting placements".
- [x] 2.3 Show that the existing mirror test fails against a mutant that orders by submit order.

## 3. Verify

- [x] 3.1 Show that the reproduction no longer fails the fixed test, and run it 50 times, 20 under a CPU hog.
- [x] 3.2 Run `npm run openspec -- validate stabilize-placement-capacity-decline-test --strict` and `make verify`.
- [ ] 3.3 Independent review and record it in `verification.md`.
