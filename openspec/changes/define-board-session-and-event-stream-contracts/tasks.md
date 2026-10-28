## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`

## 2. Contract

- [x] 2.1 Add the 17 operations, their schemas, and the event unions to `packages/contracts/documents/control-plane.openapi.json` 0.2.0
- [x] 2.2 Add `delivery-acknowledgement` to `NEEDS_YOU_KINDS` and `NeedsYouAnswer`, and to the product ports contract section 4.1
- [x] 2.3 Write sections 8 to 10 of `docs/contracts/control-plane-wire-contracts.md`, update its other sections, and correct the session timeline contract section 5.5
- [x] 2.4 Write the spec deltas of `control-plane-wire-contracts` and `product-ports`

## 3. Tests

- [x] 3.1 Add the contract tests of the 9b operations, events, and vocabularies, and move the 9a tests' helpers into one module
- [x] 3.2 Update the product ports test of `NEEDS_YOU_KINDS` and add the acknowledgement answer test

## 4. Verification and review

- [x] 4.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [x] 4.2 Review pass 1 by reviewer A
- [ ] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [ ] 4.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 5. Archive

- [ ] 5.1 Archive the change in the last commit of the branch and record the archive checks
