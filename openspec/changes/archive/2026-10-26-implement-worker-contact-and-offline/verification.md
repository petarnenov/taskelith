# Verification

Date: 2026-10-26. Author verification is recorded below; the coordinator records the independent review.

## Scope and source

[G2 work plan](/docs/g2-plan.md) item 20, split by the coordinator; this is 20d2. Its scope is coordinator decision Q1 (A) of the archived 20d change (`2026-10-26-implement-worker-start-reconciliation`): the heartbeat publisher, the `status()` watcher, offline mode and its deadlines, the inventory report on reconnect, and the failed-first-connect change, plus 20d's obligation to build the supervision host without `TASKELITH_WORKER_COMMAND`.

- Base revision: `8a9abb6` on `dev`.
- Out of scope: the `unrecorded-process` scan, 20e (admission pressure, the disk floor, the backlog limit), and any contract change.
- Contracts: none changed. `execution.asyncapi.json` 0.5.0 already holds `worker.heartbeat` and an optional `requestId` on `worker.inventory.reported`.
- Dependencies: none added.

## Environment

macOS 26.6.2 (Darwin 25.6.0), arm64, Node v24.22.1 (`.nvmrc`), Docker with the Compose services of `make verify`.

## Author self-check

- **Heartbeat:** a schema-valid `worker.heartbeat` at once and every `10s`, only while the worker knows it is connected (one published before a disconnect is seen may be buffered by the client, design D5); a refused send is logged and replaced (`worker-contact.test.ts`); the wired worker publishes it on its own heartbeat subject over core NATS on each connection, and on a reconnect at once, before any interval passes, and none after its journal stopped, at an interval or a reconnect (`worker-start.test.ts`).
- **Status watcher:** `disconnect` ends the link-up work and marks the link down; `reconnect` restores it and reports again; a closed link is closed and replaced; a failed serve or close reaches the caller after the link is closed; a failed serve aborts the link-up work and the link closes only after it ended; a hundred status events leave the abort listeners unchanged; a hundred reconnect cycles leave the task group no ended task, and its `settled` waits for tasks added meanwhile and rethrows the first failure (`worker-contact.test.ts`).
- **Offline mode and deadlines:** offline from the start until the first connection; a link down for the `30s` timeout makes the worker offline, a link up within it does not; offline, no operation begins, an operation begun online runs to its deadline and expires, and the next one for the same execution waits for contact and reports `reportsNotStarted`; contact lost before a wait's continuation runs makes the launch wait again with no W2; a stop while waiting journals nothing; a cancellation while waiting journals no W2 and sends no request, and seals an execution whose earlier operation expired and reports it `not-started` (`worker-contact.test.ts`, `offline-launch.test.ts`, `worker-start.test.ts`).
- **Inventory on reconnect:** an unsolicited, schema-valid snapshot without `requestId` on each connection and reconnection, retried with the transport backoff, and ended with the link, including between two parts of a report (`inventory-report.test.ts`, `worker-start.test.ts`).
- **First connect:** a broker unreachable at the start leaves the worker running and offline; it retries after 5 s and 10 s and connects; a launching worker begins no authorization before it (`worker-contact.test.ts`, `worker-start.test.ts`).
- **Decoupled reconciliation:** without a launch authority the orchestrator seals a pending W2, recovers a written record, removes the record once its terminal fact is confirmed, defers only the re-authorization of an expired operation, and requests nothing (`offline-launch.test.ts`); the worker builds the host without a command and reconciles (`worker-start.test.ts`); a host that cannot be built defers with its reason, and only a launching worker fails its start then; the supervision adapter seals and removes without a program and refuses `prepare` (`execution-supervision.test.ts`); the containment parent is read on Linux without a command (`worker-settings.test.ts`).
- **Runtime failure:** a session that fails while the orchestrator runs stops the orchestrator, closes the root last, settles `stopped`, and is reported with exit status 1; `stop` then rejects with the failure (`worker-start.test.ts`).
- **Timers:** every new test drives time through injected sleeps (`ManualTimers`) or the deadline clock; none sleeps for real. The wiring tests in `worker-start.test.ts` keep their existing bounded polling.
- **Comment rule:** `npm run verify:comments` passes.
- **Shared test:** `apps/control-plane/test/control-plane-api.integration.test.ts` waits for the worker's recorded contact instead of flushing `RunningWorker.transport`, which no longer exists, and skips the unsolicited inventory reports when it reads the journaled observations.
- **OpenSpec:** `npm run openspec -- validate implement-worker-contact-and-offline --strict` passes; every requirement is under 450 characters.

