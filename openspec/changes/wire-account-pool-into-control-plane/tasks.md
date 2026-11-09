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

## Resume point (2026-11-05, paused at the weekly usage limit)

- Pass 1 (`codex gpt-6-astra#medium`, role A, session `01a1aa8b-64b9-7563-8c98-3fa8bdde7833`) ran: Critical 0, High 1, Medium 4, Low 3. Recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`, the findings as open.
- Fixed: none. Open: all eight findings (H1 credential-store errors in failures, M2 update order, M3 store unavailable as 500, M4 partial sweep failures unlogged, M5 `account-slot-api` branch coverage, L6 sweep scenario wording, L7 empty cooldown, L8 four versus five descriptions), and the Q13 revocation-starvation limitation in `design.md`.
- Planned fixes: a typed unavailable rejection of the credentials port that `PostgresSlotCredentials` throws; fixed 503 and 500 messages in `AccountSlotService.add` and `rotate`; a read-only updatable-slot check before the 400 of an unknown project; a logged sweep with failed slots.
- `make verify` has not run after pass 1.
