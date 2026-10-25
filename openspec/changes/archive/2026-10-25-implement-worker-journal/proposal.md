## Why

G2 item 14 implements the worker journal contract of item 5: a worker must not lose a command it acknowledged, start work it cannot account for, or forget a fact before the control plane has it. ADR 0007 deferred the data namespace rules of the storage contract, root resolution, symbolic link and ownership handling, and the root lock, to G2. Items 15, 20, and 21 build on the journal, and item 10's harness now lets each commit be crash-tested.

## What Changes

- Add the `WorkerJournal` port, the journal records, and `planJournalRecovery`, the recovery table of contract section 5, to the `execution` module.
- Add `packages/adapters/worker-journal` (`@taskelith/worker-journal`): `dataRoot` resolution, refusal of a data root inside a Git working tree, the subtree checks, the volume check, the durable file rule, the root lock through SQLite's exclusive locking, enrollment's journal-first layout, the start checks, a new journal incarnation, and the SQLite journal with the W1 to W6 commits, the outbox, and fail-closed handling of I/O errors that lasts until the host restarts.
- Add unit, filesystem, and crash-point tests, including a kill before and after each W commit.
- Add `docs/worker-journal-qualification.md` and the `worker-journal-adapter` capability.

## Capabilities

### New Capabilities
- `worker-journal-adapter`: the implemented worker journal and its qualification results.

### Modified Capabilities

## Impact

Private workspace code only; the published `taskelith` package is unchanged. No new npm dependency: `node:sqlite` proved fit, so the `better-sqlite3` fallback is not installed. `@taskelith/testing` is a development dependency of the adapter. The macOS `F_FULLFSYNC` gate stays open for items 14 and 25.
