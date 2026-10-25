# Worker journal qualification

Date: 2026-10-25. Status: qualification record for G2 item 14 (`implement-worker-journal`), the adapter `@taskelith/worker-journal` under the [worker journal contract](contracts/worker-journal.md) (item 5). It records what the implementation measured, which contract obligations of section 12 it meets, and which gates stay open. Measured on macOS (Darwin 25.6.0, x86_64, APFS) with Node 24.22.1 and its bundled SQLite 3.53.4; Linux in the worker image is not measured here (items 24 and 25).

## Placement

- **Port and domain.** The records of contract section 5, the `WorkerJournal` port, and the recovery table of section 5 as the pure function `planJournalRecovery` live in the `execution` module (`packages/modules/execution`), which owns the item 7 values they reuse: identifiers, execution states, exit status, launch grant, request, and rejection, and the observation position.
- **Adapter.** `packages/adapters/worker-journal` implements the port on SQLite and the subtree rules of section 2. Its name matches the item 9 rule for worker-only packages, so API and browser code cannot import it.

## Store: `node:sqlite` (D4 a)

`node:sqlite` on Node 24.22.1 is fit for the journal; the `better-sqlite3` fallback was not needed. Measured:

- The settings of section 3 apply in their required order, and each is read back after opening; on an existing file, exclusive locking is set first and the header (`application_id` and `user_version`) is checked before WAL mode, so a foreign SQLite database is refused unchanged: `locking_mode` `exclusive` before `journal_mode` `wal`, `synchronous` 2 (`FULL`), `fullfsync` 1, `checkpoint_fullfsync` 1, `foreign_keys` 1, `wal_autocheckpoint` 1000 pages, and `journal_size_limit` 64 MiB (the values item 14 chooses). `application_id` is `0x544b4a4c` ("TKJL") and `user_version` is format 1.
- With exclusive locking set first, WAL creates no `-shm` file; the adapter refuses to open a journal if one exists.
- A second connection to an open journal fails with `SQLITE_BUSY`; the suite asserts it in the same process, and the scratch qualification also saw it from another process.
- node:sqlite reports SQLite result codes in the error's `errcode` (`5` busy, `14` cannot open, `26` not a database), so the adapter tells I/O errors, corruption, and a full disk apart.

## Root lock

Node has no `flock`. The qualified mechanism takes SQLite's exclusive lock on `worker/lock` (`PRAGMA locking_mode = EXCLUSIVE`, then `BEGIN EXCLUSIVE` and `COMMIT`, keeping the connection open). The lock file is marked with `application_id` `0x544b4c4b` ("TKLK") and format 1.

- A second process fails to take it (`SQLITE_BUSY`), and after the holder is killed with `SIGKILL` the kernel releases it.
- It is a POSIX record lock (`fcntl`), not a `flock`: **closing any other descriptor of the lock file in the holding process releases it**, which a test demonstrates. Nothing but the lock may open the file; the adapter's path checks use `lstat`, which opens nothing.
- By POSIX semantics, not tested here, a record lock is not inherited by a forked child, so the window of item 4 section 6, where a forked child keeps a `flock` until it executes its program, does not arise. Item 15 shares the mechanism for the execution `lock` and must keep both properties in mind.

## Subtree, data root, and volume

- `dataRoot` resolution follows the storage contract's precedence, refuses empty, relative, and tilde paths, and never falls back from an invalid configured value.
- A data root inside a Git working tree is refused, which covers the checkout and every managed checkout. A data root inside a home directory that is itself a Git repository is refused too; such a host sets an explicit root outside it.
- Every component from `dataRoot` down to each control record is refused if it is a symbolic link, owned by another account, or writable by group or others; a symbolic link inside `worker/workspaces/` is accepted. The tests exercise symbolic links and group write; a foreign owner needs a second account and is **not tested**. Enrollment creates directories with mode `0700` and files with mode `0600`.
- **macOS startup check.** The volume holding the root must be local APFS, read from `mount` for the mount point that `df -P` reports. A FAT image mounted with `hdiutil` is refused. Other volume types, and Apple silicon (arm64) hosts, are not exercised.
- **Linux.** Remote, volatile, and container-layer filesystems are refused by their `statfs` magic numbers (NFS, SMB, CIFS, Coda, AFS, 9P, FUSE, Ceph, overlayfs, tmpfs, ramfs); tested with injected values only. The filesystem tests therefore pass a probe that accepts their temporary volume, which may be tmpfs or overlayfs; only the volume tests use the real probe.

## Open macOS gate (unchanged)

