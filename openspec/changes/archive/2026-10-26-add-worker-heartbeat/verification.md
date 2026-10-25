# Verification

Change `add-worker-heartbeat`, part of G2 items 20 and 21.

## Scope and source

- **Source:** the coordinator's brief of 2026-10-26, which moves this change ahead of item 20d and carries coordinator decision Q1 (a) of item 20 ([proposal](proposal.md)).
- **Scope:** the heartbeat contract and the control-plane side: the message and subject, the worker's publish permission, the documentation, the provisional targets, the authenticated consumer, and the bounded lost-contact check.
- **Excluded:** the worker's heartbeat publisher and its own detection of lost contact (20d); reconciling a lost worker's attempts. Contact from inventory reports came with 21c, merged in `bbdec52`.
- **Branch:** `add-worker-heartbeat`, from `origin/dev` at `aba18f5`.

## Environment

- Linux 6.8.0-147-generic, Node.js v24.22.1 and npm 11.19.1 as `make verify` selects them, Docker with the Compose services of `scripts/services.sh` (PostgreSQL, NATS, Toxiproxy).

## Author self-check

Checked before the first pass against `AGENTS.md`, ADR 0004, the governance review process, and the specifications the change touches. The written record came after pass 1, which pass 1 found (M6).

- **Scope.** Only the brief's items; the worker publisher stays in 20d. Two additions follow from the brief's "any contact": a duplicate observation records contact (pass 1 M4), and the shared producer authentication.
- **Architecture.** The subject and the permission are in the NATS adapter. The receiver is an adapter that hands a parsed body to the application's `HeartbeatService`. The lost-contact write is a `WorkerReports` port method with in-memory and PostgreSQL adapters and a conformance case.
- **Contract first.** `execution.asyncapi.json` 0.4.0 declares the message before any code uses it, and the compatibility check passes.
- **Comments.** Every comment is at most two lines of 80 characters (`npm run verify:comments`).
- **Evidence check.** The change adds no external link; every link it adds is repository-relative.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `bd8f15f` | Failed: the type check of the tests rejected a subscription callback that returned a number. Fixed in `6c5145a`. |
| `make verify` | `6c5145a` | Passed: 1219 tests, 1204 passed, 0 failed, 15 skipped (macOS only); coverage of all files 99.13% lines, 91.59% branches, 98.67% functions. |
| `make verify` | `4b9bbc1` | Passed: 1222 tests, 1207 passed, 0 failed, 15 skipped (macOS only); coverage 99.13% lines, 91.61% branches, 98.67% functions; `execution.asyncapi.json` has 2 breaking changes against `aba18f5`, declared by 0.4.0; OpenSpec 60 items valid; the archive dry run, dependency inventory, and package checks passed. |
| `make verify` | `b68deca` | Failed: 1 of 1223 tests. The queue-group integration test let its fixture close the connection before stopping the receivers, which the pass 2 fix now treats as a failure. Fixed in `bf1ce68`. |
| `make verify` | `bf1ce68` | Tests passed (1224, 1209 passed, 0 failed, 15 skipped); failed at OpenSpec validation: the `nats-transport` requirement "Heartbeat receiver" exceeded 500 characters. Fixed in `aecdd19` by splitting it. |
| `make verify` | `aecdd19` | Passed: 1224 tests, 1209 passed, 0 failed, 15 skipped (macOS only); coverage 99.14% lines, 91.64% branches, 98.67% functions; the contract check passed with 0.4.0; OpenSpec 60 items valid; the archive dry run, dependency inventory, and package checks passed. |
| `packages/adapters/nats/test/transport.integration.test.ts`, 3 consecutive runs | `bf1ce68` working tree | 16 of 16 tests passed in each run. |
| `make verify` | `bbdec52` (merge of `origin/dev` at `6b6a656`) | Passed: 1293 tests, 1278 passed, 0 failed, 15 skipped (macOS only); coverage 99.16% lines, 91.46% branches, 98.75% functions; `execution.asyncapi.json` has 2 breaking changes against `6b6a656`, declared by 0.4.0; OpenSpec 61 items valid; the archive dry run, dependency inventory, and package checks passed. |
| Mutation check of the retired-journal heartbeat test | `bbdec52` working tree | With `isCurrentProducer`'s `retiredAt` check removed, the new test fails (6 passed, 1 failed); restored, 7 of 7 pass. |
| `make contract-compatibility` with the version left at 0.3.0 | before `bd8f15f` | Failed as expected: `add /components/messages/workerHeartbeat` and `add /components/schemas/WorkerHeartbeat` need a new minor version. |
| `apps/control-plane/test/heartbeat.integration.test.ts`, 5 consecutive runs | `4b9bbc1` working tree | 5 of 5 tests passed in each run, including both orders of the race between a heartbeat and the check. |

