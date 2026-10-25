## 1. Proof of concept

- [x] 1.1 Model the board as runs with stage graphs, per-stage gates, and admissions.
- [x] 1.2 Derive the session status from execution facts; add reconciliation, stop outcomes, and the live cursor.
- [x] 1.3 Add personas and role-aware actions; request identity, server confirmation, a generation conflict, and client-chosen IDs.
- [x] 1.4 Align workers, capacity quotas, plugins, reviews, new task, and board states with the backend; mark later gates.
- [x] 1.5 Update the README, rebuild, check in a browser, and publish the new version.

## 2. Specification

- [x] 2.1 Replace "Harness activity indicator" with "Session activity indicator", whose scenarios "Worker unreachable" and "Process state uncertain" replace "Ownership uncertain".
- [x] 2.2 Align G3 item 31 and the plan's starting point with it.

## 3. Verify

- [x] 3.1 Run `npm run openspec -- validate align-ui-poc-with-backend --strict` and `make verify`.
- [ ] 3.2 Independent review and record it in `verification.md`.
