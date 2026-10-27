## Why

`npm test` runs `node --test --experimental-test-coverage`. The runner creates a temporary `node-coverage-*` directory and sets `NODE_V8_COVERAGE` to it, and every descendant process inherits the variable. Each Node process with it writes `coverage-<pid>-<timestamp>-<thread>.json` at exit, by opening the file with truncation and then writing it, which is not atomic. A test that kills a Node child with `SIGKILL` while the child is exiting can leave a 0-byte file. After the run, the coverage summary then throws `ERR_OPERATION_FAILED` ("coverage file is empty"), and the run exits 1 although every test passed. This was seen once on a loaded 2020 Intel iMac. `40aab95` meant to fix the same failure for the composed worker of `apps/control-plane/test/harness-composition.ts` by leaving the variable out of that child's environment. That does not work: Node's `spawn` copies `NODE_V8_COVERAGE` from the parent's `process.env` into any `env` option that lacks the key, so the child still inherited it.

## What Changes

- `@taskelith/testing` exports `uncoveredEnvironment(base = process.env)`, a copy of an environment whose `NODE_V8_COVERAGE` key is present and `undefined`, which `spawn` neither copies back nor passes on, `withholdCoverageFromDescendants()`, which removes the variable from the test process's own `process.env`, and `COVERAGE_VARIABLE`.
- Tests that start a Node process they kill as part of the test pass `uncoveredEnvironment()`: the crash-point tests (`crash-points.test.ts`, `journal-crash.test.ts`, the NATS and PostgreSQL recovery integration tests), the killed holders and tickers (`process-lock.test.ts`, `scenario-process.test.ts`, `worker-root.test.ts`, `file-adapters.test.ts`), the processes of `process-reaper.test.ts`, and the archive check of `test/check-archive-dry-run.test.ts`, which forwards a `SIGTERM` to its `openspec` Node child.
- `darwin-supervisor.test.ts`, `worker-supervision.test.ts`, and `linux-cgroup.privileged.ts` drive product code that spawns with a copy of `process.env` and has no environment parameter, so they withhold coverage for the whole test file.
- `harness-composition.ts` uses the helper instead of its own destructuring, which makes the fix of `40aab95` effective.
- No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: adds the requirement "Coverage kept out of killed processes".

## Impact

Test reliability of `make verify`. Only private workspace packages and tests change. Killed children no longer contribute coverage; the test processes keep theirs.
