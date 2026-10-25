## Context

The worker journal contract (item 5) fixes what the worker persists and in which order; decision D4 (a) chose `node:sqlite` with `better-sqlite3` as the fallback. Item 7 defined the execution values, and item 9's boundary rule treats `packages/adapters/worker-*` as worker-only. Item 10 provides `CrashPoints` and `ScenarioProcess`.

## Goals / Non-Goals

**Goals:**
- One adapter method, and one transaction, per W commit, with the protocol order enforced and repeated facts accepted once.
- The start checks, subtree rules, and root lock of contract sections 2, 8, and 9, and the settings of section 3, each verified after opening.
- Crash tests before and after each W commit, asserted against the recovery table.

**Non-Goals:**
- The worker runtime's publication loop, admission limits (disk floor, backlog), and the execution record and seal (items 6, 15, 20).
- Credential content in `worker/identity` (item 13) and Linux native acceptance (items 24 and 25).

## Decisions

- **Port in `execution`.** The records reuse item 7's values, so the port, the records, and the recovery planning live in the module that owns those values; the recovery table is a pure function the runtime calls, and the adapter only persists.
- **Synchronous port.** node:sqlite and better-sqlite3 are both synchronous, so the port returns `Result` values directly.
- **Root lock.** SQLite's exclusive lock on `worker/lock`, a POSIX record lock that the kernel releases when the process dies. Its hazard, release when another descriptor of the file is closed, is tested and documented for item 15.
- **Checkout refusal.** Any Git working tree above the data root is refused, because the worker cannot know every managed checkout.
- **Volume check.** On macOS local APFS only, read from `mount`; on Linux refused `statfs` magic numbers.
- **Observation identity.** SHA-256 of the observation's source, so a re-derived fact gets the same `observationId`.
- **Crash points as a hook.** The adapter calls an optional `onCommitPoint` before and after each commit; tests pass `CrashPoints.reach`, so product code does not depend on the test harness.
- **Republication bound.** 60 seconds, held in memory.
- **Re-authorization.** A new operation for an existing execution follows item 3: after a retryable rejection, or after a grant only while the request reports, from the launch record, that the execution has not started.
- **Device faults.** I/O errors, and a file that cannot be opened, is read-only, or breaks the locking protocol, stop the journal like a flush failure, because the device state is unknown.
- **Test volume.** Filesystem tests pass a probe that accepts their temporary volume, so the suite runs on tmpfs and overlayfs too; only the volume tests use the real probe.

## Risks / Trade-offs

- POSIX lock released by a stray descriptor close → only the lock class opens the file, path checks use `lstat`, and the hazard is documented.
- Bit flips outside page structure go undetected → recorded as a limit; SQLite keeps no page checksums.
- macOS durability depends on `F_FULLFSYNC` not failing after start → the gate stays open, as the owner decided.
- Fsync on every commit makes each test take a few hundred milliseconds → the suite stays within the verify budget.
