## 1. Analysis

- [x] 1.1 Read the requirement, its scenarios, and the signals migration
- [x] 1.2 List every reader and writer of `assignments.changed_at` and of the domain `changedAt`

## 2. Fix

- [x] 2.1 The snapshot comment states which clock stamps each age's row
- [x] 2.2 `execution-observability` delta: the stamp, the clamp, and the clock assumption

## 3. Tests

- [x] 3.1 `a placement stamps the assignment change time on the database clock`
- [x] 3.2 Prove 3.1 fails when placement uses the application clock
- [x] 3.3 Review pass 1: the future-stamp test covers the assignment age; 3.1 asserts its row exists

## 4. Records

- [x] 4.1 Proposal, design with the rejected option A, `verification.md`
- [x] 4.2 `npm run openspec -- validate stamp-assignment-age-on-database-clock --strict` and `make verify`
- [x] 4.3 Independent review pass 1 (1 Medium, 4 Low), fixed
- [ ] 4.4 Independent review pass 2