Tests the change adds:
- contract: `WorkerHeartbeat` accepts the minimal heartbeat and refuses an extra field, another `messageType`, and a missing `workerId`, `journalId`, or `sentAt`;
- transport: the heartbeat subject and its parser, the worker's publish permission, the schema table of the heartbeat channel, the receiver's handling, drops, bound, and stop;
- NATS: two receivers in one queue group share four heartbeats, no stream matches the subject, and a stop ends the receiver; a worker user publishes only on its own heartbeat subject;
- scheduling: the `markContactLost` conformance case, run in memory and in PostgreSQL;
- control plane: a heartbeat records contact at the database time; a heartbeat on another worker's subject, without a subject worker, of another journal, of a revoked worker, or of an unknown worker is `forbidden` and records nothing; a stale worker turns unreachable after the timeout with an injected clock, and contact makes it reachable again; the batch bound; a duplicate observation restores contact; PostgreSQL contact, timeout, observation contact, revocation, and both race orders.

## Independent review

Reviewer assigned by the coordinator: Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, with a cap of three passes.

### Pass 1

- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, prompt outside the worktree.
- **Model confirmation:** the output header shows model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- **Session:** `01a1752b-d9d1-7ef2-8a79-a6780590a713`.
- **Revision:** `6c5145a`.
- **Snapshot:** `5f9a42c65f4217a92d1f4d28513ef86ab493ef2ddf2dde605ebd6c82230acdf3` before and after; unchanged.
- **Result:** 1 High, 5 Medium, 3 Low.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | The receiver checks `getPending()` only when it takes a message, so the client's queue grows without limit while a handler waits. | Fixed in `4b9bbc1`: a subscription callback puts arrivals into the receiver's own queue of at most `1,000` and drops the rest, with a test of a waiting handler and a burst. |
| M2 | After a stop, the receiver still handles the heartbeats already buffered. | Fixed in `4b9bbc1`: the loop checks the stop before each heartbeat and unsubscribes in `finally`, with a test of a stop while a handler waits and heartbeats are queued. |
| M3 | An inventory report does not record contact, although the new requirement counts it. | Not changed: contact from an inventory report is 21c's, as the brief's "reachability that 21b and 21c record" and 21b's proposal state. The requirement, design, contract page, and targets now say that inventory contact counts once 21c consumes it. |
| M4 | A duplicate observation does not record contact, so a worker that republishes after a lost confirmation can turn unreachable. | Fixed in `4b9bbc1`: `ObservationService` records contact before the inbox check, with a unit test and an `observation-consumption` delta. |
| M5 | No test covers the race between a contact and the lost-contact update. | Fixed in `4b9bbc1`: two PostgreSQL tests hold one transaction at a barrier until the other waits for the row lock, in both orders; the worker ends reachable in both. |
| M6 | `verification.md` with the author self-check and evidence check is missing before the first pass. | Fixed: this record. The self-check took place but was not written before pass 1. |
| L7 | The `40s` detection bound ignores the batch and the check's duration, and the restart note assumes one batch. | Fixed in `4b9bbc1`: the targets and the design state the extra interval per further `100` silent workers, the check's duration, and the restart in batches. |
| L8 | The contract page still says that a worker publishes only on its observation subject. | Fixed in `4b9bbc1`. |
| L9 | The contract page's rule that a malformed message goes to quarantine contradicts the heartbeat receiver. | Fixed in `4b9bbc1`: a malformed heartbeat is dropped and logged. |

### Pass 2

- **Invocation:** as pass 1, with the prompt naming pass 1's session and asking to confirm each resolution first.
- **Model confirmation:** the output header shows model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- **Session:** `01a17535-0986-73a0-b029-b3fc4b06203f`.
- **Revision:** `67dc5df`.
- **Snapshot:** `70bcc382e283c386713a4ec6ac16d28fd567b6704d80a87338b58b35bc6e444a` before and after; unchanged.
- **Result:** H1, M2, M4, M5, M6, L8, and L9 confirmed resolved; the disposition of M3 accepted; L7 partly resolved. Remaining: 0 High, 1 Medium, 1 Low.

| # | Finding | Disposition |
| --- | --- | --- |
| M10 | A subscription that closes without a stop, for example after a permissions error, ends the receiver as if it succeeded, so the control plane runs on without heartbeats. | Fixed in `b68deca`: the receiver then fails with the closure's cause, and the supervisor stops the control plane; a unit test closes with an error, and an integration test closes the connection (`bf1ce68`). |
| L7 | The detection time still ignores that each check starts `10s` after the previous one ends, and the duration of the checks in between. | Fixed in `b68deca`: the targets and the design state the interval after each check's end, add the checks' durations, and claim no hard bound while a check's duration is unbounded. |

