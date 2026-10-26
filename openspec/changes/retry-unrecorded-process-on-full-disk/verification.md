# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review follows.

## Scope and source

The limitation recorded in the verification of the archived `implement-worker-daemon-pressure` change (20e2): `recordUnrecordedProcess`, the Linux unrecorded-process report of the archived `implement-unrecorded-process-scan` change, was reported as a failure on a refusal for lack of space and not retried until the next start. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `f9ba7a5` on `dev`.
- Scope: the retry of that report through the existing `HeldWrites` of 20e2, with the [worker journal contract](../../../docs/contracts/worker-journal.md) section 6 identity and section 7 "Full disk" rules.
- Out of scope: failure scenarios (G2 item 24), the fate of leftover record directories, macOS (no scan), and any contract change.

### Values used

- The backoff (`5s` to `60s` with jitter): operational targets section 1, automatic retry row; `launchRetryDelay`, unchanged.
- The identity `['unrecorded-process', journalId, containment]`: worker journal contract section 6; `observationIdOf`, unchanged.

## Evidence

- Revision: `0aca7e1` for the author check (code `8bf16a0`; verification.md written after the run).
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: no change to `docs/contracts`, `docs/operational-targets.md`, `execution.asyncapi.json`, or the OpenAPI document; journal format unchanged.
- Live documents: no non-archived document recorded the limitation, so none was changed; the archived 20e2 records are left as they are.

## Author self-check

- **Retry:** `LaunchOrchestrator` keeps each populated containment without a record in `#unrecorded` and journals the due ones on every pass through `HeldWrites.due` and `HeldWrites.commit` under `unrecorded-process/<containment>` (`apps/worker/src/launch-orchestrator.ts`); a committed report leaves the map.
- **Ordering:** the first pass journals the reports where it did before, after the record listing and leftovers and before the recovery actions; later passes journal the due ones at the same point.
- **Test** (`unrecorded-process-scan.test.ts`, "an unrecorded process refused for lack of space is journaled once after the backoff"): the enrolled journal reopened over a database whose next two `COMMIT`s fail with `SQLITE_FULL` (13), so the real adapter rolls back, calls `onSpaceRefused`, and answers `disk-full`. A second pass within the backoff tries nothing; after each logged backoff the next pass tries again; the outbox then holds exactly one `unrecorded-process` whose `observationId` is `observationIdOf(fact, journalId)`; a later pass past 60 seconds adds nothing; one scan, two backoffs, no reported failure. The test fails on the base revision's code (no entry is ever journaled) and passes with the change.
- **Existing tests:** the other unrecorded-process scan tests and `start-reconciliation.test.ts` pass unchanged.
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate retry-unrecorded-process-on-full-disk --strict` passes; the modified requirement is 469 characters, and `verify:archive` archives it into strictly valid specs.

## Checks and results

- `npm run openspec -- validate retry-unrecorded-process-on-full-disk --strict`: `Change 'retry-unrecorded-process-on-full-disk' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` at `0aca7e1`: passed (exit 0); 1751 tests, 1749 passed, 0 failed, 2 Linux-only scan tests skipped on macOS; coverage 99.27% lines, 91.91% branches, 98.88% functions; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review

Pending: the independent review (OpenCode CLI, `kimi-k3.1-pro`) has not run yet.

## Limitations and remaining gates

- A report not yet committed when the worker stops is lost with the process; the next start scans again.
- A failure other than a refusal for space is reported at each pass while it lasts (design, Risks).
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
