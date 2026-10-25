## 1. Modules and persistence

- [ ] 1.1 Add the `InventoryRequests` and `InventoryReports` ports to Execution, and extend `ProducerCursors` with `listByWorker`, journal retirement, and the highest received `snapshot`, with in-memory adapters and conformance suites.
- [ ] 1.2 Add the inventory domain functions to Execution: assembling a snapshot from its parts, the rollback check against a bound, and the omission classification.
- [ ] 1.3 Add the evidence kind `cancellation-not-applied`, which keeps the cancellation request pending and does not make the execution unknown.
- [ ] 1.4 Add the acceptance provenance of an assignment, `AssignmentRepository.listUnfinishedByWorker`, the outbox lookup by event identity, and `WorkerReports.recordJournalLoss` to Scheduling, with in-memory adapters and conformance tests.
- [ ] 1.5 Add `replaceJournal` to the control-plane transaction's worker directory.
- [ ] 1.6 Add the migration `1792932300000_inventory-reconciliation.sql` and the PostgreSQL adapters, wire them into `PostgresTransaction` and `ControlPlaneTransaction`, and add the new tables to the test database.

## 2. Transport and control plane

- [ ] 2.1 Publish inventory requests without a `Nats-Msg-Id` header.
- [ ] 2.2 Add `InventoryService`: report authentication, the inbox by `reportId.part`, first contact, pending parts, inventory requests with their bound, the rollback check, and the application of a snapshot.
- [ ] 2.3 Extend `ObservationService`: new journal incarnations, journal retirement after a sequence rollback, the effects of the four newly consumed observation types, acceptance provenance, and the evaluation of pending snapshots after each cursor advance.
- [ ] 2.4 Re-send offers unchanged from the stored outbox row, and reconcile assignments that lost their local history.
- [ ] 2.5 Route inventory reports to `InventoryService` in the composition root, and request every active worker's inventory once at start.

## 3. Documents

- [ ] 3.1 Confirm that no contract or document changes: `execution.asyncapi.json` stays 0.3.0, and the wire contracts and the worker journal contract are unchanged.

## 4. Verification and review

- [ ] 4.1 Add unit, conformance, PostgreSQL, and NATS integration tests, including the control-plane half of worker journal required tests on a missing journal and on a restored journal (lines 217-218).
- [ ] 4.2 Add the security tests of design decision 2: a previously seen journal, a revoked worker's unseen journal, and another worker's journal are each refused without effect.
- [ ] 4.3 Run `make verify` and record the results.
- [ ] 4.4 Obtain independent review from the reviewer the coordinator assigns, and record the results.
