## Why

Supervisor identity contract section 6 says that an exit with an unknown status ends the execution while the attempt's outcome stays unknown: side effects may have happened, and automatic retry stays within the retry budget of `0` for uncertain execution ([operational targets](../../../docs/operational-targets.md)). `automaticRetryOf` in `packages/modules/scheduling/src/domain/automatic-retry.ts` opened a retry for every `exited` outcome with a proven start that was not exit code 0, so an unknown exit after a proven start was retried. The Linux crash window CP9 showed it as candidate defect L1 of `run-g2-crash-windows-on-linux`, where the scenario expected the failure. It blocks G2.

## What Changes

- **Spec.** The `observation-consumption` requirement "Automatic retry" names the retryable exits as those with a status that is a signal or an exit code other than 0, states that an exit with an unknown status opens no retry, and gains the scenario "Unknown exit after a proven start". Its text before said "a status other than exit code 0", which included the unknown status.
- **Code.** `automaticRetryOf` retries an exit after a proven start only when its status is a signal or an exit code other than 0.
- **Tests.** A scheduling unit test covers the unknown exit. The Linux CP9 crash window no longer expects the L1 failure, and the known-defect support of the crash window test, used only by L1, is removed.

No contract, schema, wire message, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observation-consumption`: requirement "Automatic retry".

## Impact

- `packages/modules/scheduling/src/domain/automatic-retry.ts` and `packages/modules/scheduling/test/placement.test.ts`.
- `apps/control-plane/test/crash-windows.integration.test.ts`.
- Out of scope: the retry allowance check `isSafeToRetry` of `packages/modules/scheduling/src/application/capacity-operations.ts`, which follows capacity reservation contract section 13 and the `resource-admission` requirement; the follow-up change `align-safe-to-retry-with-supervisor-identity` aligns them (design, open question).
