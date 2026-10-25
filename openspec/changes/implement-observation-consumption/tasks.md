## 1. Modules and persistence

- [x] 1.1 Add the `ProducerCursors` port to Execution, with an in-memory adapter and a conformance suite.
- [x] 1.2 Return the kept-versus-released outcome from `releaseInTransaction` and `ResourceAdmissionService.releaseAfterTerminalFact`, updating every caller and test.
- [x] 1.3 Add `automaticRetryOf`, `AssignmentRepository.byOfferCommand`, and the `WorkerReports` port to Scheduling, with in-memory adapters and conformance tests.
- [x] 1.4 Add the migration and the PostgreSQL adapters.

## 2. Transport and control plane

- [x] 2.1 Publish confirmations without a `Nats-Msg-Id` header.
- [x] 2.2 Add `ObservationService` and run the observation consumer in the composition root.
- [x] 2.3 End rejected placements, place retries as automatic, and keep `readTaskResult` pending while an attempt is active.

## 3. Verification and review

- [x] 3.1 Add unit, conformance, PostgreSQL, and NATS integration tests.
- [x] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
