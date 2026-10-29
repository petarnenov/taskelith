## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's decisions of 2026-10-29 verbatim in the design

## 2. Implementation and tests

- [x] 2.1 The slot commands besides adding, with the outcomes of Q2, and the revocation of the attempts that hold the slot
- [x] 2.2 `SlotCredentials.listStored`, `AssignmentRepository.listHeldForCredential`, their adapters, migration `1792933500000`, and conformance cases
- [x] 2.3 `sweepSlotCredentials` with its grace age of at least one hour
- [x] 2.4 The later-epoch rule of `FetchedRunSlotCredentials`
- [x] 2.5 Tests: commands, sweep, gated PostgreSQL races of revocation against placement and re-delivery, migration, redaction, and their fail-before runs

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the contract and plan updates
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
