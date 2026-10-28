## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`

## 2. Contract

- [x] 2.1 Extend `packages/contracts/documents/execution.openapi.json` to 0.6.0 with the session schemes, the per-project evidence reads, and the eight 9c operations
- [x] 2.2 Write section 8 of `docs/contracts/execution-wire-contracts.md` and link it from the G3 plan row 9 and the account pool contract section 7
- [x] 2.3 Write the `execution-wire-contracts` spec delta

## 3. Tests

- [x] 3.1 Add `packages/contracts/test/execution-http-contracts.test.ts`, with its fail-before on `ff7ab7a0`

## 4. Verification and review

- [x] 4.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 4.2 Review pass 1 by reviewer A
- [x] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [x] 4.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 5. Archive

- [x] 5.1 Archive the change in the last commit of the branch and record the archive checks