### Pass 3

- **Invocation:** as pass 1, with the prompt naming the sessions of passes 1 and 2 and asking to confirm M10 and L7 first.
- **Model confirmation:** the output header shows model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- **Session:** `01a17540-a0b2-7ad3-9d6e-0b60c56f9cfe`.
- **Revision:** `5ca6633`.
- **Snapshot:** `b1bf26a45f07b6cb9bb055590e74111dfa03c792f8c82063b304ebd8b903ee26` before and after; unchanged.
- **Result:** M10 and L7 confirmed resolved; no new functional defect. Remaining: 0 High, 0 Medium, 2 Low.

| # | Finding | Disposition |
| --- | --- | --- |
| L11 | "One transaction per observation" lets a duplicate change nothing but a confirmation, while the new delta records contact for it. | Fixed after pass 3, unreviewed under the Low-only rule: the delta modifies the requirement to allow the worker's contact. |
| L12 | "Confirmation sent again" forbids any other effect of a duplicate. | Fixed after pass 3, unreviewed under the Low-only rule: the delta modifies the requirement to allow recording the worker's contact. |

### Merge with `dev` (worker step 9)

The coordinator returned the change because merging `origin/dev` at `6b6a656`, which holds item 21c (`implement-inventory-reconciliation`), conflicted in 11 files. The merge commit is `bbdec52`.

Resolution, keeping both sides as the coordinator asked:
- **Scheduling.** `WorkerReports` keeps `markContactLost` beside 21c's `recordJournalLoss` and `restartFences`, in memory and in PostgreSQL. Both sides' conformance cases are kept.
- **Observations.** 21c's `ObservationService` is kept: `authenticateProducer` with its journal replacement, `#recordKnown`, the rollback retirement, and the pending snapshots. This change's contact for an authenticated duplicate moves to `#record`, right after authentication, out of `recordPosition`. A rollback still rolls the contact back.
- **Heartbeat authentication.** `producer-authentication.ts` is removed. Heartbeats use `isCurrentProducer` in `journal-reconciliation.ts`, which shares `enrolledProducer` and `seenJournal` with `authenticateProducer`. It accepts only the enrolled journal, not retired, and never replaces a journal (design decision 7).
- **New incarnation.** A PostgreSQL test checks the sequence: a heartbeat of an unseen journal is refused and replaces nothing; once an observation of that journal replaces the enrolled one, its heartbeats record contact, and the replaced journal's are refused.
- **Specs and docs.** The `observation-consumption` delta modifies "One transaction per observation" on top of 21c's text, so archiving keeps 21c's rule. The `worker-contact` delta, the contract page, and the targets count inventory-report contact, which settles pass 1 M3. They also state that a heartbeat replaces no journal.
- **Composition.** The heartbeat receiver and the lost-contact loop are wired beside 21c's `InventoryService` and start inventories.

Merge review:
- **Invocation:** as pass 1, with a prompt describing the merge, the coordinator's instruction, and the resolution choices.
- **Model confirmation:** the output header shows model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only.
- **Session:** `01a17556-c06a-7a92-b7da-2a071fb9f5b9`.
- **Revision:** `bbdec52`.
- **Snapshot:** `86076315bd71527df3ba02632a312826b0c01d70ddaee8be7d988fa67d639761` before and after; unchanged.
- **Result:** both sides' behavior kept, the new incarnation's heartbeat authenticates after a replacement, contact order keeps the rollback semantics, and no delta overwrites 21c's requirements. 0 High, 0 Medium, 1 Low.

| # | Finding | Disposition |
| --- | --- | --- |
| L13 | No test covers a heartbeat of the enrolled journal after a rollback retired it, so `isCurrentProducer`'s `retiredAt` check is untested. | Fixed after the merge review, unreviewed under the Low-only rule: a PostgreSQL test retires the journal by a sequence rollback and shows that its heartbeat is `forbidden` and changes neither `reachable` nor `last_contact_at`; the mutation check above shows that the test catches a missing check. |

## Limitations

- No worker sends heartbeats before 20d, so the end-to-end path from a real worker is untested; the NATS tests publish heartbeats with a worker user's credentials.
- Credentials issued before this change lack the heartbeat permission until the next rotation (design, risks).
- The `10s`, `30s`, `100`, and `1,000` values are provisional; G6 verifies them.

## Remaining gates

- Coordinator integration into `dev` and archive.
