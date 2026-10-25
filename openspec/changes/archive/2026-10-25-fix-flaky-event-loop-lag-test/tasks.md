## 1. Diagnose

- [x] 1.1 Reproduce the failure under load and measure real idle windows outside the test process.

## 2. Fix

- [x] 2.1 Let `EventLoopLagMonitor` take an optional `LoopDelayHistogram`, defaulting to Node's.
- [x] 2.2 Test the idle scenario with recorded intervals and add a window test; keep the blocked test on the real histogram.

## 3. Verify

- [x] 3.1 Run the test file many times under load and record the counts.
- [x] 3.2 Run `npm run openspec -- validate fix-flaky-event-loop-lag-test --strict` and `make verify`.
- [x] 3.3 Independent review and record it in `verification.md`.
