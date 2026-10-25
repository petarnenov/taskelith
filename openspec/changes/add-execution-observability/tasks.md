## 1. Module and adapters

- [x] 1.1 Add `@taskelith/observability`: log records, redaction, the G2 signal catalogue, the `LogSink`, `Metrics`, and `ControlPlaneSignals` ports, the `Logger`, snapshot sampling, and in-memory adapters.
- [x] 1.2 Add `@taskelith/node-observability`: JSON-lines sink, event-loop lag monitor, periodic sampler, and system clock, on Node built-ins.
- [x] 1.3 Add `isUnknownExecution` and `unknownExecutionCount` to `@taskelith/execution`.
- [x] 1.4 PostgreSQL: the signals migration with backfill, the repository query columns, `PostgresControlPlaneSignals`, and the latency and logs of `PostgresDatabase`.
- [x] 1.5 NATS: inbox lag and logs in `ValidatingConsumer`, and the publication-failure log in `OutboxPublisher`.

## 2. Documentation

- [x] 2.1 Add the provisional observability section to `docs/operational-targets.md`.
- [x] 2.2 Regenerate the dependency inventory for the new workspace packages.

## 3. Verification and review

- [x] 3.1 Unit and integration tests for every requirement scenario.
- [x] 3.2 `make verify`.
- [ ] 3.3 Independent review by the assigned reviewer, recorded in `verification.md`.
