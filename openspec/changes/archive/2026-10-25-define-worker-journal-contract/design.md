## Context

G2 work plan item 5. Decision D4 (a) selected SQLite through `node:sqlite` on Node 24.22.1, with `better-sqlite3` as the fallback; decision D7 (c) selected one supervisor per execution that writes its exit status durably. The storage contract names the `worker/` subtree, the trust model the identities, and the operational targets the disk floor, the backlog limit, and the broker retention. Items 3 and 4 are in review in parallel and define the launch authorization and the execution record that this journal serves.

## Goals / Non-Goals

**Goals:** a single write order that makes every acknowledgement, request, hand-off, and report follow a durable commit; durability settings stated as requirements; defined behavior for every disk failure the plan names; detection of a lost or rolled-back journal at the control plane.

**Non-Goals:** the journal schema, code, the wire messages (item 8), credential content (item 13), and the supervisor's own files beyond their write rule (item 4).

## Decisions

1. **Commit before action, recovery per step.** Every protocol action follows the commit that records it (W1 to W6), and a command's inbox entry commits with everything it asks, including a cancellation. Recovery decides per record from its last commit instead of repeating an action blindly: an accepted launch intent without a live execution continues with a current authorization even after its acknowledgement, an operation or grant from before a restart is abandoned and its execution sealed, a non-retryable rejection is never retried, and a journaled record or a recorded start goes to item 4's recovery until a terminal fact. Alternative rejected: acting first and journaling after, which loses facts in the crash window.
2. **WAL with `synchronous = FULL`, `fullfsync` on macOS, and `EXCLUSIVE` locking set first.** `NORMAL` loses the last commits on power loss, and macOS `fsync` does not flush the drive cache. Exclusive locking, set before the first WAL access, keeps any second connection out and avoids the shared-memory file. The WAL settings trigger checkpoints but are no hard cap, so the WAL counts toward the disk floor.
3. **A flush failure stops the journal until a host restart or a new incarnation.** After an `fsync` error the device state is unknown, a retried `fsync` proves nothing, and a reopened journal may read cached pages that never reached the device. Alternative rejected: reopen and continue, which can acknowledge on data a later power loss erases.
4. **Deterministic observation identity and application-level confirmation.** A fact derived again after a lost write gets the same `observationId`, so a full disk loses no fact that still has a source. A broker acknowledgement is transport only, and streams expire entries, so an entry stays until the control plane confirms it by sequence.
5. **Journal incarnation, sequence, and inventory.** `journalId` reveals a new journal, and the sequence reveals some rollbacks, but a restored journal can lose an acknowledged command without repeating a sequence. Restoring a journal is therefore forbidden, and on each reconnect the worker reports its assignments, so the control plane finds any omitted one, resends it when no grant exists, and reconciles it otherwise. A worker never creates a journal on its own after loss or corruption.
6. **Create once by `link`.** Writing to a temporary file and linking it to the final name gives item 4's exclusive `launch` and `supervisor.<n>` creation with content in one durable step, so a crash cannot leave an empty launch record.
7. **macOS full flush checked by filesystem, not per write.** SQLite and libuv both fall back to a plain `fsync` when `F_FULLFSYNC` fails, so the failure cannot be seen per write; the worker accepts only a filesystem that supports `F_FULLFSYNC`, and a reader syncs a create-once file it did not make durable before acting on it.
8. **Rules for control records only.** Workspaces hold project content with its own modes and symbolic links, so the ownership, mode, symbolic-link, and format rules apply to the control records, and `worker/` being `0700` closes the rest.

## Risks / Trade-offs

- `node:sqlite` is a release candidate in Node 24.22.1; the fallback keeps the same file format, and item 14's tests decide.
- Node has no `flock` API; the lock mechanism is an item 14 qualification shared with item 4.
- Storage that acknowledges unperformed flushes defeats any software guarantee; native acceptance records the storage used.
- `synchronous = FULL` costs one sync per commit; the journal's write rate is a few commits per command and fact.