## Checks

| Check | Result |
| --- | --- |
| `make verify` at `596ac4e` (final: the second merge of `origin/dev`, `32976aa`) | passed: 1699 tests, 1697 passed, 0 failures, 2 skipped (the Linux-only containment scan tests from `dev`, on macOS); coverage over all files 99.28% lines, 91.88% branches, 98.98% functions; comment, dependency, archive dry run, and package checks passed |
| `make verify` at `edcca02` (the pass 3 fixes and the merge of `origin/dev` `a698f11`) | passed: 1682 tests, 0 failures; coverage over all files 99.30% lines, 91.85% branches, 99.01% functions; comment, dependency, archive dry run, and package checks passed |
| `make verify` at `9bc0cfe` (pass 2 fixes) | passed: 1646 tests, 0 failures; 99.32% lines, 91.81% branches, 98.99% functions; earlier passed at `40b5808` and `e9a5341` |
| Coverage (changed worker files, at `9bc0cfe`) | `worker-contact.js`, `heartbeat-publisher.js`, `task-group.js` 100/100/100; `broker-session.js` 100/96.77/100; `inventory-report.js` 100/90.91/100; `worker-start.js` 99.17/90.65/100; `launch-orchestrator.js` 98.52/90.87/95.00; `settings.js` 100/100/100; `execution-supervision.js` 97.25/84.91/89.47; `command-intake.js` 99.23/87.04/100; `main.js` 90.98/82.93/85.00 (lines/branches/functions, %) |
| `npm run openspec -- validate implement-worker-contact-and-offline --strict` | valid at `596ac4e`, the final revision, and at `edcca02`, after the last review-driven spec edit of `15b846a` |
| `npm run verify:comments` | passes at `596ac4e`, `edcca02`, `9bc0cfe`, `40b5808`, and `e9a5341`; at `7eaa72e` it reported one comment of three lines in `worker-contact.ts`, shortened in `e9a5341` |

## Independent review

Reviewer: assigned by the coordinator, Claude Code Fable (`claude-fable-5-1`, effort medium, plan mode, editing tools disallowed).

### Unavailable reviewer

- On 2026-10-26 from 13:03 to 13:11 the invocation `claude -p "$(cat <prompt-file>)" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree at `7eaa72e`, exited 1 with `Error: No messages returned from query`, no JSON output, no session, and no model usage. Snapshot before and after: `f66567b8a65c1a10881ba12ccf1c86463f77f29e1649a91a993a616f262305e5`, unchanged. The attempt produced no pass.
- Under "Unavailable reviewer" (`docs/governance.md`) the worker proposed the next reviewer in the rotation that is not paused, and the coordinator assigned Codex CLI (`gpt-6.1-sol`, reasoning effort medium, read-only sandbox) as the replacement. Its first pass is pass 1.

### Pass 1

- Invocation, from the worktree: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt file and log outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, `docs/g2-plan.md` item 20, the worker specs, the execution wire, heartbeat, and enrollment contracts, the operational targets, the 20d archive, and the coordinator's answers to OQ1 and OQ2, and asked for every instance with severity, file and line, and a fix, and counts per severity. The read-only sandbox ran no tests; the pass was static.
- Session `01a177eb-20ea-7730-b939-621b5b69e692`. Model confirmation: the output header records model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`.
- Reviewed revision: `8d18b2e` against `8a9abb6`.
- Snapshot before and after: `b2b35bd21acc0471c91c26da166e37c4b5ceb4cdc5dd24e9f5de5190fe9f2a71`, unchanged.
- Findings: Critical 0, High 1, Medium 4, Low 0. All were resolved by the implementation subagent and checked by the worker, in `40b5808`.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | A failed session leaves `stopped` unsettled and the orchestrator running, and a stop can close the journal before every task ended; `#hold` and `serveConnection` fail fast through `Promise.all` | `TaskGroup`: the first failure aborts the group, `settled` waits for every task, the root closes last, and `stopped` settles on a self-termination too; `main.ts` shuts down after it; tests of a session that fails while the orchestrator runs |
| 2 | Medium | Contact can be lost between the end of the offline wait and W2 | `#authorize` rechecks `offline` in a loop with no `await` between the last check and W2; a test that loses contact in a microtask before the continuation |
| 3 | Medium | No heartbeat at once on a reconnect | Heartbeats run as link-up work and restart on each reconnect; the requirement says each connection and reconnection; the test expects the heartbeat before time advances |
| 4 | Medium | A multipart inventory report continues after a disconnect or stop, and its task is never awaited | The signal is checked before each part; link-up work joins the link's task group and is awaited; a test with a held publish aborted between two parts |
| 5 | Medium | The status watcher accumulates promise reactions | Each wait for the next status adds and removes its own abort listener; a test that the listener count stays flat over 100 statuses |

