## 1. Fix

- [x] 1.1 Locate the rule in the capacity reservation, launch authorization, and worker journal contracts
- [x] 1.2 `holdsSlot` in `apps/worker/src/assignment-admission.ts`: frees only a terminal state or a history closed without a grant
- [x] 1.3 Review pass 1, M1: hold on every unproven combination

## 2. Tests

- [x] 2.1 `rejected-launch-frees-slot`: a one-slot worker accepts a re-placement after a final rejection before a grant
- [x] 2.2 A pending, `authorized`, or `started` execution keeps an ended assignment's slot
- [x] 2.3 Prove 2.1 fails on the old source (not committed)
- [x] 2.4 Review pass 1: tests for each unproven combination over a journal view, failing on the pass 1 source

## 3. Records

- [x] 3.1 Proposal, design, worker-runtime delta, `verification.md`
- [x] 3.2 `npm run openspec -- validate fix-rejected-launch-slot-release --strict` and `make verify`
- [x] 3.3 Independent review pass 1
- [x] 3.4 Merge `origin/dev`
- [ ] 3.5 Independent review pass 2
