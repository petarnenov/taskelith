## 1. Composition

- [x] 1.1 `ScenarioInstallation`: a database, data root, broker account, and `startControlPlane` per scenario, with short timers
- [x] 1.2 `ScenarioWorker` on the product's `startWorker`, with a process-group launch host, scaled timers, and seeded draws and identities
- [x] 1.3 Test-side writers (`cancelInTransaction`, `supersedeUngrantedInTransaction`), `OrderedAuthority`, the ack interception, and the crash-before-ack worker process
- [x] 1.4 Adopt the 24a recorder (cherry-picked) with target `harness-composition`

## 2. Scenarios

- [x] 2.1 Partition and reconnect: worker to NATS, control plane to PostgreSQL
- [x] 2.2 Cancellation races a to h, with g not applicable on Linux
- [x] 2.3 Stale ownership generation and stale recovery epoch with two workers
- [x] 2.4 Expected failures for product bugs, with evidence in `verification.md`

## 3. Records

- [x] 3.1 Evidence run into `results.jsonl`, `make verify`, and `verification.md`
- [x] 3.2 Independent review (pass 1 and pass 2 done and fixed)
- [x] 3.3 Return after the macOS integration hang: revert the archive, merge `dev`, bound the waits and cleanup, skip off Linux, refresh the evidence
- [x] 3.4 Review pass 3 and its fixes, then archive again