### Pass 2

- Same invocation as pass 1; the prompt named the pass 1 session and asked the reviewer to confirm each pass 1 resolution first.
- Session `01a177fc-3cb5-7573-91a8-ed9b0dab7ca2`. Model confirmation: the output header records model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`.
- Reviewed revision: `0442760` against `8a9abb6`.
- Snapshot before and after: `ca254e61eac3fda22cac086f753e60cd917844ab74140436acfd0434f304bf7b`, unchanged.
- Pass 1 confirmation: all 5 resolved.
- Findings: Critical 0, High 0, Medium 4, Low 1. Resolved by the implementation subagent and checked by the worker, in `9bc0cfe` and `15b846a`.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | Heartbeats continue after a journal fault | A heartbeat is sent only while connected and the journal has not stopped (journal contract section 7); requirement, scenario "Stopped journal", design D5; a test of a fault after connect, at an interval and on a reconnect |
| 2 | Medium | A cancellation ends the offline wait and W2 is then written while offline | A cancellation while waiting for contact begins no operation: a new execution ends without a journal row, one with an earlier operation is sealed as `not-started` without a new W2; design D4; tests assert no W2 |
| 3 | Medium | `TaskGroup` keeps every finished task | Only running tasks are kept, the first failure apart; `settled` waits until none runs; tests over 100 reconnects and a task added while waiting |
| 4 | Medium | The client may buffer a stale heartbeat while the async status lags | Partly real: the client buffers while disconnected but resets its outbound buffer on each connection attempt, so only a heartbeat published during the successful handshake survives, at most one dial timeout stale, and a fresh one follows at once; a synchronous check needs the client's private `protocol.connected`. Resolved by stating this bounded behaviour in the requirement, the new scenario "Disconnect not yet seen", and design D5; no code change |
| 5 | Low | The pending-W2 scenario launches without a launch command | The launch is conditional on a launch command and contact |

### Pass 3

- Same invocation; the prompt named the pass 2 session, asked the reviewer to confirm each pass 2 resolution first, and to judge the documented resolution of pass 2 finding 4. This was the last regular pass.
- Session `01a17807-ecbe-7511-897e-e9177b88c319`. Model confirmation: the output header records model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`.
- Reviewed revision: `0f2873b` against `8a9abb6`.
- Snapshot before and after: `348893101f2e725b97cb4f8279fa7fff312e4579c7c77e74f175d1c2f54b0386`, unchanged.
- Pass 2 confirmation: all 5 resolved; finding 4 through the documented bounded buffering, which the reviewer judged acceptable for a contact signal.
- Findings: Critical 0, High 0, Medium 2, Low 1.
- Decision: Medium findings remained after the third pass, so the worker stopped and sent the options to the coordinator for the owner (`docs/governance.md`). The owner was away; the owner's delegate decided, not the owner, in run `20261026T115520Z-opencode-77761`, as in the 20d precedent (run `20261026T101624Z-opencode-99267`): fix both Medium findings without another review, each with its test, and fix the Low one by recording the checks of the final revision. The fixes below are **unreviewed fixes**; the implementation subagent made them and the worker checked them, in `fc040b7`.

