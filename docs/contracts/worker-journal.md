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
| `worker/identity` | `installationId`, `workerId`, the credential generation and references, and the `journalId` it is bound to (item 13 defines the credential content) | Enrollment | Until re-enrollment |
| `worker/credentials/` | One file per credential and generation, `control-plane.<generation>` and `broker.<generation>.creds`, that the identity references ([installation and enrollment](installation-and-enrollment.md) section 10) | Enrollment | Until re-enrollment |
| `worker/journal/journal.sqlite` and its `-wal` file | The journal | Worker | For the journal incarnation's lifetime (section 8) |
| `worker/journal-fault` | Written when a flush failure or corruption stops the journal: the host boot identity (`/proc/sys/kernel/random/boot_id` on Linux, which a container shares with its host; `kern.bootsessionuuid` on macOS), the failure's reason and message, and a format version | Worker | Until a start in a later host boot, or a new journal incarnation, removes it (section 7) |
| `worker/executions/<executionId>/` | The execution record (item 4) | Worker and supervisor | Until the execution's terminal fact is confirmed (section 6) |
| `worker/logs/` | Buffered stream logs, which are nonessential | Worker | Truncatable at any time |
| `worker/workspaces/` | Managed workspaces | Worker | Workspace rules; never touch the paths above |

The **control records** are every path in the table except `worker/workspaces/` and its content. Rules for the subtree:

- **Explicit creation.** Enrollment creates `worker/`; starting an unenrolled worker fails and creates nothing. Enrollment creates the journal first, then the credential files, and `worker/identity` last, so an identity without a journal always means loss (section 8), and an identity never names a credential that was not written.
- **Ownership and permissions.** `worker/` and every control record are owned by the worker's account; `worker/` and the control-record directories have mode `0700`, and control-record files mode `0600`. A control record, or a directory on the path to one, owned by another account or writable by group or others, fails startup.
- **No redirection.** No path component from `dataRoot` down to a control record is a symbolic link; the worker refuses one instead of following it. The checkout or a subtree of it is refused as `dataRoot` (storage contract).
- **Workspaces.** Content under `worker/workspaces/` is project content with its own modes and symbolic links; the workspace rules of item 14 and G3 ([Git workspace contract](git-workspace.md)) govern it, and nothing in it is read as a control record. `worker/` being `0700` closes it to other accounts.
- **Local, persistent filesystem.** The journal lives on a local filesystem that supports POSIX advisory locks and `fsync`. On Linux, `dataRoot` is a persistent volume mounted into the worker container (decision D5 (a)), never the container's writable layer; a network filesystem is refused.
- **One owner.** Separate workers on one host have distinct roots; a colocated control plane uses only `control-plane/`.
- **Separate retention.** Workspace removal and log truncation never delete the journal, the identity, or an execution record. Durable records never live in a cache, temporary, or log directory.

## 3. Store and durability settings

By decision D4 (a), the journal is SQLite through `node:sqlite` on the pinned Node 24.22.1, with `better-sqlite3` as the fallback. Both bundle SQLite 3.53.4 and open the same file format, so switching the binding changes no stored data ([G2 infrastructure](../g2-infrastructure.md) section 4, item 1). The worker opens the journal with these settings, and item 14 verifies each one after opening:

| Setting | Required value | Reason |
| --- | --- | --- |
| `journal_mode` | `WAL` | Atomic commits with a single synced append per transaction |
| `synchronous` | `FULL` | A commit returns only after the WAL is synced; `NORMAL` may lose the last commits on power loss |
| `fullfsync` and `checkpoint_fullfsync` | `ON` | On macOS, `fsync` does not flush the drive cache; these make SQLite use `F_FULLFSYNC`. No effect on Linux |
| `locking_mode` | `EXCLUSIVE`, set **before** `journal_mode` and before any other access | Only the worker's connection can open the journal; set before the first WAL access, WAL uses no shared-memory file, and the worker checks that no `-shm` file exists |
| `foreign_keys` | `ON` | Records reference their parents |
| `application_id` | The Taskelith journal constant (item 14 fixes the value) | Rejects a foreign SQLite file |
| `user_version` | The journal format version (section 10) | Format versioning |
| `wal_autocheckpoint` and `journal_size_limit` | Values chosen by item 14 | Trigger checkpoints and truncate the WAL after them |

