# Verification

Date: 2026-10-26. Author verification is recorded below, followed by the three review passes the cap allows; the fixes of pass 3 are unreviewed.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, the third of the five changes the coordinator split it into (20c). The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is Claude Fable 5.1 (medium), as the coordinator assigned, with a cap of three passes.

- Base revision: `190e2cc` on `dev`.
- Scope: W2 and W3 of the worker journal contract, the `authorizeLaunch` retry loop (the same `operationId` without a decision, a backoff of 5 s to 60 s with jitter, a new `operationId` after the deadline), `workerLaunchDeadline` with its suspend cases, the supervisor's prepare, start, and seal, the observations `started`, `exited`, `not-started`, `uncertain`, and `launch.rejected`, cancellation forwarding, the offline rule, and the `publishEvidence` client (20a decision Q4 (b)). Obligations: item 17 (the retry loop, W2 and W3, the deadline) and R06.
- Out of scope: 20d and 20e, as the design's Non-Goals list.

### Coordinator decisions (2026-10-25)

- **Q1 (a):** 20c delivers the `EvidencePublisher` port and `HttpEvidencePublisher`; no launch calls it in G2. G2's result is the exit observation that 21b stores; evidence from a launch joins the harness in G3. Item 24's "persist its result" rests on that observation.
- **Q2 (a):** only the live termination evidence (`containment-empty`, `process-group-empty`, `never-spawned`) is mapped, and any other evidence fails its mapping explicitly. **Obligation on 20d:** the asyncapi amendment for `boot-changed` and `namespace-ended`, brought to the coordinator.
- **Q3 (a):** `TASKELITH_WORKER_COMMAND` and the Linux launch settings are optional. Without the command the worker accepts intents and never launches them, which a test shows. The settings are documented in `docs/local-installation.md`.
- Also accepted: the execution facts stored as JSON with their wire fields, and no journal format change; sealing before W4 and retrying with new identities; the record removal, a dead supervisor, and adoption left to 20d.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no third-party package added. `apps/worker` gains the workspace dependency `@taskelith/worker-supervisor`; the regenerated inventory differs only by it.
- Contracts: no contract document changed.
- Journal: no format change. No execution fact was journaled before this change, so the facts' new fields need no migration.

## Author self-check

- **W2 and W3:** W2 commits before the first request of each operation; a grant, a rejection, and a revocation each commit W3 (`launch-orchestrator.test.ts`).
- **Retry loop:** requests without a decision repeat one `operationId`, with delays within [5 s, 60 s]; a retryable rejection gets a new `operationId` for the same execution; a final one is journaled with its observation and never retried; `revoked` maps to a rejection with its reason; `expired` abandons the execution.
- **Deadline:** from the deadline clock read before the operation's first request. A grant past it, a reading of another boot, and an unreadable clock never hand a grant out; a deadline passed without a decision seals the execution, reports `not-started`, and authorizes a new one.
- **Launch sequence:** `intent`, then W4, then the supervisor start; W5s then W5e; a supervisor seal gives W6 and a new launch; a failed supervisor start is decided by recovery; a corrupt record gives one `uncertain`; a failed `intent` write abandons the execution before W4.
- **Offline:** no supervisor starts while the authority is unreachable.
- **Cancellation:** during authorization the launch stops and is sealed; after W4 the `cancel` file is written; the evidence is recorded only when every targeted execution is terminal, and at once when none exists.
- **Executions left pending:** an execution that a stop or an earlier process left before its terminal fact is not launched again; 20d reconciles it.
- **Wire mapping:** each execution observation is checked against `execution.asyncapi.json`; a `boot-changed` exit fails its mapping (Q2).
- **Evidence client:** the multipart parts, the bearer, the 200 and 201 answers, `unavailable` for 502, 503, 504, and a timeout, and refusal of an answer that violates `EvidenceRecord` or names another record.
- **Against ADR 0004:** hexagonal: the orchestrator depends on the journal port, the `LaunchAuthorityClient` port, and the `ExecutionSupervision` port, whose file adapter wraps `@taskelith/worker-supervisor`; the evidence client implements an Execution port. Contract-first: every new observation is checked against its schema.

## Checks

`make verify` ran in the worktree with every file tracked: exit 0.

- `verify:comments`: no violation.
- `make test` (with its own PostgreSQL, NATS, and Toxiproxy): 1246 tests, 1246 passed, 0 failed; coverage of all files 99.19% lines, 91.61% branches, 98.76% functions, above the 75% floor.
- `make contract-compatibility`: 0 breaking changes in each of the four documents.
- `verify:dependencies`: the inventory is current after `make dependency-inventory`.
- `openspec validate --all --strict`: 60 passed, 0 failed; `verify:archive`: every active change archives into strictly valid specs; `verify:package`: passed.

