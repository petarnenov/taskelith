## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the coordinator decisions, the two deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The token identifier, the registry methods, the refusal rules, the in-memory adapter, `EnrollmentTokenService`, and the revoked-token redemption, with conformance cases and tests failing before them
- [x] 2.2 The migration with its backfill and the PostgreSQL adapter, with the migration test and the conformance suite failing before them
- [x] 2.3 The five routes, `FleetApi`, `ApiServices.fleet`, and the composition, with route, role, redaction, and status tests failing before them
- [x] 2.4 Control-plane wire contracts section 12 note on the revoked-token redemption

## 3. Records and checks

- [ ] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
