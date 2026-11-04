## Context

`assertLinearOnRuns` (`packages/testing/src/linear-time.ts` at base `1ef0cb42`) repeated each unit to a run of 60000 characters, or the given length, timed one call of the transform with `performance.now()`, and failed when that one wall-clock sample reached 200 ms. Its callers are the secrets tests `packages/adapters/secrets/test/secrets.test.ts:119` and `:218` and `packages/adapters/secrets/test/basic-credentials.test.ts:43`, and the observability tests `packages/modules/observability/test/basic-credentials.test.ts:56` and `packages/modules/observability/test/logger.test.ts:159`.

## Diagnosis

The cause is the test, not the product.

- The saved `make verify` logs that the brief names show two failures, both of `secrets.test.ts:218`, both on the unit `"a b"` of `redactSecrets(text, ['a'.repeat(64), 'b'])`: `"a b" repeated took 226 ms` and `"a b" repeated took 205 ms` (`verification.md`, "Diagnosis"). No log shows `:119` or `basic-credentials.test.ts:43` failing.
- The redactor is linear on that run: its median wall time over five calls grew from 20.2 ms at 15000 characters to 39.3, 82.8, 160.8, and 326.7 ms at 30000, 60000, 120000, and 240000, doubling with the length. All 29 units of the three tests grew at most 1.08 times as fast as the length from a quarter run to a full one.
- At about 80 ms unloaded, that run has 2.5 times headroom under the 200 ms limit, which a loaded host takes away: the old tests failed 2 of 10 runs under 8 busy loops, both on `"a b"`, with 202 and 232 ms.

## Goals / Non-Goals

Keep the assertion able to find superlinear redaction while load, a garbage collection, or a late compilation cannot fail a linear one. No product code change; no retries; no change to the callers.

## Decisions

- **Growth, not an absolute limit (the coordinator's option A).** The helper times each unit's run and a run of a quarter of its length and fails when the time ratio divided by the length ratio reaches 2.5. A linear transform gives about 1 and a quadratic one about 4, so the limit sits between them with room on both sides.
- **Medians of alternating samples.** Five short and five long samples alternate after one warm-up call on the short run, and the medians are compared, so a pause in one or two samples of a run is left out.
- **A forced collection before each sample.** `node --test` starts each test file without `--expose-gc`, and the runner's configuration in `package.json` stays as it is: the helper sets the flag with `v8.setFlagsFromString('--expose-gc')` and takes `gc` from a fresh context, `vm.runInNewContext('gc')`, where V8 installs it once the flag is set. The helper is test-only, so the flag reaches only test processes.
- **The thread's CPU time instead of wall time.** Medians of wall time were not enough: under 8 busy loops a short sample of about 28 ms was often preempted for a whole scheduler slice, about doubling it, and 2 of 10 runs of the quadratic mutation control passed the assertion they should fail (`verification.md`, "Rejected measurements"). The process's CPU time, `process.cpuUsage()`, also counts the helper threads that work after each forced collection, which added about 4 to 8 ms to each short sample of the control (32 to 36 ms against 26 to 30 ms) and lowered its growth to 3.0 in one run. The main thread's CPU time, `process.threadCpuUsage()` (Node.js 23.9 and later; the repository pins 24.22.1), leaves out both: under 8 busy loops the control's samples stayed at 28 to 29 ms and 442 to 446 ms.
- **A floor of 20 ms.** Medians below 20 ms count as 20 ms, because accounting granularity and compilation make a ratio of such small times noise. A long run under 4 x 2.5 x 20 = 200 ms of CPU time therefore always passes, the same bound the old wall-clock limit set, and a quadratic run above it fails; at 60000 characters a quadratic redactor takes seconds.
- **Option B, counting steps, is not taken.** The redactors do not expose their work, and counting it would need product hooks.
- **Cost.** Each unit now runs eleven times, and each sample collects garbage first, so over 15 unloaded runs the three secrets tests took a median of 0.33, 2.24, and 1.65 s, against 0.015, 0.13, and 0.51 s in a saved `make verify` log (`verification.md`, "Diagnosis").
- **The requirement.** No requirement stated how timing assertions judge linearity, so `deterministic-test-harness` gets the ADDED requirement "Linear-time assertions".
