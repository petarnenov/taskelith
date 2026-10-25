## 1. Fix

- [x] 1.1 Replace `previous!` in `PostgresFleetRegistry.expirePredecessors` with an explicit skip and count only expired predecessors.
- [x] 1.2 Add a PostgreSQL integration test for a due row whose record holds no predecessor, next to a predecessor that expires.
- [x] 1.3 Add the scenario "Due row without a predecessor" to `installation-enrollment`.

## 2. Verify

- [x] 2.1 Show that the new test fails without the fix.
- [x] 2.2 Run `npm run openspec -- validate remove-predecessor-non-null-assertion --strict` and `make verify`.
- [x] 2.3 Independent review and record it in `verification.md`.
