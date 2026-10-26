## 1. Fix

- [x] 1.1 Locate the rule in the execution wire contracts and the launch authorization contract
- [x] 1.2 Scope `isCancelled` in `packages/modules/execution/src/domain/journal-recovery.ts` to the intent's last execution

## 2. Tests

- [x] 2.1 A cancellation of a superseded execution leaves the last one to be retried or relaunched
- [x] 2.2 A cancelled last execution sealed before its start ends the intent
- [x] 2.3 An attempt cancellation still stops every execution of its intent
- [x] 2.4 Prove 2.1 fails on the old source (not committed)

## 3. Records

- [x] 3.1 Proposal, design, worker-runtime delta, `verification.md`
- [x] 3.2 `npm run openspec -- validate scope-execution-cancellation-recovery --strict` and `make verify`
- [x] 3.3 Independent review pass 1; its two Low findings fixed
