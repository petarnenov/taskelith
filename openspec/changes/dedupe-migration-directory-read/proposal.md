## Why

G2 item 11 (`implement-postgres-state-and-outbox`) recorded a follow-up in its verification: `packages/adapters/postgres/src/migrations.ts` reads the migrations directory twice, once in `unsupportedFiles` and once in `migrationFiles`, where one read should serve both.

## What Changes

- `migrate` reads the directory once and passes the listing to `unsupportedFiles` and `migrationFiles`; the filters, their order, and the results are unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Private workspace code only (`@taskelith/postgres`); no behavior or requirement changes, so `.openspec.yaml` sets `skip_specs: true` under the existing `state-persistence` requirements. The existing migration tests cover the behavior; no test is added.
