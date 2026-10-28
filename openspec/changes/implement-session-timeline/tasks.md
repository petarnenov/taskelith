## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with its coordinator questions, the spec deltas, and this task list
- [x] 1.3 Record the coordinator's answers to Q1 to Q10 of the design, and amend the design, deltas, and tasks where an answer says so

## 2. Implementation and tests

- [x] 2.1 Domain: the state `refused` (domain and store only; the wire list stays separate), `recordTurnAcceptanceUnknown`, `recordTurnRefused`, and the hold of `nextDeliverableTurn`, with fail-before unit tests
- [x] 2.2 The session timeline store port, its in-memory adapter, and the conformance suite
- [x] 2.3 The session timeline service with the digest and redaction ports and their adapters, the digest key file, and the start that refuses a missing or wrong-size key, with fail-before tests
- [x] 2.4 The PostgreSQL migration and repositories, the crash points, the conformance suite on PostgreSQL, and the race tests
- [x] 2.5 The crash tests of each path of the design

## 3. Records and checks

- [x] 3.1 Merge `origin/dev` (unchanged since the base), run `make verify`, route the change, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
