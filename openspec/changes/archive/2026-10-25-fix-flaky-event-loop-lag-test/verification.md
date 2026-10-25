# Verification: fix-flaky-event-loop-lag-test

## Scope and source

Assigned on 2026-10-25 by the coordinator (Niki) to the UI worker (Desi) as finding F2, a flaky test, and handed back to Niki. Base revision: `78bd9ef` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-flaky-event-loop-lag-test` on branch `fix-flaky-event-loop-lag-test`. Scope: `packages/adapters/node-observability/src/event-loop-lag.ts` (an optional histogram argument), its `index.ts` export, the package's test file, and this change. The requirement is unchanged, so `.openspec.yaml` sets `skip_specs: true`. Commit type `test`, as the coordinator set; the package is private.

Source of the problem: "an idle window reads below the resolution" failed in 1 of 7 full `make verify` runs on Linux and once in a macOS pre-push run, and passed alone.

## Author self-check before review

- Against the requirement "Event-loop lag and JSON lines": the blocked scenario still runs on Node's real histogram and asserts at least 30 ms; the idle scenario asserts a lag below the resolution from idle intervals; the new window test covers "each sample window".
- Against the coordinator's scope: the monitor's behavior and default are unchanged (`apps/control-plane/src/composition/control-plane.ts` still calls `new EventLoopLagMonitor()`), and the diagnosis found the monitor correct under load, so nothing is reported against it.
- Evidence check: no external link; the counts below come from the commands listed under "Commands".

## Commands

- Load: 32 busy loops, `for i in $(seq 1 32); do node -e 'for(;;){}' & done`, stopped after each series.
- One run of the test file, as `npm test` runs it: `node --experimental-strip-types --test --experimental-test-coverage packages/adapters/node-observability/test/node-observability.test.ts`, repeated N times and counting non-zero exits and the failing test names.
- The old test was run from a temporary copy of `origin/dev`'s test file (`git show origin/dev:<path> > test/baseline.tmp.test.ts`), deleted after the series.
- Histogram probe outside the test process: a script that creates `monitorEventLoopDelay({ resolution: 10 })` 200 times, waits 100 ms with each enabled, and counts the windows whose p99 less 10 ms is at least 10 ms, together with the intervals per window.

## Diagnosis

Environment: macOS 26 (Darwin 25.6.0, x86_64, 16 logical CPUs), Node.js v24.22.1, npm 12.2.1. Load: 32 busy-loop Node processes (`node -e 'for(;;){}'`) while the test file ran with `node --experimental-strip-types --test --experimental-test-coverage`, as `npm test` runs it.

- Unloaded, the old idle test alone: 0 failures in 20 runs. Under the load, alone and without coverage: 0 in 40.
- Under the load, the old full test file with coverage: 1 failure in 40, 1 in 60, and 1 in 200 runs (3 in 300), each time "an idle window reads below the resolution".
- Under the same load, Node's histogram at 10 ms resolution in a separate process read no 100 ms idle window at 10 ms of lag or more in 200 windows, and each window held 8 or 9 intervals.

Conclusion: the monitor reads the delay correctly. With eight or nine intervals, p99 is the largest interval, and one interval delayed by 10 ms inside the shared test process (garbage collection, coverage collection, contention) failed the test. The test assumed an idle process; the monitor is not wrong under load.

## Checks

Under the same load after the first fix, the full test file with coverage: 0 failures in 200 runs and 0 in a further 600 runs (0 in 800). After the pass-1 fixes: 0 failures in 400 runs. After the pass-2 fix: 0 failures in 200 runs. In total, 0 failures in 1,400 runs after the fix, against 3 in 300 before it under the same load. The file runs 12 tests, all passing. `npm run verify:comments` passed. `npm run openspec -- validate fix-flaky-event-loop-lag-test --strict` passed. Before pass 1, `make verify` passed: 915 tests, 0 failures; coverage 99.15 % lines, 91.90 % branches, 98.88 % functions; strict OpenSpec validation 53 passed, 0 failed; archive dry run and package verification passed. After the pass-1 fixes, `make verify` passed again: 915 tests, 0 failures; coverage 99.15 % lines, 91.89 % branches, 98.88 % functions; 53 strict validations.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a173c6-8da3-7132-8c71-f716f2cdf997`, head `4a53a33`.** The header confirmed Codex v0.164.0, the model, reasoning effort medium, and the read-only sandbox; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `f5818ba40cc02676add9dc26d66b3ece597d69934fe01dc7fc765551cdec8139` before and after the pass. The reviewer confirmed that production behavior and the control-plane caller are unchanged, the `test` type, and `skip_specs`, and ran the file (12 of 12 passed). Findings: 0 Critical, 0 High, 2 Medium, 1 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the test's own histogram returned exact values, while Node's HDR histogram rounds to bucket boundaries, so the exact assertions did not match Node. The test now records the intervals into Node's `createHistogram()` and asserts within its 0.1 % precision.
  2. Medium: the blocked-loop test's upper bound of 5 s could fail on a long process pause with a correct monitor. It is now a finiteness check, and the proposal and design say so.
  3. Low: no self-check, evidence check, or commands before pass 1. They are recorded above.
- **Pass 2 — session `01a173d1-47c5-71f0-867e-652e46e5180f`, head `e9d5f68`.** The header confirmed Codex v0.164.0, the model, reasoning effort medium, and the read-only sandbox; the snapshot was `b80ac4b84b15ff6b9a810e53751bf0e374978c591404f8a276cfcfcae03e50d1` before and after the pass. The reviewer confirmed the three pass-1 resolutions and reviewed the whole change again. Findings: 0 Critical, 0 High, 0 Medium, 1 Low. Because the pass found only a Low finding, it was fixed without another review pass, as the review process allows; this fix is unreviewed:
  1. Low: the shared tolerance of 100 µs was looser than the stated 0.1 % precision. The tolerance is now 0.1 % of each asserted interval (10.6 µs for the idle window's 10.6 ms, 75 µs for the blocked window's 75 ms); the reviewer measured Node's deviations at 0.447 µs and 38.719 µs.

## Limitations

- The idle scenario now runs on recorded intervals; Node's real histogram is exercised by the blocked-loop test and by the default constructor, not by an idle window.
- The load runs were made on macOS only; the Linux failure is explained by the same mechanism, not reproduced there.

## Remaining gates

- Coordinator integration into `dev` and archive.
