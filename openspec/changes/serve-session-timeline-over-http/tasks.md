## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with its coordinator questions, the spec deltas, and this task list
- [ ] 1.3 Record the coordinator's answers to Q1 to Q9 of the design, and amend the design, deltas, and tasks where an answer says so

## 2. Implementation and tests

- [ ] 2.1 `refused` on the wire: the document, its version, the contract sections 9 and 11, the contract test, and the breaking-change check
- [ ] 2.2 The section 9 routes, handlers, wire mapping and reasons, `SessionScopes`, `ViewPositions`, and turn identifiers, with fail-before tests of refused roles, scope, and mapping
- [ ] 2.3 The native request source with its item table and migration, written in the timeline transactions, with fail-before and PostgreSQL race tests
- [ ] 2.4 Output redacted across chunks with the held tail, its table and migration, the release before each turn and generation end, entry splitting, the output read, and its route, with fail-before and crash tests (13d if the split is accepted)
- [ ] 2.5 The digest key at installation bootstrap, the composition wiring, the installation contract row, and G3 plan row 13

## 3. Records and checks

- [ ] 3.1 Merge `origin/dev` when it moved, run `make verify`, route the change, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
