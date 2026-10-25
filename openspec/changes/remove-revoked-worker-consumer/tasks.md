## 1. Ports and adapters

- [x] 1.1 Add `remove` to `WorkerCommandConsumers`, idempotent, and implement it in the NATS adapter.
- [x] 1.2 Add `recentlyRevokedWorkerIds(limit)` to `FleetRegistry`, its in-memory and PostgreSQL implementations, and a conformance case.

## 2. Revocation and startup repair

- [x] 2.1 Remove the command consumer in `EnrollmentService.revoke` after the commit, and report a failure as `commandConsumerRemoved: false`.
- [x] 2.2 Connect the administration tool's revocation to the broker for the removal, and print a failed removal with a retry note.
- [x] 2.3 Remove the consumers of the latest revoked workers in `repairCommandConsumers`, bounded and logged.

## 3. Documentation

- [x] 3.1 Record the bound in the operational targets.

## 4. Verification and review

- [x] 4.1 Run `make verify`.
- [ ] 4.2 Run the independent review and record it in `verification.md`.
