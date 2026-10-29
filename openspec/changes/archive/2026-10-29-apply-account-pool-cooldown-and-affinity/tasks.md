## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's answers to the open questions Q1 to Q6 of the design and apply them

## 2. Implementation and tests

- [x] 2.1 `resumed-session` selection in the placement transaction, replacing 12a's refusal
- [x] 2.2 `after-limit` selection in the placement transaction, replacing 12a's refusal
- [x] 2.3 The cooldown rule and `applySlotLimitInTransaction` for a plugin's `limit` event
- [x] 2.4 Tests: selection, placement, cooldown, the limit command, neutrality, secrecy, the gated PostgreSQL races, and their fail-before run

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the contract updates
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Architect check by the coordinator of any unreviewed fixes
- [x] 4.3 Archive the change in the last commit of the branch
