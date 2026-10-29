## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's answers to the open questions Q1 to Q8 of the design and apply them

## 2. Implementation and tests

- [x] 2.1 The delivery checks, the delivery record, and its PostgreSQL migration and adapter
- [x] 2.2 `SlotCredentialDeliveryService` and the TLS-only route `fetchSlotCredential`
- [x] 2.3 `HttpSlotCredentialClient` and the worker's `RunSlotCredentials` implementation
- [x] 2.4 Tests: checks, record, refusals, the gated PostgreSQL race, redaction on every new output path, no credential in the database or on NATS, and their fail-before runs
- [x] 2.5 Fix the six findings of review pass 1, each with tests that fail before the fix
- [x] 2.6 Fix the seven Low findings of review pass 2 without another review, each behavior fix with a test that fails before it

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the contract and plan updates
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Architect check by the coordinator of any unreviewed fixes
- [x] 4.3 Archive the change in the last commit of the branch
