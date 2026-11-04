## Why

The linear-time redaction tests of `@taskelith/secrets` failed intermittently in `make verify` on the host `hpz600`. Two saved logs show the same failure: "value redaction takes linear time on long runs" (`packages/adapters/secrets/test/secrets.test.ts:218`) failed with `"a b" repeated took 226 ms` and `"a b" repeated took 205 ms` against the 200 ms limit of `assertLinearOnRuns` (`packages/testing/src/linear-time.ts`). The redactor is linear on that run (`design.md`), but takes about 80 ms on it unloaded, so load that stretches its one wall-clock sample by 2.5 times breaks the absolute limit. The tests at `secrets.test.ts:119` and `packages/adapters/secrets/test/basic-credentials.test.ts:43` share that limit.

## What Changes

- `assertLinearOnRuns` in `@taskelith/testing` no longer compares one wall-clock sample with 200 ms. It measures the CPU time of the test's thread for each unit's run and of a run of a quarter of its length, in five alternating samples each after a forced garbage collection, and fails when the median time grows 2.5 or more times faster than the length, with a floor of 20 ms on both medians.
- The helper's tests cover a short and a long run of every unit, a pause in one sample, and a quadratic redactor as a mutation control.
- A new `deterministic-test-harness` requirement, "Linear-time assertions", states the rule. No product code changes: the published `taskelith` package and the redactor are unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: ADDED requirement "Linear-time assertions".

## Impact

Test reliability of `make verify` for every caller of `assertLinearOnRuns`: the three secrets tests and the observability tests `packages/modules/observability/test/basic-credentials.test.ts` and `packages/modules/observability/test/logger.test.ts`. `@taskelith/testing` is a private workspace package. The calls take longer: each unit runs eleven times instead of once (`design.md`).
