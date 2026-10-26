## Context

20a connects once and fails the start when the first connection fails (its D6). 20b answers inventory requests; 20c launches under an online grant, independently of the broker; 20d reconciles on start, but only in a worker with `TASKELITH_WORKER_COMMAND`, because only that worker builds a supervision host (20d review pass 2, M-B, option B). The control plane already receives heartbeats and marks a silent worker unreachable after `30s` (`add-worker-heartbeat`). The NATS client reconnects without limit once connected and reports `disconnect` and `reconnect` through `connection.status()`.

## Coordinator decisions (2026-10-26)

- **Scope (20d Q1 A).** The heartbeat, the `status()` watcher, lost contact and offline mode, the inventory on every reconnect, and the failed-first-connect change; plus the 20d obligation to decouple the supervision host from the launch command.
- **Exclusions.** The `unrecorded-process` scan itself (`implement-unrecorded-process-scan`, merged from `dev`; this change only runs it without a launch command); admission pressure, the disk floor, and the backlog limit (20e, in parallel); any contract change.

## Goals / Non-Goals

**Goals:** a worker that starts and runs without a broker, sends heartbeats while connected, knows when it is offline and then begins no authorization, reports its inventory on every connection, and reconciles and removes records without a launch command.

**Non-Goals:** an offline policy for running executions (see OQ1); rotated credential delivery (G3 item 26); 20e's limits.

## Decisions

### D1: one broker session owns the connection

`BrokerSession` connects, retries a failed connection at the launch retry delays (5 s doubling to 60 s with jitter, `launchRetryDelay`), and holds the connection until the worker stops or the connection closes; a closed connection is replaced the same way. The work of one connection (the command consumer, the observation publisher) runs under a signal that ends with the connection; the inventory report and the heartbeats run under a link-up signal that ends at each `disconnect` and starts again at each `reconnect`. Tasks end together: the first failure aborts the others of its connection, and of the session and the orchestrator, and each waits for all of its tasks, so the journal closes last and `stopped` settles after a failure too. The launch orchestrator runs beside the session from the start, so reconciliation and the journal work never wait for the broker. `RunningWorker` no longer exposes a transport, which may not exist yet.

- **Alternative:** the client's `waitOnFirstConnect`. Its `connect()` resolves only once connected, so the start would block, and the retries would be invisible to the worker's logs.
- Every broker failure is `unavailable` (`brokerFailure`), so a wrong credential is retried as well; it is logged as `worker.broker.connect-failed` with each retry. Before, the process exited and its supervisor restarted it, which retried just the same.

### D2: the status watcher

The session iterates the connection's `status()`: `disconnect` marks the link down, `reconnect` marks it up; other events are ignored. The iteration ends when the connection closes, and a stop ends the watch without waiting for an event.

### D3: worker-side lost contact

`WorkerContact` holds two facts: whether the link is up, and whether the worker is offline. It is offline from the start until the first connection. A link that goes down starts a timer of `30s`, the control plane's lost-contact timeout; a link up within it cancels it, and only its expiry makes the worker offline. The changes are logged as `worker.contact.offline` and `worker.contact.online`.

- **Why the same timeout:** after `30s` without contact the control plane marks the worker unreachable and stops placing on it, and supersedes its assignments without a grant at once (capacity contract section 6). A new authorization after that would race the supersession. A short broker blip, on the other hand, should not stall launches. The timer runs on the injected `sleep`, so tests drive it deterministically.

### D4: offline, no operation begins

The orchestrator takes an optional `LaunchContact`. Each authorization operation waits while the contact is `offline`, checking it again after each `whenOnline`, because a lost-contact timer can fire before the wait's continuation runs; it then reads the deadline clock and commits W2 with no await in between, so its deadline counts from the first request. An operation already begun keeps its requests and its deadline, because the grant is the online check (launch authorization section 8), and the 20d deadline cycle is unchanged: the operation expires, and the next operation for the same execution waits until the worker is online. A stop while waiting journals nothing. A cancellation while waiting begins no operation either: a new execution ends with nothing journaled, and one with an earlier operation is sealed and reported `not-started`, as after a cancelled back-off.

