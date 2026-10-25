## Why

Item 16 left a follow-up: `WorkerCapacity` in the execution OpenAPI document sets no maximum, so the enrollment handler in `apps/control-plane/src/api/control-plane-api.ts` checks by hand that the slot count, CPU, and memory fit the PostgreSQL `integer` columns. The coordinator (Niki) assigned the fix on 2026-10-25.

## What Changes

- `WorkerCapacity` bounds `slots`, `cpuMillicores`, and `memoryMebibytes` to at most `2147483647` in `execution.openapi.json` and in `execution.asyncapi.json`. The package requires a schema name that several documents define to name the same schema, and the AsyncAPI document carries the same capacity in `worker.capacity.declared`.
- The breaking-change check reports both documents as breaking (`request-property-max-set` for `enrollWorker`, and the added maximums in the capacity observation), so the OpenAPI document goes from 0.2.1 to 0.3.0 and the AsyncAPI document from 0.1.0 to 0.2.0; the contract page lists the new versions and the bound.
- The enrollment handler's hand check and `MAX_CAPACITY_VALUE` are removed: the API server validates the body against the schema before the handler runs and before the enrollment token is presented, so a refusal still consumes nothing.
- A contract test checks the bound for each value in both documents.

## Capabilities

### New Capabilities

### Modified Capabilities
- `execution-wire-contracts`: adds the requirement "Declared capacity bounds".
- `control-plane-api`: the requirement "Runtime validation" gains the scenario "Enrollment capacity above the bound"; its text is unchanged.

## Impact

`packages/contracts/documents/execution.openapi.json`, `packages/contracts/documents/execution.asyncapi.json`, `apps/control-plane/src/api/control-plane-api.ts`, `packages/contracts/test/execution-contracts.test.ts`, `docs/contracts/execution-wire-contracts.md`, and the specs. The published package is not affected, so the commit type is `chore`. No new dependency.
