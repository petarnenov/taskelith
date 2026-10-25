# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

The owner's G2 plan, item 14 (`implement-worker-journal`), assigned on 2026-10-25 by the session coordinating G2 (Niki): the worker journal adapter under the item 5 contract, with `node:sqlite` (D4 a) and `better-sqlite3` 13.0.3 as the approved fallback, the item 7 values reused, the macOS `F_FULLFSYNC` gap kept open unless a mechanism is found, a qualified lock mechanism shared with item 15, an adapter under `packages/adapters/worker-*` with its port in the owning module, and crash tests once item 10 merged. Base revision: `f4bb27a` on `dev`, merged with `origin/dev` at `78362da` after item 10 merged. Scope: the journal records, port, and recovery planning in `packages/modules/execution`, the new `packages/adapters/worker-journal`, `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `sbom.cdx.json`, the new `docs/worker-journal-qualification.md`, and this change with the new `worker-journal-adapter` capability.

## Environment

macOS (Darwin 25.6.0, x86_64, APFS), Node v24.22.1 through `nvm use` with SQLite 3.53.4, npm 12.2.1.

## Evidence

- Before the adapter was written, the author qualified `node:sqlite` in a scratch directory: the section 3 settings in order and read back, no `-shm` file in exclusive WAL mode, `SQLITE_BUSY` for a second connection, and the error codes; and the lock: a second process blocked, release after `SIGKILL`, and release when the holder closes another descriptor of the file. A FAT image mounted with `hdiutil` showed the `mount` entry the volume check reads.
- The tests in `packages/adapters/worker-journal/test` and `packages/modules/execution/test/journal-recovery.test.ts` assert the behaviors the qualification record states as measured, including fourteen crash points from W1 to W6; the record marks what only the scratch qualification saw (a second journal connection from another process) and what is not tested (a foreign owner, the lock across a fork).

## Author self-check before review

- Evidence check: the new and changed documents cite no external links; their claims are measurements of this change or references to repository documents.

- No new npm dependency; `@taskelith/testing` is a workspace development dependency of the adapter, and `better-sqlite3` is not installed.
- No product code in the published package; the adapter is worker-only under the item 9 boundary rule, which `make verify` checks.
- The macOS gate is stated as open; no durability on macOS is claimed.
- Comments are within the comment length rule; spec requirements are under 500 characters (405, 315, 202, 312, 254, and 233); the new capability starts with `## Purpose`.
- Commit types are `chore:`, `test:`, `build:`, and `docs:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `npm run openspec -- validate implement-worker-journal --strict` passed; `make dependency-inventory` regenerated the inventory for the new workspace links; `make verify` passed (486 tests passed, 0 failed; coverage 99.25% lines, 94.22% branches, 99.20% functions; strict OpenSpec validation 43 passed; archive dry run, dependency inventory check, and package verification passed). After the pass-1 fixes, `make dependency-inventory` ran again for the moved `@taskelith/sdlc` dependency, and `make verify` passed with 491 tests and coverage of 99.17% lines, 93.97% branches, and 99.20% functions. After the pass-2 fixes, `make verify` passed with 496 tests and coverage of 99.16% lines, 94.06% branches, and 99.20% functions.

## Independent review

Assigned reviewer: Claude Code, `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

- **Pass 1 — session `2f9a328b-e152-422d-a1f4-5e4003a4c337`**, at `68a9209`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `2d06a55fff1727502a8699cbd6cb1e444f4bea1478cde5a9ea36180503e72a71`, unchanged. Findings: 0 Critical, 1 High, 6 Medium, 7 Low. All accepted and fixed:
  1. High: a late grant or rejection could move a `not-started` execution back to `authorized` or report a sealed execution. A pending operation of a terminal execution is now refused; tested.
  2. Medium: `journal_mode = WAL` ran before the header check and could change a foreign SQLite database. The header is now checked first; a test shows a foreign database is refused unchanged.
  3. Medium: writing `worker/journal-fault` could throw outside the transaction, and its failure was ignored. File writes in the durable file rule now return failures, and a failed fault record is added to the journal's fault; tested.
  4. Medium: re-authorization was refused after W4 and allowed before it, the reverse of item 3. A granted execution is now authorized again only when the request reports it has not started; tested and recorded in the design.
  5. Medium: the qualification record and a test title claimed a foreign-owner refusal and a cross-process journal lock that the suite does not assert. The title and the record now say what is tested, and a test asserts the journal's `SQLITE_BUSY` in the same process.
  6. Medium: the filesystem tests used the real volume probe, which refuses tmpfs and overlayfs. They now pass a probe that accepts the test volume; only the volume tests use the real one.
  7. Medium: the macOS mount point was found by device number, which firmlinks could defeat. It now comes from `df -P`; Apple silicon is listed as not measured.
  8. Low: `SQLITE_CANTOPEN`, `SQLITE_READONLY`, and `SQLITE_PROTOCOL` now stop the journal like an I/O error.
  9. Low: the evidence directory of a new incarnation is named from the injected clock.
  10. Low: enrollment no longer runs the volume check twice; the checkout check still ran twice, which pass 2 found.
  11. Low: `@taskelith/sdlc` moved to the adapter's development dependencies.
  12. Low: a failed enrollment removes the subtree it created; recorded as untested.
  13. Low: the section 13 items not covered here (workspace removal, recovery epoch changes, a cancellation crash test) are listed with their owners; a duplicate cancellation is unit-tested.
  14. Low: a test no longer passes an unneeded `--experimental-strip-types` flag.
