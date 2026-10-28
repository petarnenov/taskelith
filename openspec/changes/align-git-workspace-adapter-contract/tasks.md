## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and paste it into `design.md`

## 2. Contract and spec

- [x] 2.1 Name the crash points `WS1` to `WS10` in contract section 3 and the spec's "Crash-safe lifecycle"
- [x] 2.2 Fix the snapshot format, its content type, and the gitlink refusal (contract section 10, "Head evidence snapshot", "Snapshot archive format")
- [x] 2.3 Fix the credential transport and HTTPS remotes (contract section 7, "Per-run credential use", "HTTPS remotes", "Prepare refusals")
- [x] 2.4 Define "never forced" and the push options (contract section 8, "Fast-forward task branch push")
- [x] 2.5 Add the `handedOff` read (contract section 3, "Hand-off state")
- [x] 2.6 Name the reclaim containment, its scan exclusion, its proof after a restart, and the failed program's outcome (contract section 3, "Reclaim program containment", "Failed reclaim program")
- [x] 2.7 State the reclaim program on one account (contract sections 2 and 3, "Reclaim program on one account")
- [x] 2.8 Add the pinned Git client (contract section 7, "Pinned Git client")
- [x] 2.9 State the single slot and its start refusal (contract section 3, "Single slot with a shared execution account")
- [x] 2.10 Move the delegated-child half of the "One handed-off workspace" test to item 38, and name 16a to 16e in the item 16 row (contract sections 13 and 14, `docs/g3-plan.md`)
- [x] 2.11 Add the pending gate for the suite natively on macOS (contract section 13)

## 3. Port, suite, and double

- [x] 3.1 Add the port read, the domain values and rules, and the fixture hooks
- [x] 3.2 Add the conformance cases and record their failure against the unchanged double
- [x] 3.3 Make the double pass every case, add the defective variants, and add the unit tests

## 4. Verification and review

- [x] 4.1 Run strict validation of this change, `make findings ARGS="validate"`, and `make verify`; record `verification.md`, with the hosted Linux acceptance run 40618190663
- [ ] 4.2 Review pass 1 by reviewer A, recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`
- [ ] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [ ] 4.4 Review pass 3 by reviewer A, if pass 2 leaves fixes to confirm

## 5. Archive

- [ ] 5.1 Archive the change in the last commit of the branch and record the archive checks
