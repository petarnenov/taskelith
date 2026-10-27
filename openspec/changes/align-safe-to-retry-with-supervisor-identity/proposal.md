## Why

Supervisor identity contract section 6 says that an exit with an unknown status ends the execution while the attempt's outcome stays unknown: side effects may have happened, and automatic retry stays within the retry budget of `0` for uncertain execution ([operational targets](../../../docs/operational-targets.md)). Capacity reservation contract section 13, bullet "Automatic retries", gave an automatic retry its allowance after any `exited` outcome with a proven start, an unknown status included ("until then a proven exit counts as safe"), and so did the `resource-admission` requirement "Quotas and budgets" and `isSafeToRetry` in `packages/modules/scheduling/src/application/capacity-operations.ts`. The two contracts contradicted each other. `stop-automatic-retry-of-unknown-exit` (defect L1) stopped opening such a retry, so the check is no longer reached for one in practice, and recorded this alignment as its follow-up.

## What Changes

- **Contract.** Capacity reservation contract section 13, bullet "Automatic retries": an earlier `exited` attempt is certain only with a proven start and a known status (an exit code or a signal); one with an unknown status is uncertain, citing supervisor identity contract section 6, and gets `retry-budget-exhausted`.
- **Spec.** The `resource-admission` requirement "Quotas and budgets" gives no allowance after an exit without a known status, and gains the scenario "Retry of an unknown exit".
- **Code.** `isSafeToRetry` uses `endedWithoutUncertainty` of `packages/modules/scheduling/src/domain/automatic-retry.ts`, which shares one exhaustive `ExitStatus` classification (`exitVerdict`) with `automaticRetryOf`.
- **Tests.** A scheduling unit test places an automatic retry through `placeInTransaction` over in-memory adapters after a proven exit with a known and with an unknown status.

No schema, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `resource-admission`: requirement "Quotas and budgets".

## Impact

- `docs/contracts/capacity-reservation.md` section 13.
- `packages/modules/scheduling/src/domain/automatic-retry.ts` and `packages/modules/scheduling/src/application/capacity-operations.ts`.
- `packages/modules/scheduling/test/automatic-retry-placement.test.ts`.
