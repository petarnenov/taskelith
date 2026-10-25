## Why

G2 work item 22 ([docs/g2-plan.md](../../../docs/g2-plan.md)): structured logs with command and attempt correlation and no secrets, and the architecture section 12 signals that G2 produces. It serves "Observability and security foundations begin in G0–G2" (section 13). Owner decision D13 (a) puts the logs and signals behind a module-owned port and leaves any metrics library for later. Items 24 and 27 need the signals as evidence. Before this change no product code logged anything or measured a signal. The PostgreSQL adapter (item 11) and the NATS transport (item 12) swallowed connection and pull errors silently, and item 12 left their visibility to this item.

## What Changes

- New private module `@taskelith/observability` (`packages/modules/observability`):
  - Domain:
    - `LogRecord` with a level, a stable dotted event name, a correlation of known identifiers (`correlationId`, `causationId`, `commandId`, `attemptId`, `executionId`, `assignmentId`, `taskId`, `workerId`, `eventId`, `observationId`), and scalar fields.
    - Redaction: a field whose name may hold a secret has its value replaced, and URL credentials and bearer tokens inside text are removed.
    - The `G2_SIGNALS` catalogue: `outbox.lag`, `outbox.pending`, `inbox.lag`, `assignment.age`, `assignment.offered`, `execution.unknown`, `worker.capacity.slots`, `worker.capacity.held`, `event-loop.lag`, and `database.latency`, each a gauge or a distribution with its unit.
  - Ports: `LogSink`, `Metrics`, and `ControlPlaneSignals`, with the discarding `NO_LOGS` and `NO_METRICS`, and a shared conformance suite for each.
  - Application:
    - `Logger`, which redacts and correlates every record, with `SILENT_LOGGER` as the default of a component given none.
    - `sampleControlPlane`, which records one snapshot or logs a failed read.
  - In-memory adapters `InMemoryLogSink` and `InMemoryMetrics`; the second summarizes each series for tests and drills.
- New private adapter `@taskelith/node-observability` (`packages/adapters/node-observability`), on Node built-ins only:
  - `JsonLinesLogSink`, which drops records rather than throw, block, or buffer without bound;
  - `EventLoopLagMonitor` over `perf_hooks.monitorEventLoopDelay`, less its resolution;
  - `runPeriodically`;
  - `SYSTEM_CLOCK`.
- `@taskelith/execution` gains `isUnknownExecution` and `unknownExecutionCount`. An unknown execution is one that is not terminal and carries evidence beside its state.
- `@taskelith/postgres`:
  - A migration adds the query columns `assignments.state` and `assignments.changed_at`, and `tasks.unknown_executions`. It backfills them from the stored records, also those holding escapes that `jsonb` rejects, and indexes the waiting rows. The repositories keep the columns up to date.
  - `PostgresControlPlaneSignals` reads outbox lag from the oldest append and the backlog, the oldest offered assignment, unknown executions, and eligible and held slots in one statement of a read-only `REPEATABLE READ` snapshot, which `PostgresDatabase.readOnly` provides, with ages taken on the database clock.
  - `PostgresDatabase` takes optional `metrics` and `logger`. It times each transaction attempt as `database.latency`. It logs a broken idle connection, a commit with an unknown outcome, and exhausted serialization retries.
- `@taskelith/nats`:
  - `ValidatingConsumer` takes optional `metrics`, `logger`, and `now`. It records `inbox.lag` from the JetStream append to the commit. It logs a quarantined message, a redelivery after a failed commit with the message's correlation, and a failed pull.
  - `OutboxPublisher` logs a failed publication with its event identity and backoff.
- `docs/architecture.md` section 6 lists the observability module and the Node adapter.
- `docs/operational-targets.md` gains a provisional section 4. It maps each signal to the target it watches, with a `15s` sample interval and a `20ms` event-loop resolution.

## Capabilities

### New Capabilities
- `execution-observability`: correlated, redacted structured logs and the G2 signals behind module-owned ports, with Node, PostgreSQL, and NATS adapters.

### Modified Capabilities

## Impact

- Two new private workspace packages. The published `taskelith` package and CLI are unchanged.
- No third-party dependency is added, so no owner approval is needed. The dependency inventory is regenerated for the new workspace links.
- The new migration is additive.

Out of scope:
- dashboards, alerting, and an exporter deployment;
- wiring the sampler and sinks into the applications, which items 16 and 20 compose;
- worker-side capacity and journal signals, which arrive with the worker runtime of item 20;
- queue depth, projection lag, embedding, and retrieval signals, which belong to later items.
