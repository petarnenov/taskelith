## 1. Contact

- [x] 1.1 `WorkerContact`: offline until the first connection, a `30s` lost-contact timer after a link goes down, `whenOnline`, logs
- [x] 1.2 `BrokerSession`: connect with retries (5 s to 60 s with jitter), the `status()` watcher, a closed link replaced, the link's work under its own signal
- [x] 1.3 Heartbeat publisher: `worker.heartbeat` at once and every `10s` over core NATS, only while known to be connected and the journal has not stopped
- [x] 1.4 Inventory on every connection: `publishInventory` shared with the request answer, an unsolicited snapshot retried until published or the link is down

## 2. Launches and reconciliation

- [x] 2.1 Orchestrator: optional launch authority; without it no launch, and re-authorization of an inherited expired or retryable operation deferred and logged once
- [x] 2.2 Orchestrator: no authorization operation begins while offline; a stop while waiting journals nothing
- [x] 2.3 Settings: `TASKELITH_CONTAINMENT_PARENT` read on Linux with or without the command
- [x] 2.4 Supervision host built from the platform; the launch program optional; deferral only when no host can be built
- [x] 2.5 `worker-start.ts`: the runtime starts offline, the session and the orchestrator run side by side, a failed first connection no longer fails the start

## 3. Tests

- [x] 3.1 `worker-contact.test.ts`: contact transitions and timeout, heartbeats, the session's retries, reconnects, closed links, and failures (injected timers)
- [x] 3.2 `inventory-report.test.ts`: unsolicited snapshot, backoff, end with the link
- [x] 3.3 `offline-launch.test.ts`: offline gate before the first connection and after lost contact, stop and cancellation while offline, reconciliation and removal without a launch authority
- [x] 3.4 `worker-start.test.ts`, `worker-settings.test.ts`, `execution-supervision.test.ts`: wiring, first connect offline, heartbeats and reports on each connection, host without a command, deferral without a host

## 4. Records and checks

- [x] 4.1 proposal.md, design.md, spec deltas (`worker-runtime`, `worker-contact`), `npm run openspec -- validate implement-worker-contact-and-offline --strict`
- [x] 4.2 `docs/local-installation.md` and the heartbeat row of `docs/operational-targets.md`
- [x] 4.3 `make verify`
- [x] 4.4 Independent review (coordinator)
- [x] 4.5 Integration into `dev` and archive (coordinator)
