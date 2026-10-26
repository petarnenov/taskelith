## 1. Fix

- [x] 1.1 Locate the rule in the capacity reservation, launch authorization, and worker journal contracts and the launch-reconciliation spec
- [x] 1.2 `endsAssignment` in `packages/modules/execution/src/domain/launch-rejection.ts`
- [x] 1.3 `readSnapshot` in `packages/adapters/worker-journal/src/journal-reads.ts`: an intent ends by its end command or by such a rejection

## 2. Tests

- [x] 2.1 `a launch rejected with assignment-not-active ends its assignment` (worker intake, one slot)
- [x] 2.2 `a late end of an assignment ended locally is journaled once`
- [x] 2.3 `a launch rejected with assignment-not-active ends its assignment, also after a reopen` (journal adapter)
- [x] 2.4 Prove 2.1 to 2.3 fail on the old source
- [x] 2.5 Review pass 1: the reported `ended` state, and a granted execution keeping its slot (design D4)

## 3. Records

- [x] 3.1 Proposal, design, worker-runtime delta, `verification.md`
- [x] 3.2 `npm run openspec -- validate end-assignment-on-not-active --strict` and `make verify`
- [x] 3.3 Independent review pass 1 (Low only)
- [x] 3.4 Fix the pass 1 findings without another pass
