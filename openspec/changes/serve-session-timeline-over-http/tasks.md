## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with its coordinator questions, the spec deltas, and this task list
- [x] 1.3 Record the coordinator's answers to Q1 to Q9 of the design, and amend the design, deltas, and tasks where an answer says so

## 2. Implementation and tests

- [x] 2.1 `refused` on the wire: the document, its version, the contract sections 1, 9, and 11, the contract test, and the breaking-change declaration
- [x] 2.2 The section 9 routes except `readAgentSessionOutput`, handlers, wire mapping and reasons, `SessionScopes`, `ViewPositions`, and turn identifiers with `parseTurnId`, with fail-before tests of refused roles, scope, and mapping
- [x] 2.3 The native request source with its item and audit tables and migration `1792933100000`, written in the timeline transactions, with fail-before and PostgreSQL race tests
- [x] 2.4 The digest key at installation initialization when missing, the composition wiring, the installation contract row, and G3 plan row 13 with 13a to 13d
- [x] 2.5 The architect-check line of the archived 13a record names the reviewed commit

## 3. Records and checks

- [ ] 3.1 Merge `origin/dev` when it moved, route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
