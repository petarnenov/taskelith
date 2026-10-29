## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with its coordinator questions, the spec deltas, and this task list
- [x] 1.3 Record the coordinator's answers to Q1 to Q4 of the design, and amend the design, deltas, and tasks where an answer says so

## 2. Implementation and tests

- [x] 2.1 The hold rule and the over-bound markers of answer Q1 in `@taskelith/secrets` behind `SessionOutputRedactor`, with every split of every known shape across two and three chunks failing first against per-chunk redaction
- [x] 2.2 The tail store port, its in-memory and PostgreSQL adapters, migration `1792933400000`, and the conformance and down migration tests
- [x] 2.3 The tail sealed with the 12a AES-256-GCM cipher (answer Q2), the key file `session-output-tail.key` created by `init` and required at the start, with key, tamper, and at-rest tests, and the installation contract row
- [x] 2.4 The service: append with the hold and the bound, release at the turn's end (answer Q3), entry splitting (answer Q4), and `readOutput`, with bound, release, crash, and race tests
- [x] 2.5 The `readAgentSessionOutput` route with its scope, mapping, and page tests, and the wire contracts section 7 amendment

## 3. Records and checks

- [x] 3.1 Merge `origin/dev` when it moved, route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three: pass 1 reviewer A, pass 2 reviewer B, and pass 3 reviewer A only when the governance rule asks for it, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
