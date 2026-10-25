## 1. Module ports

- [x] 1.1 Add the `WorkflowRun` record and the SDLC `WorkflowRunRepository`, `GateRepository`, and `Outbox` ports with in-memory adapters.
- [x] 1.2 Add the Execution `TaskRepository`, `Outbox`, and `Inbox` ports and the Scheduling `AssignmentRepository` and `Outbox` ports with in-memory adapters.
- [x] 1.3 Add the shared conformance suites, including one for `AdmissionRepository`, and make the in-memory adapters pass them.

## 2. PostgreSQL adapter

- [x] 2.1 Add `@taskelith/postgres` with `pg@8.23.1` and `node-pg-migrate@9.0.0` and the initial migration.
- [x] 2.2 Add the migration runner with the checksum check.
- [x] 2.3 Add the repositories, outbox, inbox, relay, and committing facades.
- [x] 2.4 Add the SERIALIZABLE transaction with bounded retries and the crash points.
- [x] 2.5 Add integration tests: conformance, migrations, transactions, crash recovery, connection loss.

## 3. Records and verification

- [x] 3.1 Share the integration endpoint helper in `@taskelith/testing`.
- [x] 3.2 Update the dependency register and regenerate the dependency inventory.
- [x] 3.3 Run `make verify` and record the results.
- [x] 3.4 Obtain independent review (Codex CLI, `gpt-6.1-sol`, medium) and record results.