An earlier run failed one test only because the build had preceded the fix that keeps an unsettled execution from being launched again; the run above includes it.

## Review pass 1

- Reviewer: Claude Code, `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run by the coordinator in the worktree at `0918727`; the prompt forbade writing any file in the worktree, and the prompt and output are outside it.
- Model confirmation: Claude Fable 5.1 (`claude-fable-5-1`), medium effort, as the coordinator reported. Session ID: `3b52a249-1c99-40f9-ab57-33d6e54db3fb`.
- Snapshot: `f75486eca664063730ea71a7dd1cc7e3df30fec2be6530a7ee561dd94eb5bcfc` before and after; unchanged.
- Findings: 0 Critical, 0 High, 1 Medium, 7 Low.

| Finding | Resolution |
| --- | --- |
| M1: a cancellation of a superseded execution neither stopped the launch nor waited for it before its evidence | Fixed: any target resolves to its intent from the snapshot and stops that intent's launch; the evidence waits until no launch of the intent is live and every execution of it is terminal (design D5). Test "cancellation names a superseded execution". |
| L1: the observation slept on the stop signal, so a cancel file came up to one poll late | Fixed: until it forwards, the observation sleeps on the stop or cancel signal and forwards right after waking. |
| L2: a seal lost to a claim before W4 ended the launch without a fact | Fixed: the record a claim proves is journaled (W4, which a grant allows) and reported `uncertain`, with a test. |
| L3: an exception in a launch or a pass became an unhandled rejection | Fixed: both are caught and reported through `onFailure`, which the production worker writes to stderr redacted; the worker keeps running. Test with a throwing client. |
| L4: unbounded wait loops, an unawaited pass, and a negative proven by a fixed delay | Fixed: a bounded `until` helper, the cancellation pass awaited, and the worker-start check after ten poll intervals. |
| L5: `FakeSupervisions.prepare` collided with the CP2 term | Fixed: renamed `onCreated`. |
| L6: the supervisor version was read from `package.json` at import | Fixed: read lazily when a launch host is built. |
| L7: a five-clause condition in the cancellation forwarding | Fixed: the named predicates `isTerminal` and `needsCancelFile`; the authorization loop stays in `Launch`, since splitting it would not shorten it. |

A test also covers a cancellation of an execution that a stopped launch left open: its `cancel` file is written once.

After the fixes, `make verify` ran with every file tracked: exit 0. 1250 tests, 1250 passed, 0 failed; coverage 99.18% lines, 91.64% branches, 98.61% functions; 0 breaking changes in each document; `openspec validate --all --strict` 60 passed; `verify:archive`, `verify:dependencies`, and `verify:package` passed.

## Review pass 2

- Reviewer: Claude Code with the invocation of pass 1, run by the coordinator in the worktree at `6a62cf4`; the prompt named pass 1's session and forbade writing any file in the worktree.
- Model confirmation: `claude-fable-5-1` in `modelUsage`, medium effort. Session ID: `dca0e12a-6d12-4967-983c-0cd87729096b`.
- Snapshot: `96468a7adc9014c088836b47a1b722b1e88d271e4cbc3703b7b79d8c27911b87` before and after; unchanged.
- Pass 1: every resolution confirmed.
- Findings: 0 Critical, 0 High, 1 Medium, 7 Low.

| Finding | Resolution |
| --- | --- |
| M1: an execution finally rejected before any grant keeps no state, so the cancellation's evidence was never recorded | Fixed: `isSettled` counts it as settled; a pending W2 without a live launch does not (design D5). Tests "a cancellation after a final rejection records its evidence" and one for the pending W2. |
| L1: `spawnFailure` could violate `DisplayText` | Fixed: control characters are replaced and the text is cut to 1024 characters, with a schema-checked test. |
| L2: journal commits whose failure was dropped silently | Fixed: the helper `reported` passes each such failure to `onFailure` (the snapshot, the cancellation evidence, W4 after a lost seal, W5e, and `uncertain`) without changing the flow; a test fails W5e. |
| L3: a `conflict` from writing `cancel` was not treated as forwarded | Fixed: `cancelFiled` treats it as forwarded, in the pass and in the observation; a test. |
| L4: an `expired` answer leaves its operation pending in the journal | Documented in design D2 and the limitations, as a possible 20d journal follow-up. |
| L5: the worker-start `until` did not assert its condition | Fixed: it asserts after its bounded loop. |
| L6: a failed answer slept before the deadline check | Fixed: the deadline is checked before and after the delay. The cost of a long outage is recorded in design D2 and the limitations, for 20d and 20e. |
| L7: the orchestrator imported the clock port from the adapter package | Fixed: `execution-supervision.ts` re-exports `DeadlineClock` and `DeadlineReading`, and the orchestrator imports them from there. |

After the fixes, `make verify` ran with every file tracked: exit 0. 1255 tests, 1255 passed, 0 failed; coverage 99.18% lines, 91.63% branches, 98.61% functions; 0 breaking changes in each document; `openspec validate --all --strict` 60 passed; `verify:archive`, `verify:dependencies`, and `verify:package` passed.

## Review pass 3

- Reviewer: Claude Code with the invocation of pass 1, run by the coordinator in the worktree at `8a03e33`; the prompt named pass 2's session and forbade writing any file in the worktree. It is the last pass the cap allows.
- Model confirmation: `claude-fable-5-1` in `modelUsage`, medium effort. Session ID: `e1c102b6-c148-4fa0-ad32-8c129952985a`.
- Snapshot: `d30140016f4467ebfeac426e1898fce9d6c14656527fd5a7ab1d006dab0bc03c` before and after; unchanged.
- Pass 2: every resolution confirmed.
- Findings: 0 Critical, 0 High, 2 Medium, 7 Low.

Every fix below is **unreviewed**: the review cap is reached, and the Medium findings left after the third pass go to the owner through the coordinator ([governance](../../../docs/governance.md#independent-review-process)).

| Finding | Resolution (unreviewed) |
| --- | --- |
| M1: a cancel file that failed with another error than `conflict` made the observation sleep on an aborted signal, a hot loop | Fixed: once cancelled, the observation sleeps on the stop signal only, so a failed `cancel` is retried at the poll interval. Test with a `cancel` that answers `unavailable` and a fake sleep that honours its signal. |
| M2: `reportLaunchFailure` printed `[object Object]` for a `Failure` | Fixed: `launchFailureLine` writes a `Failure` through `redactFailure` with its code, and anything else as an `internal` message through `redactSecrets`; tests for both. |
| L1: a stopped launch's execution whose last outcome is a retryable rejection was never settled | Fixed: `isSettled` counts an execution never granted and rejected, finally or retryably, while no launch of the intent is live; a pending W2 stays unsettled. Test. |
| L2: failures of seal, recover, and read ended a launch silently | Fixed: each is passed to `onFailure` through `reported` before the launch ends; a test fails the read. |
| L3: W5s used the grant's `launchAuthId`, not the claim's | Fixed: W5s commits only when the claim names the launch's grant; a claim under another grant is reported `uncertain`. Test. |
| L4: the "Cancellation forwarding" requirement did not match D5 | Fixed: the requirement now names any target cancelling the intent, the settled executions, and evidence at once when there is none. |
| L5: `worker-start.ts` imported `DeadlineClock` from the adapter package | Fixed: it imports it from the port. |
| L6: the fake sleep advanced the clock on an aborted signal | Fixed: it returns at once without advancing the clock. |
| L7: the port types shared a file with the file adapter | Fixed: `execution-supervision-port.ts` holds the port, its types, the clock re-exports, and `sealWon`; `execution-supervision.ts` keeps the file adapter. |

After the fixes, `make verify` ran with every file tracked: exit 0. 1260 tests, 1260 passed, 0 failed; coverage 99.18% lines, 91.64% branches, 98.61% functions; 0 breaking changes in each document; `openspec validate --all --strict` 60 passed; `verify:archive`, `verify:dependencies`, and `verify:package` passed. An earlier run failed only the comment length check on one new comment, which was shortened.

## Limitations

- A supervisor that dies while the worker runs leaves the execution `started` until a restart; liveness belongs to 20d.
- Execution records are kept after their terminal fact until 20d removes confirmed ones.
- The record is polled every second, so a fact reaches the outbox up to one interval late.
- Before a grant names its own `ttl` and `skew`, the retry loop bounds an operation with the provisional `30s` and `5s` of the operational targets.
- The supervisor version written in `intent` is the worker package's version, since the supervisor ships in the worker's build.
- An execution observation's `correlationId` is its `assignmentId`, because the journal keeps no offer correlation with the intent.
- An `expired` answer abandons its execution but leaves the operation `pending` in the journal, since W3 records no outcome for it; a possible 20d journal follow-up (review pass 2, L4).
- A long outage seals one execution, and reports one `not-started`, per deadline cycle of about 25 s to 60 s; a note for 20d and 20e (review pass 2, L6).

## Remaining gates

- **Owner decision:** the review cap is reached with Medium findings after pass 3 (M1, M2); their fixes are unreviewed. The coordinator brings them to the owner, as governance requires.
- Coordinator integration into `dev` and archiving.
- 20d: start reconciliation, the asyncapi amendment of Q2, and record removal.
