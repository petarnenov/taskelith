## 1. Modules and adapters

- [x] 1.1 Add the evidence domain, the `EvidenceStore` and `EvidenceRecords` ports, the in-memory records adapter, and the conformance suites.
- [x] 1.2 Add `@taskelith/evidence-volume` and let the durable file helpers write bytes.
- [x] 1.3 Add the `evidence` migration, `PostgresEvidenceRecords`, and the held generations from assignments.

## 2. Control plane

- [x] 2.1 Add `EvidenceService` and fill `readTaskResult` with the task's evidence.
- [x] 2.2 Add `readEvidence` and `downloadEvidence` with binary responses, and open the volume in the composition.
- [x] 2.3 Add `publishEvidence` with the multipart reader, on the worker authentication of `add-worker-bearer-authentication`.
- [x] 2.4 Record the `evidence/` subtree in the installation contract.

## 3. Verification and review

- [x] 3.1 Add unit, conformance, and end-to-end tests.
- [ ] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Claude Code `claude-fable-5-1`, medium, read-only) and record the results.
