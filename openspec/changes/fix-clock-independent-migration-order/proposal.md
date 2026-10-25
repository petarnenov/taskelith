## Why

On macOS, `make verify` failed once and then passed on an identical rerun. The failing test was "a fixed pending migration is checked by its new content", and it reported "Not run migration 1792930000000_resource-admission is preceding already run migration 1792930400000_observability-signals". The coordinator (Niki) assigned the investigation on 2026-10-25 as a G2 maintenance task.

The cause is in the migrator. It lets node-pg-migrate 9.0.0 check the order with `checkOrder: true`. node-pg-migrate records each applied file with `run_on = NOW()`, the start of that file's transaction, and orders the applied files by `run_on, id`. A server clock that steps back between two files, as a virtual machine's clock does when it is corrected, gives the later file the earlier time. Every following run then fails. In production, this would leave the database unable to migrate until someone edits `schema_migrations` by hand.

## What Changes

- `migrate` in `packages/adapters/postgres/src/migrations.ts` passes `checkOrder: false` and checks the order itself, under the same advisory lock and before it records checksums or applies anything. A pending file that orders before the last applied file, by numeric prefix and then by name as node-pg-migrate runs them, fails with `precondition-failed` naming that file. The recorded run times are not used.
- The check for an applied migration without its file is unchanged. It already fails with `precondition-failed` naming the migration, and a new test names it explicitly.
- New integration tests cover:
  - an interrupted run during which the clock stepped back;
  - a database whose applied migrations are out of run order;
  - a pending file older than an applied one;
  - ordering by numeric prefix;
  - an applied migration without its file.

## Capabilities

### New Capabilities

### Modified Capabilities
- `postgres-state`: adds the requirement "Clock-independent migration order". The existing requirement "Migrations with checksums" does not state the order guarantee, so this change adds it as a new requirement rather than modifying that one.

## Impact

`packages/adapters/postgres/src/migrations.ts`, `packages/adapters/postgres/test/migrations.integration.test.ts`, and the spec. `@taskelith/postgres` is a private workspace package, so the commit type is `chore`. No new dependency.
