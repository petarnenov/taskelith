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
