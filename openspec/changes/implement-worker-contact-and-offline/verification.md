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

- **Heartbeat:** a schema-valid `worker.heartbeat` at once and every `10s`, only while connected; a refused send is logged and replaced (`worker-contact.test.ts`); the wired worker publishes it on its own heartbeat subject over core NATS on each connection (`worker-start.test.ts`).
- **Status watcher:** `disconnect` ends the link-up work and marks the link down; `reconnect` restores it and reports again; a closed link is closed and replaced; a failed serve or close reaches the caller after the link is closed (`worker-contact.test.ts`).
- **Offline mode and deadlines:** offline from the start until the first connection; a link down for the `30s` timeout makes the worker offline, a link up within it does not; offline, no operation begins, an operation begun online runs to its deadline and expires, and the next one for the same execution waits for contact and reports `reportsNotStarted`; a stop while waiting journals nothing; a cancellation while waiting ends the launch without a request (`worker-contact.test.ts`, `offline-launch.test.ts`, `worker-start.test.ts`).
- **Inventory on reconnect:** an unsolicited, schema-valid snapshot without `requestId` on each connection and reconnection, retried with the transport backoff, and ended with the link (`inventory-report.test.ts`, `worker-start.test.ts`).
- **First connect:** a broker unreachable at the start leaves the worker running and offline; it retries after 5 s and 10 s and connects; a launching worker begins no authorization before it (`worker-contact.test.ts`, `worker-start.test.ts`).
- **Decoupled reconciliation:** without a launch authority the orchestrator seals a pending W2, recovers a written record, removes the record once its terminal fact is confirmed, defers only the re-authorization of an expired operation, and requests nothing (`offline-launch.test.ts`); the worker builds the host without a command and reconciles (`worker-start.test.ts`); a host that cannot be built defers with its reason, and only a launching worker fails its start then; the supervision adapter seals and removes without a program and refuses `prepare` (`execution-supervision.test.ts`); the containment parent is read on Linux without a command (`worker-settings.test.ts`).
- **Timers:** every new test drives time through injected sleeps (`ManualTimers`) or the deadline clock; none sleeps for real. The wiring tests in `worker-start.test.ts` keep their existing bounded polling.
- **Comment rule:** `npm run verify:comments` passes.
- **Shared test:** `apps/control-plane/test/control-plane-api.integration.test.ts` waits for the worker's recorded contact instead of flushing `RunningWorker.transport`, which no longer exists, and skips the unsolicited inventory reports when it reads the journaled observations.
- **OpenSpec:** `npm run openspec -- validate implement-worker-contact-and-offline --strict` passes; every requirement is under 450 characters.

## Checks

| Check | Result |
| --- | --- |
| `make verify` | passed |
| Tests | 1637 tests, 0 failures |
| Coverage (all) | 99.31% lines, 91.77% branches, 98.96% functions |
| Coverage (changed worker files) | `worker-contact.js`, `heartbeat-publisher.js` 100/100/100; `broker-session.js` 100/96.67/100; `inventory-report.js` 100/86.67/100; `worker-start.js` 99.14/90.00/96.55; `launch-orchestrator.js` 98.50/90.61/95.00; `settings.js` 100/100/100; `execution-supervision.js` 97.25/84.91/89.47; `command-intake.js` 99.23/87.04/100; `main.js` 90.91/82.93/85.00 (lines/branches/functions, %) |
| `npm run openspec -- validate implement-worker-contact-and-offline --strict` | valid |
| `npm run verify:comments` | passes |

## Independent review

To be recorded by the coordinator.

## Limitations and remaining gates

- Open questions OQ1 (an offline policy for running executions) and OQ2 (requiring `TASKELITH_CONTAINMENT_PARENT` on every Linux worker) are in the design.
- Remaining gates: independent review, integration into `dev`, and archive.
