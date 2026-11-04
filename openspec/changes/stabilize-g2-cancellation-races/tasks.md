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
- [x] 3.4 Independent review, recorded in `verification.md`.

## 4. Pass 1 fix round

- [x] 4.1 Log a contact transaction that throws, and keep the consumed outcome (M1).
- [x] 4.2 Add the `worker-contact` delta and qualify the successful-contact scenarios (M2).
- [x] 4.3 Separate retirement from revocation, with a test of a reachable worker revoked before its contact (L1).
- [x] 4.4 Correct the evidence and assertion claims in `verification.md` (L2, L3).
- [x] 4.5 Record the findings, run `make verify` and `make verify-linux-g2-scenarios`, and record the checks.

## 5. Pass 2 fix round

- [x] 5.1 Log a thrown contact transaction at error level with a reason, and keep the consumed outcome (L1).
- [x] 5.2 Rename `recordContactOf` to `recordUnconsumedContact` and say that it goes through `authenticateObserver` (L2).
- [x] 5.3 Test the two failure branches of `recordCurrentContact` (L3).
- [x] 5.4 Correct the citations and name the coordinator's known-flake list (L4, L5).
- [x] 5.5 Record the findings, run `make verify` and `make verify-linux-g2-scenarios`, record the checks, and archive.
