## Why

The worker capacity bound change (`bound-worker-capacity-schema`) left a follow-up: `ResourceRequest` in the execution AsyncAPI document sets no maximum, although the requested CPU and memory are stored in the PostgreSQL `integer` columns of the reservation tables. The coordinator (Niki) assigned the fix on 2026-10-25 as a G2 follow-up.

## What Changes

- `ResourceRequest` bounds `cpuMillicores` and `memoryMebibytes` to at most `2147483647` in `execution.asyncapi.json`, the only document that defines it. The execution OpenAPI document carries no `ResourceRequest` and no other schema of that name.
- The breaking-change check reports the AsyncAPI document as breaking (an added maximum in the sent `execution.assignment.offer` command), so the document goes from 0.2.0 to 0.3.0; the contract page lists the new version and the bound.
- A contract test checks the bound for both values in the assignment offer.
- No hand check is removed: no code checks these values against the integer bound. `parseResourceRequest` checks only that they are positive integers, and the per-attempt ceiling (`2 vCPU`, `4 GiB`) is a capacity rule with its own rejection reason.

## Capabilities

### New Capabilities

### Modified Capabilities
- `execution-wire-contracts`: adds the requirement "Requested resource bounds".

## Impact

`packages/contracts/documents/execution.asyncapi.json`, `packages/contracts/test/execution-contracts.test.ts`, `docs/contracts/execution-wire-contracts.md`, and the spec. The published package is not affected, so the commit type is `chore`. No new dependency.