| # | Severity | Finding | Resolution (unreviewed) |
| --- | --- | --- | --- |
| 1 | Medium | A multipart inventory report keeps publishing its later parts after a journal flush failure | The journal fault is checked right before each part, for the unsolicited report and the request answer alike, and ends the report; a test holds the first part, raises the fault before its acknowledgement, and asserts no later part |
| 2 | Medium | A stop cannot interrupt a pending broker connection attempt, so `stopped` can hang with the root lock held | The attempt is awaited unless the stop aborts first; a connection that arrives late is closed and a late failure is only logged; tests of a stop during a pending attempt, with a late link and with a late failure; the test that stopped during the back-off is renamed |
| 3 | Low | No checks recorded for the final spec revision | `make verify` and the strict validation recorded for `edcca02`, the final revision (Checks) |

## Merges of `origin/dev`

### First merge


- At the coordinator's request, `origin/dev` at `a698f11`, which holds 20e (`implement-worker-admission-pressure`, #270 and #271), was merged in `edcca02`. This is integration work, not a review pass.
- Conflicts: `apps/worker/src/command-intake.ts` (imports only), `apps/worker/src/launch-orchestrator.ts`, `apps/worker/src/worker-start.ts`, and the tests `apps/worker/test/command-intake.test.ts` and `apps/worker/test/worker-start.test.ts`; `observation-messages.ts` and the control-plane integration test merged cleanly.
- Beyond a mechanical combination, reported to the coordinator before the push:
  - `Launch.#authorize` keeps the two conditions apart in one loop before W2: offline waits for contact, admission pressure waits for its poll, and each wait rechecks both, so W2 follows the last check of each with no `await` between. 20e's `#awaitAdmission` before W2 is replaced by that loop; its wait after a failed request is unchanged.
  - `pressure.watch` runs with the launches among the runtime's tasks rather than in the per-connection loops, because in this change the runtime runs without a connection; it refreshes and journals pressure and publishes nothing itself.
  - Tests: the offline launch tests take the pressure option 20e made required and test W2 waiting until the worker is both online and under no pressure; the 20e start test finds its observation by type, since the connection's inventory report may come first.
- The spec deltas do not overlap: 20e modified only "Worker-side admission limits" and added requirements, and the requirements this change modifies are unchanged on `dev` since `8a9abb6`; the archive dry run passed.

### Second merge

- At the coordinator's request, `origin/dev` at `32976aa`, which holds the unrecorded-process scan (#272 and #273), was merged in `596ac4e`. Integration work, not a review pass. The coordinator approved the two points of the first merge before it.
- Conflict: `apps/worker/src/worker-start.ts` only. The orchestrator's construction of this change is kept, and the host's `containments` from `dev` are passed to it; `main.ts`, `launch-orchestrator.ts`, `observation-messages.ts`, the supervision port and adapter, and `index.ts` merged cleanly. No code of either side changed its logic.
- The scan runs at the end of `#beginReconciliation`, which runs with or without a launch command and does not use the launch authority; `main.ts` builds the containment scan from the settings' containment parent, not from the launch command. A new test, "without a launch command, the start reconciliation reports unrecorded processes", starts a worker without a launch command and finds the `unrecorded-process` fact in the journal.
- Spec: `dev` changed only `worker-journal`. The "Start reconciliation" requirement of this change's `worker-runtime` delta now states that on Linux it reports unrecorded processes, with the scenario "Unrecorded process without a launch command", as the coordinator asked; `design.md` says the scan comes from `dev` and this change only runs it without a command.

## Limitations and remaining gates

- The coordinator answered OQ1 and OQ2 on 2026-10-26 (`design.md`): a maximum offline duration for running executions stays open for a later stage, and item 23b must make the Linux worker image always set `TASKELITH_CONTAINMENT_PARENT`.
- Remaining gates: integration into `dev` and archive.
