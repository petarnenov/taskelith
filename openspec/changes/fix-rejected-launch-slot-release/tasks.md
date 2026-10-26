## 1. Fix

- [x] 1.1 Locate the rule in the capacity reservation, launch authorization, and worker journal contracts
- [x] 1.2 `holdsSlot` in `apps/worker/src/assignment-admission.ts`: `authorized`, `started`, or a pending request without a grant

## 2. Tests

- [x] 2.1 `rejected-launch-frees-slot`: a one-slot worker accepts a re-placement after a final rejection before a grant
- [x] 2.2 A pending, `authorized`, or `started` execution keeps an ended assignment's slot
- [x] 2.3 Prove 2.1 fails on the old source (not committed)

## 3. Records

- [x] 3.1 Proposal, design, worker-runtime delta, `verification.md`
- [x] 3.2 `npm run openspec -- validate fix-rejected-launch-slot-release --strict` and `make verify`
- [ ] 3.3 Independent review
