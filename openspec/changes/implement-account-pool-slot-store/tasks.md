## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's answers to the open questions of the design, merge `origin/dev` `62217e7a`, and apply the answers

## 2. Implementation and tests

- [x] 2.1 `countNotRemoved`, `AdmittedDeliveries`, the in-memory doubles in `src/adapters/`, and `accountSlots` in `CapacityTransaction`
- [x] 2.2 Eligibility, least-loaded selection, and `selectSlotInTransaction` for `new-session`
- [x] 2.3 `placeInTransaction` with `slotRequest`, the credential step, and the slot write with the reservation
- [x] 2.4 `addAccountSlot` with the pair limit
- [x] 2.5 The PostgreSQL migration, `PostgresAccountSlots`, and `PostgresSlotCredentials`
- [x] 2.6 `AesGcmSlotCredentialCipher` and `openSlotCredentialKey`
- [x] 2.7 The slot rejecting reasons in Scheduling, apart from `REJECTING_REASONS`, the board, and the wire
- [x] 2.8 Tests: conformance on both adapters, selection, placement, add-slot, encryption at rest, redaction, PostgreSQL races, migration, neutrality, and their fail-before run

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the contract updates
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`; route again after the answers changed the diff

## 4. Review and archive

- [x] 4.1 Review passes with reviewers A and B, recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of the unreviewed pass 2 fixes
- [ ] 4.3 Archive the change in the last commit of the branch
