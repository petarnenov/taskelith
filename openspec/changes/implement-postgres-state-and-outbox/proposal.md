## Why

G2 work item 11 ([docs/g2-plan.md](../../../docs/g2-plan.md)): PostgreSQL state and outbox, serving R05 (durable assignment). Decision D6 (a) selects SQL first with `pg@8.23.1` and `node-pg-migrate@9.0.0`. Architecture section 9 requires state and outbox records to commit atomically and persisted inbox identities on the receiving side; the launch authorization contract (sections 3 and 5) and the capacity reservation contract (section 4) require SERIALIZABLE transactions retried as a whole, and one held reservation per attempt. Before this change only `AdmissionRepository` existed, without a shared conformance suite, and no module had a port for runs, gates, tasks, assignments, an outbox, or an inbox.

## What Changes

- Module ports, in-memory adapters, and shared conformance suites (each a list of cases that returns problems, so any adapter's tests run it):
  - `@taskelith/sdlc`: a minimal `WorkflowRun` record (`id`, `binding`, `progress`, compared on the progress generation) with `beginWorkflowRun`; `WorkflowRunRepository`, `GateRepository` (gates stored per run), and `Outbox`; a suite for these and for the existing `AdmissionRepository`; and the shared conformance helpers.
  - `@taskelith/execution`: `TaskRepository` (one record per task with its attempts, executions, and grants), `Outbox`, and `Inbox` (owned by the consuming side, observations for now).
  - `@taskelith/scheduling`: `AssignmentRepository` (one held reservation per attempt) and `Outbox`.
  - The in-memory repositories check and write without awaiting, so that two concurrent compare-and-set writes cannot both succeed; this fixes `InMemoryAdmissionRepository`, whose `replace` awaited between its check and its write.
- New private adapter package `@taskelith/postgres` (`packages/adapters/postgres`):
  - versioned SQL migrations through node-pg-migrate, plus a checksum table and check that fails when an applied file changed or is missing (the gap item 1 recorded);
  - one table per aggregate with a generation column, query columns, and the record as JSON; a partial unique index for one held reservation per attempt;
  - one outbox table for every module's `Outbox` port, an inbox table keyed by consumer and message identity, and a relay that reads unpublished messages in commit order and marks them published;
  - `PostgresDatabase.transaction`: SERIALIZABLE, rerun as a whole on SQLSTATE 40001 or 40P01 up to `SERIALIZATION_ATTEMPTS` (5) with doubling backoff from `SERIALIZATION_BACKOFF_MILLISECONDS` (10), rolled back on an `Err`, and `unavailable` on lost connections, with an unknown-outcome mark for a lost COMMIT;
  - crash points `OutboxCommit`, `InboxCommit`, and `OutboxPublish`, each `.before` and `.after`, through a structural hook that the harness's `CrashPoints` satisfies and `NO_CRASH_POINTS` fills in production;
  - committing facades that run each port call as its own transaction.
- `@taskelith/testing` gains `integrationEndpoint` and `SERVICES_REMEDY` (the item 10 follow-up), used by the new tests and the Toxiproxy test.
- The dependency register records the installation, the closed checksum gap, and the evidence of the tests.

## Capabilities

### New Capabilities
- `state-persistence`: module-owned repository, outbox, and inbox ports, their in-memory adapters, and the shared conformance suites.
- `postgres-state`: the PostgreSQL adapter: migrations, compare-and-set storage, the transaction primitive, the outbox and inbox, and their crash points.

### Modified Capabilities

## Impact

New private workspace package and new module APIs; the published `taskelith` package and CLI are unchanged, and the frozen `SdlcFramework` port is untouched. `pg@8.23.1` and `node-pg-migrate@9.0.0` become runtime dependencies of `@taskelith/postgres` (owner-approved under D6 a); the dependency inventory is regenerated. Item 12 builds the publisher on the relay; items 16 to 18 write their use cases and invalidating writers inside `PostgresDatabase.transaction`.
