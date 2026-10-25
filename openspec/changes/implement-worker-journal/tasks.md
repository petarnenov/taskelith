## 1. Domain and port

- [x] 1.1 Add the journal records, the `WorkerJournal` port, and `planJournalRecovery` to the execution module.

## 2. Adapter

- [x] 2.1 Add data root resolution, the subtree and volume checks, the durable file rule, and the root lock.
- [x] 2.2 Add the SQLite journal with its settings, start checks, W1 to W6 commits, outbox, and fail-closed handling.
- [x] 2.3 Add enrollment's layout and a new journal incarnation.

## 3. Tests and record

- [x] 3.1 Add unit, filesystem, and crash-point tests.
- [x] 3.2 Write `docs/worker-journal-qualification.md` and the `worker-journal-adapter` capability.

## 4. Verification and review

- [x] 4.1 Run `make verify` and `openspec validate --strict`.
- [ ] 4.2 Obtain the independent review and record the results.