No mechanism was found that surfaces every `F_FULLFSYNC` failure: SQLite 3.53.4 and libuv fall back silently (contract section 3), and neither node:sqlite nor `node:fs` exposes the flush call. The gate of section 3 **stays open** for items 14 and 25, and macOS journal durability is not claimed.

## Records, outbox, and recovery

- Each W commit of section 5 is one `BEGIN IMMEDIATE` transaction in one adapter method: W1 `recordCommand`, W2 `beginAuthorization`, W3 `recordGrant` or `recordLaunchRejection`, W4 `recordExecutionRecordWritten`, W5s `recordStart`, W5e `recordExit`, and W6 `recordNotStarted`. Out-of-order calls fail, including a grant or rejection for an execution already `not-started` or `exited`; a fact derived again after a lost write is accepted once and keeps its observation.
- A new operation for an existing execution is allowed after a retryable rejection (item 3 section 6), or after a grant only while the request reports, from the supervisor's launch record, that it has not started (item 3 re-authorization); otherwise the worker uses a new execution.
- `observationId` is `obs-` and the SHA-256 of the observation's source: the `commandId` for a command outcome, the `operationId` for a final launch rejection, the `executionId` and fact for an execution fact, and the evidence counter for a repeated `uncertain`.
- The outbox numbers entries gaplessly per journal in the same transaction, prunes only through a cumulative confirmation, and publishes an unconfirmed entry again after 60 seconds (`REPUBLICATION_BOUND_MS`, the bound section 6 leaves to item 14), with publication marks in memory only.
- An I/O error from `COMMIT` (also `SQLITE_CANTOPEN`, `SQLITE_READONLY`, and `SQLITE_PROTOCOL`, which mean the file or device is unusable), or corruption, stops the journal: it closes the database, refuses every later call, and records `worker/journal-fault` with the host boot identity (`/proc/sys/kernel/random/boot_id` on Linux, `kern.bootsessionuuid` on macOS). A worker restarted in the same boot refuses to start; a later boot or a new incarnation clears the record. If the record cannot be written, the journal's fault carries that failure for the worker's service status. The stop is tested with an injected error code, and the boot rule with a recorded fault. A full disk rolls the transaction back and leaves the journal usable.

## Crash tests (item 10 harness)

A child process runs one launch through W1 to W5e, and one through W6, and is killed with `SIGKILL` by `CrashPoints` before and after each commit, fourteen points in all. After each kill the journal opens, the outbox is gapless, and `planJournalRecovery` gives the action of the section 5 recovery table; a command redelivered after a crash between W1 and its acknowledgement is a duplicate. These are process crashes: power loss is not simulated.

## Limits and remaining work

- **Bit flips.** `PRAGMA quick_check` detects damage to page structure, but SQLite keeps no page checksums, so a bit flip in a page's unused space or inside a stored value is not detected at start.
- **Migrations.** Format 1 is the first format, so there is no previous format to migrate; the start check refuses a newer or unknown one.
- **Failed enrollment.** Enrollment removes the `worker/` subtree it created when a later step fails or throws, so a retry is not blocked; this path is not exercised by a test.
- **Start without an identity.** When `worker/` exists without `worker/identity` (an interrupted enrollment), start takes the root lock, which creates `worker/lock` if enrollment did not, and removes leftover temporary files before it reports `not-enrolled`, because the lock precedes every read under `worker/` (section 9).
- **Shared-memory file.** A `-shm` file, left when another process opened the journal without exclusive locking, fails startup with `foreign-access`; a new incarnation moves it aside with the journal.
- **Not implemented here.** The disk floor and the backlog limit of sections 6 and 7 (worker-side admission, items 6 and 20); the publication loop and confirmation message (items 8 and 20); item 4's execution record and seal (item 15); credential content in `worker/identity` (item 13); workspace management, including the rule that removing a workspace never removes a control record (item 20 and G3); and a port operation to change the recovery epoch held in the journal, which a new incarnation sets today (item 21 and the restore procedure of G6). A cancellation redelivered after a crash is covered by the duplicate rule and a unit test, not by a crash test. Injected `fsync` and checkpoint I/O errors (only a `COMMIT` error is injected), and a create-once winner crashing between `link` and the directory sync (section 13), are not tested here; item 15 writes the create-once files of the execution record.
- **Not measured.** Linux in the worker image, Apple silicon hosts, power loss, a host restart after a flush failure, an `F_FULLFSYNC` or checkpoint I/O error on a real device, a foreign owner on a control record, and the fork behavior of the lock.
