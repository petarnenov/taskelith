## Why

[G2 work plan](/docs/g2-plan.md) item 20 builds the worker application, split by the coordinator into changes; this is 20d2. The coordinator's decision Q1 (A) in the archived 20d change (`2026-10-26-implement-worker-start-reconciliation`, design) moved the worker's contact with the control plane here: the heartbeat, the `status()` watcher, lost contact and offline mode, the inventory on every reconnect, and the failed-first-connect change. 20d also left an obligation: start reconciliation and record removal must run without `TASKELITH_WORKER_COMMAND`, where 20d only logs `worker.reconciliation.deferred`.

Today a worker sends no heartbeat, so a quiet worker turns unreachable after `30s` ([add-worker-heartbeat](/openspec/changes/archive/2026-10-26-add-worker-heartbeat/design.md), risk "a busy worker without heartbeats"); it sends no inventory when it reconnects, although the [execution wire contracts](/docs/contracts/execution-wire-contracts.md) section 6 require one; a failed first broker connection fails its start (20a design D6); and nothing stops it from requesting launch authorizations while it is offline, which the plan's offline policy forbids ("no new launch while offline").

## What Changes

- **Heartbeat publisher.** `worker.heartbeat` on the worker's own core NATS subject, at once on each connection and then every `10s`, only while connected (contract 0.5.0, unchanged).
- **Status watcher.** The broker connection's `status()` events drive the worker's contact: `disconnect` and `reconnect`; a connection that closes is replaced.
- **Offline mode.** The worker is offline from its start until its first connection, and after a connection stays down for `30s`, the control plane's lost-contact timeout, until one is up again. Offline, it begins no new authorization operation; an operation already begun runs to its decision or deadline, so the 20d deadline cycle is unchanged, and the next operation waits until the worker is online.
- **Inventory on reconnect.** An unsolicited `worker.inventory.reported` without `requestId` on every connection and reconnection, retried with the transport backoff until published or the link is down.
- **First connect.** A failed first connection no longer fails the start: the worker runs offline (reconciliation and the journal work), and connects with retries of 5 s doubling to 60 s with jitter.
- **Decoupled supervision host (20d obligation).** The host is built from the platform and, on Linux, `TASKELITH_CONTAINMENT_PARENT`, which is now read with or without the command; the command only adds the launch program and the launch authority. Without the command the worker seals, recovers, forwards cancellations, and removes records, and defers only the re-authorization of an expired or retryable operation. Deferral of the whole reconciliation remains only when no host can be built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: start sequence, offline launch rule, launch settings, start reconciliation, record removal, and inventory answer modified; deferral without a supervision host replaces deferral without a launch command.
- `worker-contact`: the worker's heartbeat and its own detection of lost contact.

## Impact

- `apps/worker`: new `worker-contact.ts`, `broker-session.ts`, `heartbeat-publisher.ts`, and `inventory-report.ts`; `worker-start.ts` restructured around the session; `launch-orchestrator.ts` gains an optional authority and the contact gate; `settings.ts`, `execution-supervision.ts`, `main.ts`, `command-intake.ts`, and `observation-messages.ts` changed.
- Docs: `docs/local-installation.md` and `docs/operational-targets.md` (the worker side of the existing heartbeat row).
- No contract change: `execution.asyncapi.json` 0.5.0 already has `worker.heartbeat` and an optional `requestId`. No new dependency.