- **Alternative:** offline at once on any disconnect. Simpler, but a reconnect a second later would pause launches for nothing; rejected for D3's reason.

### D5: heartbeats only while connected

`runHeartbeats` publishes at once on each connection and reconnection and then every `10s` over core NATS, only while the worker knows the link is up and the journal has not stopped, as no publication follows a flush failure (journal contract section 7). The client buffers publications while disconnected and resets its outbound buffer on each connection attempt (nats-core `protocol.js`, `prepare` and `resetOutbound`), so only a heartbeat published during the successful handshake, before the worker has seen the disconnect, can survive, at most one dial timeout stale; a fresh one follows at once. The heartbeat is a liveness hint, and the control plane tolerates a stale one. A synchronous check would need the client's private `protocol.connected`, which this change does not use. A publish that throws is logged at debug as `worker.heartbeat.unsent`; the next one replaces it. `sentAt` is the worker's clock, informational only.

### D6: the inventory on every connection

On each link up, `reportInventoryOnConnection` publishes an unsolicited snapshot, without `requestId`, through the same `publishInventory` that answers requests. A failed publication is retried with the transport retry delays until it is published or the link is down again; the next link up reports anew. The control plane treats such a report as the reconnect signal and requests a fresh snapshot (`implement-inventory-reconciliation` design, decision (a)).

### D7: the supervision host without the launch command

The host needs the platform, and on Linux the containment parent, to recover a record (an adopting supervisor joins the execution's cgroup). It needs the command and the execution account only to prepare a launch. So:

- `TASKELITH_CONTAINMENT_PARENT` moves from the launch settings to the worker settings. On Linux it is read whenever it is set, and a launch command still requires it.
- `fileSupervision` takes an optional program; `prepare` without one fails `precondition-failed`.
- The worker always builds the orchestrator when the host can be built, and gives it the launch authority only with a command. Without the authority the orchestrator launches nothing, seals, recovers, forwards cancellations, and removes records, and defers the re-authorization of an expired or retryable operation, logging `worker.reconciliation.deferred` once with the reason `no launch command`.
- A host that cannot be built fails the start only with a command, as before. Without one, the worker defers every open execution with the host's failure as the reason (`worker.reconciliation.deferred`), as 20d did for every worker without the command.

## Risks / Trade-offs

- **Credentials issued before `add-worker-heartbeat`** lack the heartbeat permission. The client reports the permission error asynchronously and keeps the connection; the control plane then sees no heartbeats from that worker. No worker was enrolled before that change.
- **A Linux worker without `TASKELITH_CONTAINMENT_PARENT` and without a command** still defers reconciliation; it cannot recover a Linux record without the cgroup parent.
- **Offline duration.** A worker offline for a long time keeps its running executions and its expired operations; nothing ends them.

## Open questions

Answered by the coordinator on 2026-10-26.

- **OQ1: an offline policy for running executions.** The architecture (universal lifecycle admission) lets started work continue "within its admitted scope and the configured offline policy", but no document defines a maximum offline duration. Answer: no new policy. The G2 offline policy is the one `docs/g2-plan.md` item 20 defines, "no new launch while offline", and this change implements only that. A maximum offline duration for running executions is out of scope and stays open for a later stage.
- **OQ2: requiring `TASKELITH_CONTAINMENT_PARENT` on every Linux worker.** It would remove the remaining deferral, but would make a Linux worker without it fail its start. Answer: it stays optional, consistent with the 20d deferral. Obligation: item 23b must make the Linux worker image always set it.
- **Documentation.** The edits to `docs/operational-targets.md` and `docs/local-installation.md` are accepted; they reuse the existing 30s value and add no new target.
