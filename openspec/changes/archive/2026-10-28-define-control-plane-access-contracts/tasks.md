## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`

## 2. Contract

- [x] 2.1 Write `packages/contracts/documents/control-plane.openapi.json` 0.1.0 with its schemes, failures, and 34 operations
- [x] 2.2 Register it in `scripts/generate-contracts.ts` and refuse a security scheme name with two definitions (`mergeSecuritySchemes`)
- [x] 2.3 Write `docs/contracts/control-plane-wire-contracts.md` and link it from the G3 plan row 9 and the execution wire contracts
- [x] 2.4 Write the spec deltas: the new `control-plane-wire-contracts` capability and `sdlc-wire-contracts` "Generated types"

## 3. Tests

- [x] 3.1 Add the contract tests of the control-plane document and the document to the shared-vocabulary test
- [x] 3.2 Add the generator tests of the security scheme check, with its fail-before on `9196804b`

## 4. Verification and review

- [x] 4.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 4.2 Review pass 1 by reviewer A
- [x] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [x] 4.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 5. Archive

- [x] 5.1 Archive the change in the last commit of the branch and record the archive checks
