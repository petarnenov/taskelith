## 1. Diagnose

- [x] 1.1 Trace which clock the snapshot and the test's stamps read, and explain 29.998023.
- [x] 1.2 Reproduce the exact value with a database clock that steps back 1977 µs.

## 2. Fix

- [x] 2.1 Add the `pinnedClockCredentials` test helper.
- [x] 2.2 Assert the outbox lag, assignment age, and oldest-append lag exactly on the pinned clock.

## 3. Verify

- [x] 3.1 Run the test file repeatedly.
- [x] 3.2 Run `npm run openspec -- validate stabilize-observability-lag-test --strict` and `make verify`.
- [x] 3.3 Independent review and record it in `verification.md`.
