## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the coordinator decisions, the two deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 Scheduling: `list` and `listForProject` in both adapters with conformance cases, and the slot commands by expected revision, with tests failing before them
- [x] 2.2 `RandomIdentifiers.newSlotId`, `SlotCredentialKeyFile`, and the key at initialization, with tests failing before them
- [x] 2.3 The OpenAPI descriptions of the slot commands and their contract test
- [x] 2.4 The control plane: settings, `AccountSlotService`, `AccountSlotApi`, the routes, the endpoint split, and the composition with the key, the store, the admitted pair, the delivery, the sweep loop, and the slot signals, with unit and Docker tests failing before them
- [x] 2.5 Account pool contract sections 6.1, 13, and 14, and control-plane wire contracts "Account slots"

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch

## Resume point (2026-11-10, pass 1 fixes committed)

- Pass 1 (`codex gpt-6-astra#medium`, role A, session `01a1aa8b-64b9-7563-8c98-3fa8bdde7833`) ran: Critical 0, High 1, Medium 4, Low 3. Recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`, the findings as open.
- Fixed and committed, unreviewed: all eight findings (`findings.jsonl` names each commit: H1 `335a331d`, M2 `ac0dd05a`, M3 `4e48d0a6`, M4 `ba2dfcd4`, M5 `00d0db64`, L6 and L7 `c17dea2f`, L8 `110f4a7b`), and the Q13 limitation in `design.md` (`110f4a7b`).
- Next: `make verify`, `make record`, and the coverage number of `api/account-slot-api.js` in `verification.md`, by the session.
- `make verify` has not run yet after the fixes.
