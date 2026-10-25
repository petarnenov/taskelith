# Verification: fix-flaky-event-loop-lag-test

## Scope and source

Assigned on 2026-10-25 by the coordinator (Niki) to the UI worker (Desi) as finding F2, a flaky test, and handed back to Niki. Base revision: `78bd9ef` on `dev`. Prepared in the git worktree `../taskelith-worktrees/fix-flaky-event-loop-lag-test` on branch `fix-flaky-event-loop-lag-test`. Scope: `packages/adapters/node-observability/src/event-loop-lag.ts` (an optional histogram argument), its `index.ts` export, the package's test file, and this change. The requirement is unchanged, so `.openspec.yaml` sets `skip_specs: true`. Commit type `test`, as the coordinator set; the package is private.

Source of the problem: "an idle window reads below the resolution" failed in 1 of 7 full `make verify` runs on Linux and once in a macOS pre-push run, and passed alone.

## Diagnosis

Environment: macOS 26 (Darwin 25.6.0, x86_64, 16 logical CPUs), Node.js v24.22.1, npm 12.2.1. Load: 32 busy-loop Node processes (`node -e 'for(;;){}'`) while the test file ran with `node --experimental-strip-types --test --experimental-test-coverage`, as `npm test` runs it.

- Unloaded, the old idle test alone: 0 failures in 20 runs. Under the load, alone and without coverage: 0 in 40.
- Under the load, the old full test file with coverage: 1 failure in 40, 1 in 60, and 1 in 200 runs (3 in 300), each time "an idle window reads below the resolution".
- Under the same load, Node's histogram at 10 ms resolution in a separate process read no 100 ms idle window at 10 ms of lag or more in 200 windows, and each window held 8 or 9 intervals.

Conclusion: the monitor reads the delay correctly. With eight or nine intervals, p99 is the largest interval, and one interval delayed by 10 ms inside the shared test process (garbage collection, coverage collection, contention) failed the test. The test assumed an idle process; the monitor is not wrong under load.

## Checks

Under the same load after the fix, the full test file with coverage: 0 failures in 200 runs and 0 in a further 600 runs (0 in 800). The file runs 12 tests, all passing. `npm run verify:comments` passed. `npm run openspec -- validate fix-flaky-event-loop-lag-test --strict` passed. Before pass 1, `make verify` passed: 915 tests, 0 failures; coverage 99.15 % lines, 91.90 % branches, 98.88 % functions; strict OpenSpec validation 53 passed, 0 failed; archive dry run and package verification passed.

## Independent review

Pending.

## Limitations

- The idle scenario now runs on recorded intervals; Node's real histogram is exercised by the blocked-loop test and by the default constructor, not by an idle window.
- The load runs were made on macOS only; the Linux failure is explained by the same mechanism, not reproduced there.

## Remaining gates

- Coordinator integration into `dev` and archive.
