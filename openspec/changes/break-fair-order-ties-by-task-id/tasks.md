## 1. Inspect

- [x] 1.1 Compare the domain sort keys with the PostgreSQL and in-memory queue order, and check the task id grammar.

## 2. Fix

- [x] 2.1 Add a unit test with equal waiting times in shuffled and reversed input that fails on the current order.
- [x] 2.2 Break the remaining ties in `fairPlacementOrder` by task id in code-unit order.
- [x] 2.3 State the tie-break in the `execution-placement` requirement "Waiting placements".

## 3. Verify

- [x] 3.1 Run `npm run openspec -- validate break-fair-order-ties-by-task-id --strict`, `npm run verify:comments`, `make findings ARGS="validate"`, and `make verify`.
- [ ] 3.2 Independent review and record it in `verification.md`.
