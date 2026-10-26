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
- **Evidence check** (added after review pass 1): the change adds only repository-relative links, to `docs/contracts/worker-journal.md` and to the `#independent-review-process` heading of `docs/governance.md`, and no external link, so none needs a pin; each link resolves.
- **OpenSpec:** `npm run openspec -- validate retry-unrecorded-process-on-full-disk --strict` passes; the modified requirement is 469 characters, and `verify:archive` archives it into strictly valid specs.

## Checks and results

- `npm run openspec -- validate retry-unrecorded-process-on-full-disk --strict`: `Change 'retry-unrecorded-process-on-full-disk' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` at `0aca7e1`: passed (exit 0); 1751 tests, 1749 passed, 0 failed, 2 Linux-only scan tests skipped on macOS; coverage 99.27% lines, 91.91% branches, 98.88% functions; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review pass 1

OpenCode CLI, model `opencode-go/kimi-k3.1-pro`, variant `high`, read-only `reviewer` agent, session `ses_e87416b47ffeGJs4hLD9Oy0lMS`, invoked from the worktree as `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title retry-unrecorded-process-on-full-disk "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log kept outside the worktree. The stored assistant messages record the model `kimi-k3.1-pro`, provider `opencode-go`, and variant `high`. Revision reviewed: `cca3f091c1b1b74450413417b53f6020c71f3b3a`. The snapshots before and after the pass matched (`e8e38d06eec225188c1fecced4b313eb4e5468d62eda07f4fbea6bf8ea6b4e50`). Findings: 0 Critical, 0 High, 0 Medium, 1 Low. The reviewer found no problem in the ordering, idempotence, backoff, failures other than a refusal for space, or a stopped journal, and called the test deterministic.

- **Low (fixed in the commit that records this pass, unreviewed):** the author self-check did not record the evidence check that the [independent review process](../../../docs/governance.md#independent-review-process) requires before the first pass. It is now recorded above. As the pass found only a Low, it is fixed without another review under that process.

The review is complete in one pass; the Low fix is unreviewed, as the governance rule allows for a Low-only pass.

## Limitations and remaining gates

- A report not yet committed when the worker stops is lost with the process; the next start scans again.
- A failure other than a refusal for space is reported at each pass while it lasts (design, Risks).
- Remaining gates: the coordinator's integration into `dev` and the archive of this change; no further review.
