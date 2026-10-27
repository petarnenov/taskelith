## 1. Contract and spec

- [x] 1.1 State in `docs/contracts/capacity-reservation.md` sections 5 and 13 and in `docs/operational-targets.md` that a pass ends at its first decline for lack of fleet capacity, and what a full fleet costs per pass.
- [x] 1.2 Modify the `execution-placement` requirement "Project rotation", its scenarios "Capacity freed during a pass" and "Many blocked projects", and add "Own decline during a pass"; validate the change strictly, also after an archive in a scratch copy.

## 2. Tests first

- [x] 2.1 `PlacementService` unit tests, failing on the current pass: a slot freed during a pass after a fleet capacity decline waits for the declined project; a full fleet costs one placement transaction per pass; an own-reason decline does not end the pass.
- [x] 2.2 PostgreSQL integration test of a slot freed right after a fleet capacity decline.

## 3. Fix

- [x] 3.1 `#offer` ends the pass at the first fleet capacity decline; `#settle` loses its unreachable early return; comments of `#offer`, `#settle`, and `isOutage`.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate stop-placement-pass-at-fleet-decline --strict`, `make findings ARGS="validate"`, and `make verify`, and record them in `verification.md`.
- [ ] 4.2 Review pass 1 by reviewer A.
- [ ] 4.3 Review pass 2 by reviewer B.
- [ ] 4.4 Review pass 3 by reviewer A, if pass 2 has findings above Low.
