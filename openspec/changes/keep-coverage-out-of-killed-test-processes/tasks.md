## 1. Helper

- [x] 1.1 Add `uncoveredEnvironment`, `withholdCoverageFromDescendants`, and `COVERAGE_VARIABLE` to `@taskelith/testing`, with a unit test.

## 2. Call sites

- [x] 2.1 Start the killed Node children of the crash-point, lock-holder, ticker, and reaper tests with `uncoveredEnvironment()`.
- [x] 2.2 Withhold coverage in `darwin-supervisor.test.ts` and `worker-supervision.test.ts`, whose product code spawns with `process.env`.
- [x] 2.3 Refit `apps/control-plane/test/harness-composition.ts` onto the helper.

## 3. Verify

- [x] 3.1 Show that a test process that removes `NODE_V8_COVERAGE` still writes its own coverage.
- [x] 3.2 Run `npm run openspec -- validate keep-coverage-out-of-killed-test-processes --strict` and `make verify`.
- [ ] 3.3 Independent review and record it in `verification.md`.