Every protocol write is one explicit transaction (`BEGIN IMMEDIATE` to `COMMIT`) that records one command, one launch step, or one fact, so each transaction is small. The two settings above trigger checkpoints and limit the WAL left after them; they are not a hard cap, because the WAL grows past them until a checkpoint completes. The WAL's disk use therefore counts toward the disk floor of section 7, and a checkpoint that fails with an I/O error is a flush failure (section 7). After it first creates the database and WAL files, the worker syncs the `worker/journal/` directory, so that their directory entries survive a power loss.

**macOS flush fallback.** When `F_FULLFSYNC` fails, SQLite 3.53.4 falls back to a plain `fsync` and returns that result ([`os_unix.c`](https://github.com/sqlite/sqlite/blob/version-3.53.4/src/os_unix.c#L3778-L3830)), and Node's `fs.fsync` on macOS goes through libuv 1.52.1, the version Node 24.22.1 bundles, which falls back to `F_BARRIERFSYNC` and then `fsync` ([`fs.c`](https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fs.c#L170-L191)). Such a failure therefore cannot be detected per write, and switching the binding does not help, because both bundle the same SQLite. The worker instead accepts on macOS only a local filesystem on which `F_FULLFSYNC` is supported (APFS), checked at startup; the check is an item 14 qualification gate, and item 14 shows that a filesystem without `F_FULLFSYNC` support is refused.

**Open macOS gate.** The startup check does not cover a later `F_FULLFSYNC` failure, which the fallback hides, so on macOS the guarantee below holds only while `F_FULLFSYNC` does not fail after the startup check. This is an open gate for items 14 and 25: macOS journal durability is not claimed before native acceptance. If item 14 finds a mechanism that surfaces every `F_FULLFSYNC` failure, it closes the gate; the owner decided this on 2026-10-25.

**Guarantee.** A transaction whose `COMMIT` returned success survives a process crash, an operating-system crash, and a power loss, on storage that honors flush requests and, on macOS, on a filesystem that passed the startup check and only while `F_FULLFSYNC` does not fail after it (the open gate above). A transaction whose `COMMIT` failed or did not return may or may not survive; section 7 says how the worker acts on that. Storage that acknowledges flushes it has not performed is outside the guarantee; native acceptance (item 25) records the storage of each matrix entry.

## 4. Durable file rule

Files outside the journal (the identity and the execution record of item 4) are written so that each is either absent or complete:

- **Create once:** write the content to a temporary file in the same directory, `fsync` it, `link` it to the final name, which fails if that name exists, remove the temporary name, and `fsync` the directory. This gives the exclusive creation that item 4's `launch` and `supervisor.<n>` files need, with their content, in one step. When `link` fails because the name exists, the writer reads the existing file and decides from it (item 4 section 5).
- **Using a file another process created:** the winner of a create-once may not yet have synced the directory, so a file visible to another process is not yet proof. Before acting on a create-once file it did not make durable itself in this process, including one found at start, a reader `fsync`s the file and its directory; a failure is a flush failure (section 7), and the reader takes no action on the file.
- **Replace:** the same, with `rename` instead of `link`. Only these files are replaced: `worker/identity` on re-enrollment and when an operator starts a new journal incarnation (section 8), and an execution's `intent` while no `launch` file exists (item 4).
- **Append-only:** each record is framed with its length and a checksum and is followed by an `fsync`. A torn record at the end is discarded on reading; a bad record anywhere else makes the file corrupt.
- **New directory:** after creating a directory, `fsync` its parent.

On macOS, `fsync` here means `F_FULLFSYNC`, for the reason section 3 gives. Every file carries a format version. A leftover temporary file is removed on start and never read.

## 5. Records and their write order

The journal holds these logical records; item 14 defines the schema:

- **Inbox:** one entry per `commandId`, with the command's kind, digest, and outcome (accepted, rejected with a reason, or duplicate). `commandId` entries are kept for the journal's lifetime, as the lifetime deduplication of the [operational targets](../operational-targets.md); a command's payload may be pruned once its assignment is terminal.
- **Launch intent:** the accepted assignment the worker means to launch: `assignmentId`, `attemptId`, `ownershipGeneration`, and the admission it names.
- **Cancellation request:** an accepted cancellation command's target execution or attempt, until the cancellation's evidence is recorded (item 4 section 8).
- **Execution:** `executionId` (item 4), its launch intent, its state as item 3 defines it (none before a grant, then `authorized`, `started`, `exited`, or `not-started`), whether its execution record is journaled as written, the outbox sequence of its terminal fact, and whether its execution record was removed. `uncertain` is never a state here: it is evidence kept beside the state, which it leaves unchanged (item 4 section 7).
- **Authorization request:** `operationId`, its `executionId`, the expected values sent, and the outcome: the grant (`launchAuthId`, `issuedAt`, `ttl`, `skew`, the bound values), the rejection reason (item 3), or `expired` when no grant of the operation can be used any more.
- **Execution evidence:** whether an execution's termination was left unproven, and which cancellations of it the supervisor did not apply; each is reported once.
- **Outbox:** observations to publish (section 6).
- **Journal metadata:** `journalId`, `installationId`, `workerId`, the recovery epoch the worker holds, and the next outbox sequence.

Each commit below precedes the action in its row:

| # | Commit | Before | Protects |
| --- | --- | --- | --- |
| W1 | The inbox entry and its outcome, in one transaction with what the command asks: for an accepted assignment its launch intent, for an accepted cancellation its cancellation request, and for a rejected command its rejection observation | Acknowledging the command to the broker | An acknowledged command, including a cancellation, is never lost (architecture section 9, step 4) |
| W2 | A new `executionId`, or the current one for a re-authorization item 3 allows, and a new `operationId` with its expected values | Sending the first launch authorization request for that operation | Item 3 sections 6 and 7; item 4 crash point CP1 |
| W3 | The grant, and the execution as `authorized`; or a retryable rejection; or a non-retryable rejection and its observation (item 3 section 9); or the operation as `expired`, when its deadline passed without a decision or the control plane answered that it expired | Writing or replacing `intent` (item 4, CP2) after a grant; any retry after a rejection | A grant is never used without a journaled trace, and a non-retryable rejection is never retried |
| W4 | The execution record as written | Starting the supervisor (item 4, CP3 and CP4) | From here on, a missing or damaged record is data loss, never proof that nothing spawned |
| W5 | A fact read from the execution record, its state change, and its observation: `started` from `handle` (W5s) or `exited` from `exit` (W5e) | Removing anything from the execution record | Facts reach the outbox before their source can go |
| W6 | The execution as `not-started`, its operations without an outcome as `expired`, and its observation | — ; it follows reading a seal made durable under section 4 | `not-started` is reported only after the irreversible seal (item 3 section 4, item 4 section 5) |

The worker writes its wall-clock time into records for diagnosis only. No safety decision reads it; the spawn deadline uses the clock item 3 and item 4 name, read in memory.

A duplicate command (its `commandId` already in the inbox) is acknowledged again and changes nothing else; its W1 transaction already holds everything the command asked for. A command that fails validation is still journaled with its rejection before it is acknowledged, so that the rejection reaches the control plane through the outbox.

**Recovery on start.** The worker never repeats an action blindly; it decides from the last commit it finds for each record:

| Last commit found | Recovery |
| --- | --- |
| W1, command not acknowledged | Nothing to repeat for the acknowledgement: the broker redelivers the command, and the worker acknowledges it as a duplicate; the rows below still apply to what W1 recorded |
| An accepted launch intent, not cancelled, without an execution or whose executions are all `not-started`, and no non-retryable rejection | Continue the launch: commit W2 for a new execution and request a current launch authorization (item 3). The request reports the intent's last `not-started` execution, with its last granted operation or else its last operation, so the authority records that `not-started` first even when the observation has not reached it (item 3 section 4, reported seal). This holds whether or not the command was acknowledged, because the broker will not redeliver an acknowledged command |
| W1 with a cancellation request whose evidence is not recorded | Forward the cancellation to the execution's supervisor again (item 4 section 8); a launch intent with an accepted cancellation and no execution launches nothing |
| W2 without an outcome, or W3 with a grant, and no W4 | Seal the execution under item 4 (its row "record not journaled"), commit W6, and continue as the launch intent row says, with a new `executionId` and `operationId` (item 3 section 7); never send the old operation again and never use its grant |
| W3 with a retryable rejection or an expired operation of an execution without a grant, and no W4 | Continue with a new `operationId` for the same execution, reporting that it has not started (item 3 sections 6 and 7), and reporting the intent's last `not-started` execution as the continue-launch row does; no seal and no W6 are needed, because nothing was written |
| W3 with a non-retryable rejection | Nothing is retried; the rejection's observation reaches the control plane, and the scheduler acts on its reason (item 3 section 9) |
| W4 or W5s, and no terminal fact | Item 4's recovery table decides from the execution record and native evidence: adopt and keep observing, forward a pending cancellation, report a recorded exit (W5e), seal, or report `uncertain`; nothing is spawned |
| W5e or W6 | Nothing to repeat; the outbox publishes the observation |
| Outbox entries not confirmed | Publish them again with the same `observationId` (section 6) |

Each execution is reconciled once per start; nothing an earlier process journaled is launched again outside these rows. An execution record directory that no execution names is reported and kept.

**Record removal.** An execution record is removed once its terminal fact (W5e or W6) is confirmed, which the journal knows when the outbox entry at the execution's terminal sequence is gone (section 6). The removal is journaled after the directory is gone, so a crash in between only repeats it. A supervisor that still holds the record's lock keeps it for a later pass.

## 6. Local outbox of observations

- **Identity.** Each observation has an `observationId` derived deterministically from its source: from `commandId` for a command outcome, from `executionId` and the fact for an execution fact, from `executionId`, the fact, and an evidence counter for a repeated `uncertain`, from `executionId`, the fact, and the cancellation's `commandId` for a cancellation that was not applied, and from `journalId` and the containment for an unrecorded process. A fact derived again after a lost write therefore gets the same identity, and the receiver deduplicates it. An unrecorded process therefore has one identity per journal incarnation: the worker journals none while an entry for the same containment is in its outbox, and a derivation after confirmation is published again under the same identity, which the receiver applies without effect.
- **Producer sequence.** Each entry gets the next number of a gapless sequence per `(workerId, journalId)`, assigned in its transaction. Observations carry `workerId`, `journalId`, and the sequence (item 8), as the per-producer sequence of architecture section 9.
- **Publication.** The worker publishes only committed entries and retries each with the same `observationId` until the broker acknowledges it. A broker acknowledgement is transport only: the stream may expire an entry before the control plane consumes it (operational targets: `7 days` or `10 GiB`).
- **Confirmation.** The control plane confirms what it has applied, cumulatively by sequence per `(workerId, journalId)` (item 8 defines the message). An entry stays in the outbox until it is confirmed, and the worker publishes an unconfirmed entry again, with the same `observationId`, after a bound item 14 sets. Only a confirmed entry may be pruned, and an execution record is removed only after its terminal fact is confirmed (item 4). Confirmation and publication marks need no durability of their own: losing one only repeats a publication that the receiver deduplicates.
- **Backlog limit.** When unconfirmed entries exceed `256 MiB` or `10,000` entries (operational targets), the worker accepts no new attempt: it rejects new assignments with a reason in W1 while existing attempts drain and reconcile.
- **Offline.** While the broker or the control plane is unreachable, entries accumulate within the backlog limit; nothing is dropped.

## 7. Write failures

**Interrupted write.** A crash during a transaction leaves the journal as before or as after it: SQLite recovers the WAL on the next open. A crash during a file write under section 4 leaves the file absent or complete. Recovery then follows section 5.

**Flush failure.** An I/O error from `COMMIT`, a checkpoint, a synced write, or an `fsync` means the state on the device is unknown. A retried `fsync` cannot prove otherwise, and reopening the journal may read pages from the operating system's cache that never reached the device. The worker then:

1. takes none of the actions that the failed write was to precede: no acknowledgement, no request, no hand-off, no publication of it;
2. closes the journal, stops acknowledging commands, requesting launch authorizations, and publishing, and leaves running supervisors alone, because they do not depend on the journal;
3. reports the fault in its local service status and logs, since the outbox cannot carry it, and stays stopped (fail closed);
4. resumes only when what it reads comes from the device: after a restart of the host (the machine, not the worker container), or after an operator starts a new journal incarnation (section 8). It then continues under section 5. The worker records the stop in `worker/journal-fault` (section 2), so a worker restarted in the same host boot also stays stopped: a start refuses while the record names the current boot, removes the record in a later boot, and a new incarnation removes it too. An unreadable record fails startup until an operator removes it. If the record cannot be written, the fault in the service status says so, and the worker is not restarted automatically.

A write refused for lack of space before its commit (SQLite reports the database or disk as full) is not a flush failure: the transaction rolls back, and the full-disk rules below apply.

**Full disk.** The worker keeps the disk floor of the operational targets (`5 GiB` or `10%` free on the `dataRoot` volume, whichever is larger), counting the journal and its WAL:

- **Below the floor:** it requests no new launch authorizations, rejects new assignments with an admission-pressure reason, reports admission pressure, and truncates only `worker/logs/`. Commands, cancellations, and observations are still journaled.
- **A write is refused for lack of space:** the transaction rolls back as a whole. The command is not acknowledged and the broker redelivers it; an execution fact stays in its execution record and is derived again (W5). The worker truncates `worker/logs/` and retries with the backoff of the operational targets.
- **Cancellation under a full disk:** the worker may forward a cancellation to the supervisor before W1 commits, because cancelling never widens effects; it acknowledges the command only after W1.

## 8. Corrupt, missing, or rolled-back journal

**Journal incarnation.** `journalId` is a random 128-bit identifier created with the journal and recorded in `worker/identity`. It names one journal's history. The control plane keeps the latest `journalId` and the highest sequence it received per worker (item 21).

**Checks on every start,** before any other use: the `application_id`, the `user_version` (section 10), `PRAGMA quick_check`, and that the journal's `installationId`, `workerId`, and `journalId` match `worker/identity`.

| Found | Result |
| --- | --- |
| No `worker/identity` | Not enrolled: the worker does not start |
| Identity present, journal absent | **Journal loss.** The worker never creates a journal on its own |
| Wrong `application_id`, failed check, a corruption error at any time, or a binding mismatch | **Corrupt journal.** The worker stops and keeps the files untouched as evidence; it never repairs them |
| Newer `user_version` than it supports | Refuse to start (storage contract) |

After a journal loss or a corrupt journal, the worker acknowledges, requests, and publishes nothing until an operator explicitly starts a new journal incarnation, which moves any old file aside as evidence, creates a journal with a new `journalId`, and records it in `worker/identity`. The execution records that survive are read under item 4, and their facts are reported again from the new incarnation (W5, W6).

**Rollback.** A worker journal, or a `dataRoot` holding one, is never restored from a backup or snapshot: a restored journal has silently lost later commits, possibly including commands it had acknowledged. Restoring one is a journal loss, handled only by a new incarnation. The worker cannot detect every rollback itself, so the control plane does not rely on it:

- **Sequence check.** A sequence at or below one already received for the same `journalId`, with a different `observationId`, proves a rollback; the same sequence with the same `observationId` is an ordinary repeated publication. The control plane then treats it as a journal loss (section 11).
- **Inventory reconciliation.** On every reconnect, the worker reports the assignments it holds and their executions' states. For an unfinished assignment of this worker that the report omits, the control plane re-sends the command with the same `commandId` if it recorded no grant for the attempt, and otherwise reconciles the attempt as having lost its local history (section 11). This holds whatever caused the omission, so it covers a rollback the sequence check misses.

## 9. Lock ownership

- **Root lock.** The worker holds an exclusive lock on `worker/lock` for its whole life, before it reads anything else under `worker/`. The kernel releases it when the process dies; a process ID file alone is never a lock. Failing to take it means another live worker owns the root, and the worker does not start.
- **Journal lock.** The journal's `EXCLUSIVE` locking mode (section 3) keeps any second connection out, even one that ignored the root lock.
- **Supervisors** never open the journal. They hold their own execution's `lock` (item 4).
- **Mechanism.** Node offers no `flock` API; the TypeScript mechanism that takes a kernel-released lock on each matrix entry is an item 14 qualification, shared with item 4's execution `lock`. Holding an SQLite exclusive lock on the lock file is a candidate.
- **Inspection.** Another process reads the journal only while the worker is stopped, or from a copy.

## 10. Format versioning

- `user_version` names the journal's format; `application_id` names it as a Taskelith journal. Every other control record carries its own format version (section 4).
- A worker reads the current journal format and every earlier format it lists. It migrates an earlier one forward step by step in a single transaction on start, so a crash leaves either format complete. It never downgrades a journal.
- Format 1 is the bootstrap format; format 2 added the declared capacity, the inventory counters, the intent's recovery epoch and resources, and assignment ends; format 3 adds the `expired` outcome, the terminal sequence, record removal, and the execution evidence of section 5. Its migration expires the operations without an outcome of executions already `not-started`, and takes the terminal sequence from the outbox, or 0 when the entry was pruned.
- A newer or unknown format fails startup; the worker never guesses around it.
- A worker package that changes the format states the change in its release notes, and a rollback to a version that cannot read the format requires a new journal incarnation (section 8).

## 11. Disk loss after acknowledgement

When the disk holding `dataRoot` is lost after the worker acknowledged commands, the broker will not redeliver them, and the worker's knowledge is gone. The architecture requires: the central unfinished assignment remains, and prior side effects are not assumed absent (section 9, failure behavior).

- **Whole root lost.** The identity and credentials are gone, so the worker cannot authenticate. It is enrolled again as a new worker; the old `workerId` is revoked, and its active attempts become uncertain, not dead ([trust model](../trust-model.md) section 4).
- **Journal lost, identity kept, or a rollback found.** Section 8: the new incarnation, the sequence check, or the inventory reconciliation tells the control plane which assignments lost their local history.
- **At the control plane (item 21).** Each such assignment keeps its ownership and its capacity reservation (item 6). An attempt with no recorded grant can safely receive its command again; any other is reconciled as uncertain execution: no automatic retry (the retry budget for uncertain execution is `0`), no other execution authorized until reconciliation records a terminal fact (item 3 section 4), and the outcome decided by evidence or by an operator. Reconciliation does not depend on broker acknowledgement history (architecture section 9, step 7).
- **On the worker.** Surviving processes are handled under item 4 section 9: on Linux, populated containments without an execution record are reported as unrecorded processes, never as current work; on macOS they cannot be found. No command is replayed from memory or from the broker's history; restored or lost state never enables automatic replay before reconciliation (invariant 14).

## 12. Obligations on other items

- **Item 3:** `operationId` and `executionId` are journaled before the first request (W2); the grant is journaled before it is used, and a restart abandons it (W3 and the recovery of section 5); `not-started` is reported only after the seal (W6). A journal loss or rollback is a reconciliation input for its ownership rule.
- **Item 4:** the record's existence is journaled before the supervisor starts (W4, its CP3); its execution record uses the durable file rule of section 4, including create-once by `link` for `launch` and `supervisor.<n>` and replacement of `intent` only while no `launch` exists; its `lock` shares the lock mechanism qualification of section 9.
- **Item 6:** the backlog limit and the disk floor of section 7 are worker-side admission limits; an execution whose local history was lost keeps its reservation.
- **Item 7:** the execution states of section 5, uncertainty as evidence beside the state, and lost local history as a reconciliation input.
- **Item 8:** `workerId`, `journalId`, sequence, and a deterministic `observationId` in every observation; the cumulative confirmation of section 6; the inventory report of section 8; the reason codes for rejected assignments (backlog, disk floor).
- **Item 13:** enrollment creates the journal before `worker/identity`, and writes the identity under section 4.
- **Item 14:** the settings of section 3 and their initialization order, the macOS `F_FULLFSYNC` startup check and the open macOS gate of section 3, the subtree rules of section 2, the lock mechanism, the start checks, the migrations, the republication bound of section 6, and the crash points of section 13.
- **Items 20 and 21:** the write order and recovery of section 5 in the runtime, and the confirmation, sequence check, inventory reconciliation, and loss handling of sections 6, 8, and 11 in the control plane.

## 13. Required tests

Items 14, 20, 21, 24, and 25 implement these through the deterministic test harness (item 10), on Linux in the worker image and natively on macOS. Each commit W1 to W6 is a named crash point, before and after its commit.

- A crash before and after each of W1 to W6 (W5s and W5e separately), followed by recovery, loses no acknowledged command, sends no request without its journaled `operationId`, never uses a grant journaled before the crash, never starts a supervisor without W4, and gives the result section 5 assigns.
- A command delivered twice, before and after a crash between W1 and its acknowledgement, creates one inbox entry and one launch intent; a cancellation delivered the same way is forwarded and not lost.
- A crash after W1 and the acknowledgement, before W2, continues the launch on restart with a current authorization; the broker does not redeliver.
- A crash after W5s while the child runs adopts it and later reports its exit.
- A non-retryable rejection journaled before a crash is not retried after it; a retryable one is retried with a new `operationId`.
- A crash of a create-once winner between its `link` and its directory sync: a reader that saw the file syncs it before acting, and if the file is gone after power loss, no one acted on it.
- On macOS, a filesystem without `F_FULLFSYNC` support is refused at startup.
- A rejected command is acknowledged only after its rejection observation is committed.
- A record journaled by W4 and then deleted gives `uncertain`, never `not-started`.
- An injected `fsync`, checkpoint, or `COMMIT` I/O error stops acknowledgements, requests, and publications, and the worker stays stopped until a host restart or a new incarnation.
- A full disk during W1 leaves the command unacknowledged and redelivered; during W5 the fact is derived again from the execution record with the same `observationId`.
- Below the disk floor no launch authorization is requested and only `worker/logs/` is truncated; above it, normal operation resumes.
- A backlog over the limit rejects new assignments and keeps publishing.
- An observation expired from the stream before consumption is published again and confirmed; an unconfirmed entry is never pruned.
- A truncated or bit-flipped journal, a foreign SQLite file, and a newer format each fail startup without changing the files.
- A missing journal with an identity present starts nothing until a new incarnation is started explicitly; the control plane then reconciles the worker's unfinished assignments.
- A journal restored from an older copy that lost only an acknowledged inbox entry is found by the inventory reconciliation, and the command is re-sent when no grant exists; a rollback that repeats a sequence is found by the sequence check.
- The journal is opened with `EXCLUSIVE` locking before WAL mode, and no `-shm` file exists.
- A second worker on the same root fails to take the root lock; after the first is killed, the lock is free.
- A symbolic link or a foreign owner on a control-record path, or a group-writable control-record directory, fails startup; a symbolic link inside a workspace does not.
- Every earlier journal format is migrated, and a crash during migration leaves either format complete.
- Power loss is simulated where the harness supports it (for example by a filesystem that discards unsynced writes); native acceptance records which storage and settings were exercised on each matrix entry.
- A removed workspace never removes the journal, an identity, or an execution record.
