## 1. Investigation

- [x] 1.1 Find the root cause of the macOS failure, and reproduce it deterministically by stepping a recorded `run_on` back.
- [x] 1.2 Report the cause to the coordinator, with options, before changing product behavior.

## 2. Fix

- [x] 2.1 Check the migration order by file name inside the advisory lock, and turn off node-pg-migrate's clock-based check.
- [x] 2.2 Add integration tests: the clock step during an interrupted run, out-of-order run times, a pending file older than an applied one, numeric-prefix order, and an applied migration without its file.
- [x] 2.3 Add the spec delta.

## 3. Verification

- [x] 3.1 Show that the new tests fail without the fix, except the pinning test for a missing file, and pass with it.
- [x] 3.2 Run `make verify` on the Linux host.
- [ ] 3.3 Pass the independent review and record it in `verification.md`.
