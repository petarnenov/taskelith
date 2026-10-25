## Context

Architecture section 12 lists the signals to monitor and asks for logs with command and attempt correlation and no secrets. Section 13 starts the observability foundation by G2. Owner decision D13 (a) assigns G2 item 22 a module-owned port and leaves a metrics library for later.

Two items came before this one:
- Item 11 stores the outbox, the inbox, tasks, and assignments in PostgreSQL. Tasks and assignments keep their records as text beside a few query columns.
- Item 12 publishes the outbox through JetStream and receives through validating pull consumers.

Neither adapter logged. Each swallowed connection, pull, and publication errors, and item 12 left their visibility to item 22.

## Goals / Non-Goals

**Goals:**
- correlated structured records that cannot carry a secret through a field named for one, or through credentials inside text;
- the G2 signals: outbox and inbox lag, assignment age, unknown execution count, worker capacity, event-loop lag, and database latency;
- ports in a module, adapters outside it, and Node built-ins only.

**Non-Goals:**
- dashboards, alerting, and an exporter;
- the composition of sampler, sinks, and adapters in the applications (items 16 and 20);
- worker-side capacity and journal signals (item 20);
- the signals of later gates;
- tracing.

## Decisions

- **A module of its own.** `@taskelith/observability` has the domain, application, and ports layers that architecture section 6 asks of a module. Every other module and adapter can depend on it without depending on execution or scheduling. It depends on the kernel, and on `sdlc` for the `Clock` port.
- **Ports.**
  - `LogSink.write(record)` and `Metrics.record(measurement)` are synchronous commands that must not throw into the caller. Logging and measuring never fail work.
  - `ControlPlaneSignals.read()` returns a `Result`, because a database read can fail.
  - Components that take a logger or metrics default to `SILENT_LOGGER` and `NO_METRICS`, in the null-object style of `NO_CRASH_POINTS`.
- **Redaction in the logger, not in the sink.** Every record passes the same rules before any sink sees it:
  - A field whose name matches a secret pattern (password, secret, token, credential, authorization, cookie, private key, API key) is replaced by `[redacted]`.
  - URL user information and bearer tokens inside text are removed. This covers a failure message that quotes a connection URL.
  - A correlation keeps only the known identifier keys with string values, so a received body cannot add other fields.
  - Message bodies and payloads are never logged.
- **Signals.** The catalogue fixes each name, kind, and unit.
  - Gauges are read from state; distributions are sampled per occurrence. The in-memory registry keeps a gauge's last value and a distribution's count, sum, minimum, and maximum per label set.
  - Any exporter can map the catalogue later.
- **Inbox lag** runs from the JetStream append (`timestampNanos`) to the receiver's commit, per stream and consumer. The broker clock and the receiver clock may differ, so a negative value reads as zero. The PostgreSQL inbox has no send time, and the command's `issuedAt` would also count outbox lag, which has a signal of its own.
- **Query columns instead of `jsonb` scans.** Reading the assignment state or the executions from the text records would cast every row to `jsonb` in every sample, and the cast fails on an escaped NUL.
  - The migration adds `assignments.state`, `assignments.changed_at`, and `tasks.unknown_executions`, with partial indexes on the waiting rows. The repositories write them with each record, as they write the other query columns.
  - The one-time backfill reads the records as `jsonb`, as the resource-admission migration does.
- **Unknown execution.** It is an execution that is not terminal and has evidence (`uncertain`, `termination-unproven`, `local-history-lost`) beside its state. This is the set that keeps ownership and capacity until reconciled.
  - The domain function `unknownExecutionCount` in `@taskelith/execution` defines it once.
  - The PostgreSQL column stores its result.
- **Ages on the database clock.** Assignments are stamped by `tx.now()`, and the outbox by `now()`. The snapshot therefore subtracts on the database clock, and a row stamped in the future reads as age zero.
- **Database latency** is each transaction attempt, its connection checkout included, so retries and pool waits are visible.
- **Logged events.**
  - `postgres.connection.lost`, `postgres.commit.unknown`, and `postgres.serialization.exhausted`.
  - `nats.message.quarantined`, `nats.message.redelivered`, `nats.pull.failed`, and `nats.outbox.publish-failed`.
  - `observability.sample.failed`.
- **Node built-ins only.** `perf_hooks.monitorEventLoopDelay` gives the event-loop p99, `performance.now()` the durations, and a writable stream the JSON lines. Neither pino nor OpenTelemetry is needed for G2, so the owner has no dependency to approve.

## Risks / Trade-offs

- A denylist of field names can miss a secret under an unusual name. Callers log only identifiers, counts, codes, and failure messages, never bodies. The text rules catch the credential form that failure messages quote.
- The snapshot runs one statement with several subqueries. Each subquery reads a partial index or a small table, but the 1000-machine cost is measured in G6.
- `worker.capacity.slots` and `worker.capacity.held` are fleet totals. Per-worker series would grow with the fleet; they can come with an exporter.
- The in-memory registry is the only metrics store until an exporter is chosen.
