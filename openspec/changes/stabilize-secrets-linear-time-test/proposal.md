## Why

The linear-time redaction tests of `@taskelith/secrets` failed intermittently in `make verify` on the host `hpz600`. Two saved logs show the same failure: "value redaction takes linear time on long runs" (`packages/adapters/secrets/test/secrets.test.ts:218`) failed with `"a b" repeated took 226 ms` and `"a b" repeated took 205 ms` against the 200 ms limit of `assertLinearOnRuns` (`packages/testing/src/linear-time.ts`). The redactor is linear on that run (`design.md`), but takes about 80 ms on it unloaded, so load that stretches its one wall-clock sample by 2.5 times breaks the absolute limit. The tests at `secrets.test.ts:119` and `packages/adapters/secrets/test/basic-credentials.test.ts:43` share that limit.

After the first archive, integration on a faster host (Intel i7-10700K) failed, as the coordinator reported: the helper doubled the long run to 7,680,000 and then 15,360,000 characters, where `String.prototype.replace` threw `RangeError: Maximum call stack size exceeded`, as V8's regular expression backtrack stack overflowed. The redaction rules throw so from 5,592,440 characters of `ghs_` or `tkop_` repeated and from about 2^23 characters of other units, so a log field or failure message that long made the logger and `redactFailure` throw instead of redacting (`design.md`, "Redaction past the regular expression stack").

## What Changes

- `assertLinearOnRuns` in `@taskelith/testing` no longer compares one wall-clock sample with 200 ms. It measures the CPU time of the test's thread for each unit's run and of a run of a quarter of its length, in five alternating samples each after a forced garbage collection, doubles both runs until the short median reaches 20 ms or doubling the long run would pass 2^22 characters, below the 2^23 characters where V8's regular expression stack overflows, and fails when the median time grows 2.5 or more times faster than the length, with a floor of 20 ms on both medians. It takes the run length and the timer in an optional options object, `LinearTimeOptions`, needs `process.threadCpuUsage()` (Node.js 23.9 or later) for its default timer, and exposes garbage collection only when it first times a run.
- The helper's tests drive the doubling, the floor, the limit of 2.5, and a pause in one sample with injected timer readings, check that importing the package exposes no garbage collection, and keep a quadratic redactor timed by the thread's CPU time as a mutation control.
- A new `deterministic-test-harness` requirement, "Linear-time assertions", states the rule.
- Product fix in the published `taskelith` package: `redactWith` in `@taskelith/observability`, which applies the redaction rules for the logger, `redactSecrets`, and `redactFailure`, returns `[redacted]` for the whole text when a rule throws a `RangeError`, and rethrows any other error. Redacting word by word would miss secrets that span whitespace, such as `key=value` pairs, `Authorization: Bearer`, and URL user information. Texts that do not overflow are redacted as before.
- `execution-observability`: the requirement "Logs without secrets" states linear time for any scannable text, and a new requirement, "Redaction of text of any length", states that redaction never throws on length and redacts an unscannable text whole.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: ADDED requirement "Linear-time assertions".
- `execution-observability`: MODIFIED requirement "Logs without secrets"; ADDED requirement "Redaction of text of any length".

## Impact

Test reliability of `make verify` for every caller of `assertLinearOnRuns`: the three secrets tests and the observability tests `packages/modules/observability/test/basic-credentials.test.ts` and `packages/modules/observability/test/logger.test.ts`. `@taskelith/testing` is a private workspace package. The redaction fix changes the published `taskelith` package (commit type `fix`): a log record, failure, or output text too long for V8 to scan becomes `[redacted]` instead of an exception. The calls take longer: each unit runs at least eleven times instead of once, on runs long enough for a short median of 20 ms (`design.md`, "Cost").
