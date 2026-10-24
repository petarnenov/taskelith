# Worker journal contract

Date: 2026-10-25. Status: proposed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 5), under independent review; once reviewed and merged it resolves the pre-G2 contract "local journal durability" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation) and states the `worker/` rules of the data namespace that [ADR 0007](../decisions/0007-g0-closure.md) deferred to G2. It serves invariants 4, 7, and 14, step 4 and the failure behavior of [architecture section 9](../architecture.md#9-messaging-and-execution-protocol), and R05, R06, and R28. No code implements it yet: G2 items 7 (execution domain model), 8 (wire contracts), 14 (worker journal), 15 (process supervisor), 20 (worker runtime), and 21 (execution reconciliation) build on it, and items 24 and 25 run its failure scenarios and native acceptance.

## 1. Purpose and parties

A worker must not lose a command it acknowledged, start work it cannot later account for, or forget a fact before the control plane has it. The broker only buffers; publish and commit are not atomic across systems (architecture section 9). This contract defines what the worker persists, in which order, how durably, and what it does when the disk fails, fills, or disappears.

- **Worker:** the enrolled worker service ([trust model](../trust-model.md)). It is the only process that opens the journal.
- **Journal:** the worker's local SQLite database (decision D4 (a)), holding the inbox, launch intents, executions, launch authorization requests and grants, and the local outbox.
- **Execution supervisor:** the per-execution supervisor of decision D7 (c), under the supervisor identity contract (G2 item 4, `define-supervisor-identity-contract`). It never opens the journal; it writes its execution record under the durable file rule of section 4.
- **Launch authority:** the control-plane service of the launch authorization contract (G2 item 3, `define-launch-authorization-contract`).

## 2. The `worker/` subtree

The [storage contract](../storage.md) resolves `dataRoot` and assigns `worker/` to the local worker identity, installation binding, durable execution journal, and supervisor recovery records. Its layout is:

| Path under `dataRoot` | Content | Written by | Retention |
| --- | --- | --- | --- |
| `worker/lock` | The root lock (section 9) | Worker | For the root's lifetime |
| `worker/identity` | `installationId`, `workerId`, the credential references, and the `journalId` it is bound to (item 13 defines the credential content) | Enrollment | Until re-enrollment |
| `worker/journal/journal.sqlite` and its `-wal` file | The journal | Worker | For the journal incarnation's lifetime (section 8) |
| `worker/executions/<executionId>/` | The execution record (item 4) | Worker and supervisor | Until the execution's terminal fact is confirmed (section 6) |
| `worker/logs/` | Buffered stream logs, which are nonessential | Worker | Truncatable at any time |
| `worker/workspaces/` | Managed workspaces | Worker | Workspace rules; never touch the paths above |

Rules for the subtree:

- **Explicit creation.** Enrollment creates `worker/`; starting an unenrolled worker fails and creates nothing. Enrollment creates the journal first and `worker/identity` last, so an identity without a journal always means loss (section 8).
- **Ownership and permissions.** Every directory and file under `worker/` is owned by the worker's account, directories with mode `0700` and files with mode `0600`. A component owned by another account, or writable by group or others, fails startup.
- **No redirection.** No path component from `dataRoot` down is a symbolic link; the worker refuses one instead of following it. The checkout or a subtree of it is refused as `dataRoot` (storage contract).
- **Local, persistent filesystem.** The journal lives on a local filesystem that supports POSIX advisory locks and `fsync`. On Linux, `dataRoot` is a persistent volume mounted into the worker container (decision D5 (a)), never the container's writable layer; a network filesystem is refused.
- **One owner.** Separate workers on one host have distinct roots; a colocated control plane uses only `control-plane/`.
- **Separate retention.** Workspace removal and log truncation never delete the journal, the identity, or an execution record. Durable records never live in a cache, temporary, or log directory.

## 3. Store and durability settings

By decision D4 (a), the journal is SQLite through `node:sqlite` on the pinned Node 24.22.1, with `better-sqlite3` as the fallback. Both open the same SQLite 3 file format, so switching the binding changes no stored data; item 1 records the SQLite library version each binding bundles. The worker opens the journal with these settings, and item 14 verifies each one after opening:

| Setting | Required value | Reason |
| --- | --- | --- |
| `journal_mode` | `WAL` | Atomic commits with a single synced append per transaction |
| `synchronous` | `FULL` | A commit returns only after the WAL is synced; `NORMAL` may lose the last commits on power loss |
| `fullfsync` and `checkpoint_fullfsync` | `ON` | On macOS, `fsync` does not flush the drive cache; these make SQLite use `F_FULLFSYNC`. No effect on Linux |
| `locking_mode` | `EXCLUSIVE` | Only the worker's connection can open the journal; no shared-memory file is used |
| `foreign_keys` | `ON` | Records reference their parents |
| `application_id` | The Taskelith journal constant (item 14 fixes the value) | Rejects a foreign SQLite file |
| `user_version` | The journal format version (section 10) | Format versioning |
| `wal_autocheckpoint` and `journal_size_limit` | Bounded values chosen by item 14 | Bounds the WAL's disk use |

Every protocol write is one explicit transaction (`BEGIN IMMEDIATE` to `COMMIT`). After it first creates the database and WAL files, the worker syncs the `worker/journal/` directory, so that their directory entries survive a power loss.

**Guarantee.** A transaction whose `COMMIT` returned success survives a process crash, an operating-system crash, and a power loss, on storage that honors flush requests. A transaction whose `COMMIT` failed or did not return may or may not survive; section 7 says how the worker acts on that. Storage that acknowledges flushes it has not performed is outside the guarantee; native acceptance (item 25) records the storage of each matrix entry.

## 4. Durable file rule

Files outside the journal (the identity and the execution record of item 4) are written so that each is either absent or complete:

- **Create once:** write the content to a temporary file in the same directory, `fsync` it, `link` it to the final name, which fails if that name exists, remove the temporary name, and `fsync` the directory. This gives the exclusive creation that item 4's `fate` needs, with its content, in one step.
- **Replace:** the same, with `rename` instead of `link`. Only the identity is replaced, on re-enrollment.
- **Append-only:** each record is framed with its length and a checksum and is followed by an `fsync`. A torn record at the end is discarded on reading; a bad record anywhere else makes the file corrupt.
- **New directory:** after creating a directory, `fsync` its parent.

On macOS, `fsync` here means `F_FULLFSYNC`, for the reason section 3 gives. Every file carries a format version. A leftover temporary file is removed on start and never read.

## 5. Records and their write order

The journal holds these logical records; item 14 defines the schema:

- **Inbox:** one entry per `commandId`, with the command's kind, digest, and outcome (accepted, rejected with a reason, or duplicate). `commandId` entries are kept for the journal's lifetime, as the lifetime deduplication of the [operational targets](../operational-targets.md); a command's payload may be pruned once its assignment is terminal.
- **Launch intent:** the accepted assignment the worker means to launch: `assignmentId`, `attemptId`, `ownershipGeneration`, and the admission it names.
- **Execution:** `executionId` (item 4), its launch intent, and its state as this worker knows it: `intended`, `authorized`, `handed-off`, `started`, `exited`, `not-started`, or `uncertain`.
- **Authorization request:** `operationId`, its `executionId`, the expected values sent, and the outcome: the grant (`launchAuthId`, `issuedAt`, `ttl`, `skew`, the bound values) or the rejection reason (item 3).
- **Outbox:** observations to publish (section 6).
- **Journal metadata:** `journalId`, `installationId`, `workerId`, the recovery epoch the worker holds, and the next outbox sequence.

Each step below commits before the action that follows it. That order is the contract; a crash between a commit and its action is recovered by repeating the action, which is idempotent.

| # | Commit | Before | Protects |
| --- | --- | --- | --- |
| W1 | The inbox entry and its outcome, and for an accepted assignment its launch intent; for a rejected command, also its rejection observation | Acknowledging the command to the broker | An acknowledged command is never lost (architecture section 9, step 4) |
| W2 | A new `executionId` with state `intended`, and a new `operationId` with its expected values | Sending the first launch authorization request for that operation | Item 3 sections 6 and 7; item 4 crash point CP1 |
| W3 | The grant, and the execution as `authorized`; or the rejection, and for a non-retryable one its observation | Writing `intent` for the supervisor (item 4, CP2) | A grant is never used without a journaled trace; a restart never spawns under it (item 3 section 7) |
| W4 | The execution as `handed-off` | Starting the supervisor (item 4, CP3) | Recovery knows a supervisor may exist |
| W5 | A fact read from the execution record (`started` from `handle`, `exited` from `exit`), and its observation | Removing anything from the execution record | Facts reach the outbox before their source can go |
| W6 | The execution as `not-started`, and its observation | — ; it follows a `seal` written durably under section 4 | `not-started` is reported only after the irreversible seal (item 3 section 4, item 4 section 5) |
| W7 | A cancellation command's request for an execution | Acknowledging it | A cancellation is not lost; section 7 lets the worker forward it to the supervisor before W7 |

The worker writes its wall-clock time into records for diagnosis only. No safety decision reads it; the spawn deadline uses the monotonic reading item 3 keeps in memory.

A duplicate command (its `commandId` already in the inbox) is acknowledged again and changes nothing else. A command that fails validation is still journaled with its rejection before it is acknowledged, so that the rejection reaches the control plane through the outbox.

## 6. Local outbox of observations

- **Identity.** Each observation has an `observationId` derived deterministically from its source: from `commandId` for a command outcome, from `executionId` and the fact for an execution fact, and from `executionId`, the fact, and an evidence counter for a repeated `uncertain`. A fact derived again after a lost write therefore gets the same identity, and the receiver deduplicates it.
- **Producer sequence.** Each entry gets the next number of a gapless sequence per `(workerId, journalId)`, assigned in its transaction. Observations carry `workerId`, `journalId`, and the sequence (item 8), as the per-producer sequence of architecture section 9.
- **Publication.** The worker publishes only committed entries, retries each with the same `observationId` until the broker acknowledges it, and then marks it published. The mark needs no durability of its own: losing it only repeats a publication that the receiver deduplicates.
- **Retention.** A published entry is kept for the broker retention window of the operational targets (`7 days`), and an execution's terminal fact until the control plane confirms it (item 8 defines the confirmation); only then is the execution record removed (item 4).
- **Backlog limit.** When unpublished entries exceed `256 MiB` or `10,000` entries (operational targets), the worker accepts no new attempt: it rejects new assignments with a reason in W1 while existing attempts drain and reconcile.
- **Offline.** While the broker is unreachable, entries accumulate within the backlog limit; nothing is dropped.

## 7. Write failures

**Interrupted write.** A crash during a transaction leaves the journal as before or as after it: SQLite recovers the WAL on the next open. A crash during a file write under section 4 leaves the file absent or complete. Recovery reads the journal as the truth and repeats the next action of section 5.

**Flush failure.** An error from `COMMIT`, a synced write, or an `fsync` (in SQLite, an I/O error) means the state on disk is unknown, and a retried `fsync` cannot prove otherwise. The worker then:

1. takes none of the actions that the failed write was to precede: no acknowledgement, no request, no hand-off, no publication of it;
2. closes the journal, stops acknowledging commands, requesting launch authorizations, and publishing, and leaves running supervisors alone, because they do not depend on the journal;
3. reopens the journal after a bounded backoff, as a restart does, and continues from what it finds there; a write that did persist is then simply found, and its action is repeated idempotently;
4. after repeated failures stays stopped and reports the fault in its local service status and logs, since the outbox cannot carry it.

**Full disk.** The worker keeps the disk floor of the operational targets (`5 GiB` or `10%` free on the `dataRoot` volume, whichever is larger):

- **Below the floor:** it requests no new launch authorizations, rejects new assignments with an admission-pressure reason, reports admission pressure, and truncates only `worker/logs/`. Commands, cancellations, and observations are still journaled.
- **A write fails for lack of space:** the transaction rolls back as a whole. The command is not acknowledged and the broker redelivers it; an execution fact stays in its execution record and is derived again (W5). The worker truncates `worker/logs/` and retries with the backoff of the operational targets.
- **Cancellation under a full disk:** the worker may forward a cancellation to the supervisor before W7 commits, because cancelling never widens effects; it acknowledges the command only after W7.

## 8. Corrupt, missing, or rolled-back journal

**Journal incarnation.** `journalId` is a random 128-bit identifier created with the journal and recorded in `worker/identity`. It names one journal's history. The control plane keeps the latest `journalId` and the highest sequence it received per worker (item 21).

**Checks on every start,** before any other use: the `application_id`, the `user_version` (section 10), `PRAGMA quick_check`, and that the journal's `installationId`, `workerId`, and `journalId` match `worker/identity`.

| Found | Result |
| --- | --- |
| No `worker/identity` | Not enrolled: the worker does not start |
| Identity present, journal absent | **Journal loss.** The worker never creates a journal on its own |
| Wrong `application_id`, failed check, a corruption error at any time, or a binding mismatch | **Corrupt journal.** The worker stops and keeps the files untouched as evidence; it never repairs them |
| Newer `user_version` than it supports | Refuse to start (storage contract) |

After a journal loss or a corrupt journal, the worker acknowledges, requests, and publishes nothing until an operator explicitly starts a new journal incarnation, which moves any old file aside as evidence, creates a journal with a new `journalId`, and records it in `worker/identity`. The execution records survive, so their facts are reported again from the new incarnation (W5, W6).

**Detection at the control plane.** A worker that reports a new `journalId`, or a sequence at or below one already received with a different `observationId`, has lost or rolled back its journal. The control plane then treats every unfinished assignment of that worker as having lost its local history (section 11). A worker journal is therefore never restored from a backup: a restored journal is detected as rolled back.

## 9. Lock ownership

- **Root lock.** The worker holds an exclusive lock on `worker/lock` for its whole life, before it reads anything else under `worker/`. The kernel releases it when the process dies; a process ID file alone is never a lock. Failing to take it means another live worker owns the root, and the worker does not start.
- **Journal lock.** The journal's `EXCLUSIVE` locking mode (section 3) keeps any second connection out, even one that ignored the root lock.
- **Supervisors** never open the journal. They hold their own execution's `lock` (item 4).
- **Mechanism.** Node offers no `flock` API; the TypeScript mechanism that takes a kernel-released lock on each matrix entry is an item 14 qualification, shared with item 4's execution `lock`. Holding an SQLite exclusive lock on the lock file is a candidate.
- **Inspection.** Another process reads the journal only while the worker is stopped, or from a copy.

## 10. Format versioning

- `user_version` names the journal's format; `application_id` names it as a Taskelith journal. Every other file under `worker/` carries its own format version (section 4).
- A worker reads the current and the previous journal format. It migrates the previous one forward in a single transaction on start, so a crash leaves either format complete. It never downgrades a journal.
- A newer or unknown format fails startup; the worker never guesses around it.
- A worker package that changes the format states the change in its release notes, and a rollback to a version that cannot read the format requires a new journal incarnation (section 8).

## 11. Disk loss after acknowledgement

When the disk holding `dataRoot` is lost after the worker acknowledged commands, the broker will not redeliver them, and the worker's knowledge is gone. The architecture requires: the central unfinished assignment remains, and prior side effects are not assumed absent (section 9, failure behavior).

- **Whole root lost.** The identity and credentials are gone, so the worker cannot authenticate. It is enrolled again as a new worker; the old `workerId` is revoked, and its active attempts become uncertain, not dead ([trust model](../trust-model.md) section 4).
- **Journal lost, identity kept.** Section 8: the new incarnation is reported, and the control plane treats the worker's unfinished assignments as having lost their local history.
- **At the control plane (item 21).** Each such assignment keeps its ownership and its capacity reservation (item 6). Its attempt is reconciled as uncertain execution: no automatic retry (the retry budget for uncertain execution is `0`), no other execution authorized until reconciliation records a terminal fact (item 3 section 4), and the outcome is decided by evidence or by an operator. Reconciliation does not depend on broker acknowledgement history (architecture section 9, step 7).
- **On the worker.** Surviving processes are handled under item 4: on Linux a marker scan reports them as unrecorded processes, never as current work. No command is replayed from memory or from the broker's history; restored or lost state never enables automatic replay before reconciliation (invariant 14).

## 12. Obligations on other items

- **Item 3:** `operationId` and `executionId` are journaled before the first request (W2); the grant is journaled before it is used (W3); `not-started` is reported only after the seal (W6). A journal loss or rollback is a reconciliation trigger for its ownership rule.
- **Item 4:** its execution record uses the durable file rule of section 4, including create-once by `link` for `fate`; its `lock` shares the lock mechanism qualification of section 9.
- **Item 6:** the backlog limit and the disk floor of section 7 are worker-side admission limits; an execution whose local history was lost keeps its reservation.
- **Item 7:** the execution states of section 5, and journal loss as a reconciliation input.
- **Item 8:** `workerId`, `journalId`, sequence, and a deterministic `observationId` in every observation; the reason codes for rejected assignments (backlog, disk floor); the confirmation of a terminal fact.
- **Item 13:** enrollment creates the journal before `worker/identity`, and writes the identity under section 4.
- **Item 14:** the settings of section 3, the subtree rules of section 2, the lock mechanism, the start checks, the migrations, and the crash points of section 13.
- **Items 20 and 21:** the write order of section 5 in the runtime, and the detection and reconciliation of sections 8 and 11 in the control plane.

## 13. Required tests

Items 14, 20, 24, and 25 implement these through the deterministic test harness (item 10), on Linux in the worker image and natively on macOS. Each commit W1 to W7 is a named crash point, before and after its commit.

- A crash before and after each of W1 to W7, followed by recovery, loses no acknowledged command, sends no request without its journaled `operationId`, never spawns under a grant journaled before the crash, and repeats each action idempotently.
- A command delivered twice, before and after a crash between W1 and its acknowledgement, creates one inbox entry and one launch intent.
- A rejected command is acknowledged only after its rejection observation is committed.
- An injected `fsync` or `COMMIT` failure stops acknowledgements, requests, and publications; reopening continues from the persisted state.
- A full disk during W1 leaves the command unacknowledged and redelivered; during W5 the fact is derived again from the execution record with the same `observationId`.
- Below the disk floor no launch authorization is requested and only `worker/logs/` is truncated; above it, normal operation resumes.
- A backlog over the limit rejects new assignments and keeps publishing.
- A truncated or bit-flipped journal, a foreign SQLite file, and a newer format each fail startup without changing the files.
- A missing journal with an identity present starts nothing until a new incarnation is started explicitly; the control plane then reconciles the worker's unfinished assignments as uncertain.
- A journal restored from an older copy is detected as rolled back by its sequence.
- A second worker on the same root fails to take the root lock; after the first is killed, the lock is free.
- A symbolic link in the subtree, a foreign owner, or a group-writable directory fails startup.
- The previous journal format is migrated, and a crash during migration leaves either format complete.
- Power loss is simulated where the harness supports it (for example by a filesystem that discards unsynced writes); native acceptance records which storage and settings were exercised on each matrix entry.
- A removed workspace never removes the journal, an identity, or an execution record.
