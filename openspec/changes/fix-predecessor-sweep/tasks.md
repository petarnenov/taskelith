## 1. Fix

- [x] 1.1 Clear the expiry column of a due row without a predecessor.
- [x] 1.2 Filter `enrollment IS NOT NULL` in the sweep's query.
- [x] 1.3 Let the record decide, as in the in-memory registry, and set a disagreeing column back to the record.
- [x] 1.4 Add a PostgreSQL integration test for each case, and update the `installation-enrollment` scenarios.

## 2. Verify

- [x] 2.1 Show that each new test fails without the fix.
- [x] 2.2 Run `npm run openspec -- validate fix-predecessor-sweep --strict` and `make verify`.
- [ ] 2.3 Independent review and record it in `verification.md`.
