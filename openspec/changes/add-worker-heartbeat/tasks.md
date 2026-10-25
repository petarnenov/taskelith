## 1. Contract

- [x] 1.1 Add the heartbeat channel, operation, message, and `WorkerHeartbeat` schema to `execution.asyncapi.json`, at version 0.4.0, and pass `make contract-compatibility`.
- [x] 1.2 Document the subject, the message, and the permission in the contract page, the enrollment contract, and the trust model, and the targets in `docs/operational-targets.md`.

## 2. Transport

- [x] 2.1 Add the heartbeat subject and the worker's publish permission to `TransportAddress`.
- [x] 2.2 Add `readHeartbeatSubjectMessage` and the `HeartbeatReceiver`.

## 3. Scheduling and control plane

- [x] 3.1 Add `WorkerReports.markContactLost` with in-memory and PostgreSQL adapters and a conformance case.
- [x] 3.2 Add `HeartbeatService` and `LostContactCheck`, share the producer authentication, and run both in the composition root.

## 4. Verification and review

- [x] 4.1 Add contract, transport, broker permission, conformance, unit, and PostgreSQL tests.
- [x] 4.2 Run `make verify` and record the results.
- [ ] 4.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
