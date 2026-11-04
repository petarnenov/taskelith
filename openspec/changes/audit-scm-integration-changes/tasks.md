## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the coordinator decisions, the `control-plane-api`, `postgres-state`, and `scm-port` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The `ScmIntegrationAudit` port, its conformance suite, the in-memory adapter, the audit entry of the store's `add` and `update`, and the clock and invocation of `ScmIntegrationService`, with tests failing before them
- [x] 2.2 Migration `1792934400000_scm-integration-audit-events`, the PostgreSQL adapter, and the audit write in the store's transaction, with migration, conformance, and rollback tests failing before them
- [x] 2.3 The handlers' actor and reason and the composition's clock, with HTTP tests of the audit rows, the refusals, and the redaction failing before them
- [x] 2.4 Control-plane wire contracts section 4

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
