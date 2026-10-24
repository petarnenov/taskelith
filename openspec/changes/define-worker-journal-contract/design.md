## Context

G2 work plan item 5. Decision D4 (a) selected SQLite through `node:sqlite` on Node 24.22.1, with `better-sqlite3` as the fallback; decision D7 (c) selected one supervisor per execution that writes its exit status durably. The storage contract names the `worker/` subtree, the trust model the identities, and the operational targets the disk floor, the backlog limit, and the broker retention. Items 3 and 4 are in review in parallel and define the launch authorization and the execution record that this journal serves.

## Goals / Non-Goals

**Goals:** a single write order that makes every acknowledgement, request, hand-off, and report follow a durable commit; durability settings stated as requirements; defined behavior for every disk failure the plan names; detection of a lost or rolled-back journal at the control plane.

**Non-Goals:** the journal schema, code, the wire messages (item 8), credential content (item 13), and the supervisor's own files beyond their write rule (item 4).

## Decisions

1. **Commit before action.** Every protocol action follows the commit that records it (W1 to W7), and every action is idempotent, so recovery repeats it instead of guessing. Alternative rejected: acting first and journaling after, which loses facts in the crash window.
2. **WAL with `synchronous = FULL`, `fullfsync` on macOS, and `EXCLUSIVE` locking.** `NORMAL` loses the last commits on power loss, and macOS `fsync` does not flush the drive cache. Exclusive locking keeps any second connection out and avoids the shared-memory file.
3. **A flush failure stops the journal.** After an `fsync` error the disk state is unknown and a retried `fsync` proves nothing; the worker reopens and continues from what persisted.
4. **Deterministic observation identity.** A fact derived again after a lost write gets the same `observationId`, so the outbox's publication mark needs no durability and a full disk loses no fact that still has a source.
5. **Journal incarnation and producer sequence.** `journalId` and a gapless per-incarnation sequence let the control plane detect a lost or restored journal; a worker never creates a journal on its own after loss or corruption, and an operator starts a new incarnation explicitly.
6. **Create once by `link`.** Writing to a temporary file and linking it to the final name gives item 4's exclusive `fate` creation with its content in one durable step, so a crash cannot leave an empty `fate`.

## Risks / Trade-offs

- `node:sqlite` is a release candidate in Node 24.22.1; the fallback keeps the same file format, and item 14's tests decide.
- Node has no `flock` API; the lock mechanism is an item 14 qualification shared with item 4.
- Storage that acknowledges unperformed flushes defeats any software guarantee; native acceptance records the storage used.
- `synchronous = FULL` costs one sync per commit; the journal's write rate is a few commits per command and fact.