- **Pass 2 — session `01c0e4b7-1361-4d09-9eb7-83ef8e8ba74f`**, at `1cdc786`. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `88d9d96cb0dbb2965be87bef7764ce43b67ae982d2124ab9555df839f25cdeb3`, unchanged. The reviewer confirmed pass-1 findings 1 to 9 and 11 to 14 as resolved and finding 10 as partly resolved. Findings: 0 Critical, 0 High, 3 Medium, 11 Low. All accepted and fixed:
  1. Medium: a late grant could move a `started` execution back to `authorized`. A pending operation now resolves only while its execution has no state or is `authorized`; tested.
  2. Medium: after a grant, a retryable rejection of a re-authorization left the launch intent without a way forward, and the planner asked for a retry the adapter refused. The adapter now allows the retry when the launch record reports not started, and the planner seals a granted execution without W4 and relaunches; both tested.
  3. Medium: an exception inside the root lock skipped its release and the cleanup of a failed enrollment. Both now run in `finally`.
  4. Low: the checkout check still ran twice during enrollment; it now runs once.
  5. Low: a recorded fault was always reported as `flush-failure`; its recorded reason now decides.
  6. Low: a stale `-shm` file failed startup without a reason and survived a new incarnation. It now fails with `foreign-access` before any access, and a new incarnation moves it aside; tested.
  7. Low: two incarnations at the same clock time collided; the evidence directory name now has a random suffix.
  8. Low: a journal closed by a device fault while its binding was read was closed again; the close is now guarded.
  9. Low: the crash scenario printed its acknowledgement asynchronously; it now writes synchronously.
  10. Low: `recordUncertain` accepted an execution without W4; it now requires W4, and the tests changed accordingly.
  11. Low: injected `fsync` and checkpoint errors and the create-once crash of section 13 are now listed as not tested.
  12. Low: this record lacked the evidence check; it is added.
  13. Low: a start with `worker/` but no identity creates the lock file first; this is now documented.
  14. Low: the owner lookup and the start prologue are each extracted into one function.
- **Pass 3 — session `ebf54cd6-190c-4612-a32d-81e226c6d340`**, at `2562a6a`, the last pass the process allows. The JSON `modelUsage` reports `claude-fable-5-1`. Snapshot before and after: `52f1b0bdeda64aea45e0007500fa4e319d16f1721dad9ef820a5842643f143cc`, unchanged. The reviewer confirmed all pass-2 findings and pass-1 finding 10 as resolved. Findings: 0 Critical, 0 High, 1 Medium, 11 Low.
  - Medium, **unreviewed fix**: `planJournalRecovery` issued `continue-launch` for a launch intent although one of its executions had a non-retryable rejection, after a grant followed by a re-authorization rejected as final, or after a final rejection followed by W6; contract section 5 continues a launch only with "no non-retryable rejection", so a restarted worker would have requested again what the authority had refused. `continue-launch` now requires that no execution of the intent has a `rejected-final` operation; sealing is unchanged. Tests: `journal-recovery.test.ts`, "a final rejection stops the launch, after a grant or before a W6", covering both cases. Because a Medium finding remained after the third pass, the governance rule required a decision with options; the coordinator (Niki) obtained it from a Fable 5.1 medium subagent acting under the owner's delegation of 2026-10-25, which chose to fix it without another review. This is a **delegated decision**, not the owner's own.
  - Low, **unreviewed fixes**, fixed with the Medium as the rule requires: (1) a test reopens a root with an existing lock file and shows a second worker is refused; (2) a failing close during a stop no longer prevents the fault record; (3) the qualification record states that a worker restarted after an unrecorded fault would start, an obligation for item 20; (4) an unreadable fault record fails with `corrupt` and names its file; (5) a stale `-shm` file names removal while stopped as the remedy, and the record keeps new incarnations for real losses; (6) W5e from `authorized` is kept, because item 7 allows `authorized` to `exited` for a spawn failure, and is documented; (7) a failed directory creation reports `conflict` or `internal` instead of `flush-failure`; (8) the volume is checked before the data root is created, and the FAT test asserts nothing was created; (9) the missing control record in the contract's subtree table is listed under remaining gates; (10) three more section 13 tests are listed with their owners; (11) a lock file that is not SQLite fails with `corrupt`. Finding 6 changed documentation only.

## Limitations

Measured on one macOS host only; Linux in the worker image, power loss, and real device I/O errors are not exercised. See the qualification record's "Limits and remaining work".

## Remaining gates

`worker/journal-fault`, which keeps a stopped worker stopped across restarts in the same boot (contract section 7, step 4), is a control record that the subtree table of contract section 2 does not list yet; the contract needs that amendment. Independent review; integration by the coordinating session (pull request into `dev`, merge); archival; the macOS `F_FULLFSYNC` gate (items 14 and 25); native acceptance on the matrix (items 24 and 25).
