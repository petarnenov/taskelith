## 1. Fix

- [x] 1.1 Locate the rule in the execution wire contracts and the launch authorization contract
- [x] 1.2 `Launch.runs`, and `#forward` scoped by target in `apps/worker/src/launch-orchestrator.ts`

## 2. Tests

- [x] 2.1 A cancellation of a superseded execution leaves the running one alone and records its evidence
- [x] 2.2 An execution cancellation files `cancel` only for the named execution, with evidence at its exit
- [x] 2.3 An attempt cancellation still stops the running execution of its intent
- [x] 2.4 Prove 2.1 and 2.2 fail on the old source (not committed)

## 3. Records

- [x] 3.1 Proposal, design, worker-runtime delta, `verification.md`
- [x] 3.2 `npm run openspec -- validate scope-execution-cancellation --strict` and `make verify`
- [ ] 3.3 Independent review
