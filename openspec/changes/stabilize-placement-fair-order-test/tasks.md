## 1. Diagnose

- [x] 1.1 Trace the waiting order from the queue's SQL to the submit's `tx.now()`.
- [x] 1.2 Reproduce the failure by stamping `task-2` 1 ms before `task-1`.

## 2. Fix

- [x] 2.1 Pin the waiting ages in the fair order test with a `waitingSince` helper.
- [x] 2.2 Add the mirror test, where `task-2` waits longest and is placed.

## 3. Verify

- [x] 3.1 Show that the reproduction no longer fails the fixed test, and run the file repeatedly.
- [x] 3.2 Run `npm run openspec -- validate stabilize-placement-fair-order-test --strict` and `make verify`.
- [x] 3.3 Independent review and record it in `verification.md`.
