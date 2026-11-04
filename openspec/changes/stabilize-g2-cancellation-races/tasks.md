## 1. Diagnose

- [x] 1.1 Trace the failed waits of e and h to `postgres.serialization.exhausted` on the apply of `execution.started`, and the serialization failures to the contact write on the `workers` row.
- [x] 1.2 Find what the in-transaction contact protects, and write it in `design.md`.
- [x] 1.3 Reproduce deterministically: a heartbeat's transaction holds the worker row while an observation is applied, against the base `6dab1d26`.

## 2. Fix

- [x] 2.1 Record an observation's contact after its transaction, re-authenticated, never backward, with a logged failure.
- [x] 2.2 Share the current producer's contact with `HeartbeatService`.
- [x] 2.3 Add tests for the held worker row, the monotonic contact, the logged failure, and the retired or revoked worker.
- [x] 2.4 Modify "One transaction per observation" and "First contact" in `observation-consumption`.

## 3. Verify

- [x] 3.1 Run e and h 30 times each, 15 under a CPU hog, and five parallel loops of three full-file runs.
- [x] 3.2 Run `make verify-linux-g2-scenarios`.
- [x] 3.3 Run `npm run openspec -- validate stabilize-g2-cancellation-races --strict`, probe the archive in a scratch copy, and run `make verify`.
- [ ] 3.4 Independent review, recorded in `verification.md`.
