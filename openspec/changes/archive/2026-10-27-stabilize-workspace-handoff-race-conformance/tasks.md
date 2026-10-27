## 1. Diagnose

- [x] 1.1 Trace the failing assertion to the racy double's unsynchronized hand-offs.
- [x] 1.2 Reproduce the failure without load by delaying the check of `attempt-2`.

## 2. Fix

- [x] 2.1 Hold racing hand-offs at a check barrier in the double.
- [x] 2.2 Show by mutation that the test still fails when the double does not race or the case does not count.

## 3. Verify

- [x] 3.1 Run the test repeatedly under artificial load, before and after the fix, with and without the perturbation.
- [x] 3.2 Run `npm run openspec -- validate stabilize-workspace-handoff-race-conformance --strict` and `make verify`.
- [x] 3.3 Independent review and record it in `verification.md`.

## 4. Archive

- [x] 4.1 Archive the change after the review.
