## 1. Modules and persistence

- [x] 1.1 Add the `InventoryRequests` and `InventoryReports` ports to Execution, and extend `ProducerCursors` with `listByWorker`, journal retirement, and the highest received `snapshot`, with in-memory adapters and conformance suites.
- [x] 1.2 Add the inventory domain functions to Execution: assembling a snapshot from its parts, the rollback check against a bound, and the omission classification.
- [x] 1.3 Add the evidence kind `cancellation-not-applied`, which keeps the cancellation request pending and does not make the execution unknown.
- [x] 1.4 Add the acceptance provenance of an assignment, `AssignmentRepository.listUnfinishedByWorker`, the outbox lookup by event identity, and `WorkerReports.recordJournalLoss` to Scheduling, with in-memory adapters and conformance tests.
- [x] 1.5 Add `replaceJournal` to the control-plane transaction's worker directory.
- [x] 1.6 Add the migration `1792932300000_inventory-reconciliation.sql` and the PostgreSQL adapters, wire them into `PostgresTransaction` and `ControlPlaneTransaction`, and add the new tables to the test database.

## 2. Transport and control plane

- [x] 2.1 Publish inventory requests without a `Nats-Msg-Id` header.
- [x] 2.2 Add `InventoryService`: report authentication, the inbox by `reportId.part`, first contact, pending parts, inventory requests with their bound, the rollback check, and the application of a snapshot.
- [x] 2.3 Extend `ObservationService`: new journal incarnations, journal retirement after a sequence rollback, the effects of the four newly consumed observation types, acceptance provenance, and the evaluation of pending snapshots after each cursor advance.
- [x] 2.4 Re-send offers unchanged from the stored outbox row, and reconcile assignments that lost their local history.
- [x] 2.5 Route inventory reports to `InventoryService` in the composition root, and add `InventoryService.requestAll`, which requests the inventory of the active workers it is given once at start.
- [x] 2.6 (after merging dev) Wire the start requests in the composition root to the active workers from `FleetRegistry.activeWorkerIds()`.

## 3. Documents

- [x] 3.1 Keep `execution.asyncapi.json` at 0.3.0 and the worker journal contract unchanged, and change only the inventory request text of wire contracts section 6, as the coordinator approved.

## 4. Verification and review

- [x] 4.1 Add unit, conformance, PostgreSQL, and NATS integration tests, including the control-plane half of worker journal required tests on a missing journal and on a restored journal (lines 217-218).
- [x] 4.2 Add the security tests of design decision 2: a previously seen journal, a revoked worker's unseen journal, and another worker's journal are each refused without effect.
- [x] 4.3 Run `make verify` and record the results.
- [x] 4.4 Obtain independent review from the reviewer the coordinator assigns, and record the results.
