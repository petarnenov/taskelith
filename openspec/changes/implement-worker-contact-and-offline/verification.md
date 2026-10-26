# Verification

Date: 2026-10-26. Author verification is recorded below; the coordinator records the independent review.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, split by the coordinator; this is 20d2. Its scope is coordinator decision Q1 (A) of the archived 20d change (`2026-10-26-implement-worker-start-reconciliation`): the heartbeat publisher, the `status()` watcher, offline mode and its deadlines, the inventory report on reconnect, and the failed-first-connect change, plus 20d's obligation to build the supervision host without `TASKELITH_WORKER_COMMAND`.

- Base revision: `8a9abb6` on `dev`.
- Out of scope: the `unrecorded-process` scan, 20e (admission pressure, the disk floor, the backlog limit), and any contract change.
- Contracts: none changed. `execution.asyncapi.json` 0.5.0 already holds `worker.heartbeat` and an optional `requestId` on `worker.inventory.reported`.
- Dependencies: none added.

## Environment

macOS x86_64, Node v24.22.1 (`.nvmrc`), Docker with the Compose services of `make verify`.

## Author self-check

- **Heartbeat:** a schema-valid `worker.heartbeat` at once and every `10s`, only while connected; a refused send is logged and replaced (`worker-contact.test.ts`); the wired worker publishes it on its own heartbeat subject over core NATS on each connection, and on a reconnect at once, before any interval passes, and none after its journal stopped, at an interval or a reconnect (`worker-start.test.ts`).
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
| `make verify` at `40b5808` (pass 1 fixes) | passed; earlier at `e9a5341` |
| Tests | 1642 tests, 0 failures |
| Coverage (all) | 99.32% lines, 91.79% branches, 98.99% functions |
| Coverage (changed worker files) | `worker-contact.js`, `heartbeat-publisher.js`, `task-group.js` 100/100/100; `broker-session.js` 100/96.77/100; `inventory-report.js` 100/90.91/100; `worker-start.js` 99.17/90.65/100; `launch-orchestrator.js` 98.51/90.74/95.00; `settings.js` 100/100/100; `execution-supervision.js` 97.25/84.91/89.47; `command-intake.js` 99.23/87.04/100; `main.js` 90.98/82.93/85.00 (lines/branches/functions, %) |
| `npm run openspec -- validate implement-worker-contact-and-offline --strict` | valid |
| `npm run verify:comments` | passes at `40b5808` and `e9a5341`; at `7eaa72e` it reported one comment of three lines in `worker-contact.ts`, shortened in `e9a5341` |

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

## Limitations and remaining gates

- The coordinator answered OQ1 and OQ2 on 2026-10-26 (`design.md`): a maximum offline duration for running executions stays open for a later stage, and item 23b must make the Linux worker image always set `TASKELITH_CONTAINMENT_PARENT`.
- Remaining gates: independent review, integration into `dev`, and archive.
