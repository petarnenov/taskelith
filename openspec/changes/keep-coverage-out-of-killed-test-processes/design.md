## Context

Node's test runner sets `NODE_V8_COVERAGE` to a fresh temporary directory (`lib/internal/test_runner/coverage.js`), and each test file runs in its own child process that inherits it. Every Node descendant does too, and writes its coverage file in an exit hook with a truncating open followed by a write. A `SIGKILL` between the two leaves an empty file, and the runner's summary then fails the run with `ERR_OPERATION_FAILED`. Commit `40aab95` left the variable out of the composed worker's environment in `apps/control-plane/test/harness-composition.ts`, which, as below, did not keep it from the child.

## Goals / Non-Goals

Keep the coverage directory out of every Node process that a test, or product code under test, may kill, with one shared helper. Keep each test process's own coverage. Do not change product code or the coverage gate. Worker-runtime and worker launch tests are out of scope of this change, and so are kills that only a timeout guard against a hung process sends: they fire only when a test already fails.

## Decisions

- **One helper module in `@taskelith/testing`.** `uncoveredEnvironment(base = process.env)` is a query that returns a copy whose variable is `undefined`; tests pass it as `env` when they start a process. `COVERAGE_VARIABLE` names the variable once.
- **Keep the key, set it to `undefined`.** Node's `normalizeSpawnArguments` copies `NODE_V8_COVERAGE` from `process.env` into an `env` option that has no own key of that name, so that coverage reaches children started with a filtered environment; it skips variables whose value is `undefined`. An environment that omits the key, as `40aab95` built, therefore still passes the directory on; one whose key is `undefined` does not. An empty string would also disable coverage but would still reach the child.
- **Withhold for whole files where product code spawns.** `startDetachedSupervisor`, `runSupervisorProgram` through `NodeSpawner`, and `NodeSpawner` itself spawn without an `env` option, so their children copy `process.env`. Adding an environment parameter to product code only for tests would widen its API, so `darwin-supervisor.test.ts`, `worker-supervision.test.ts`, and `linux-cgroup.privileged.ts` call `withholdCoverageFromDescendants()` once at module load. The last runs only in the privileged container of `make verify-linux-cgroup`, without coverage today; the call keeps it consistent with the macOS file and safe if coverage is added. The supervisor scenario processes that `darwin-supervisor.test.ts` starts copy the withheld `process.env` too, so their children are covered by the same call.
- **Own coverage is unaffected.** Node reads `NODE_V8_COVERAGE` when the profiler starts at bootstrap and keeps the directory; a later removal from `process.env` only changes what children inherit. The verification record holds the experiment that shows this.
- **Scope of the loss.** The processes that a test kills, the other runs it starts through the same helper call, such as the unarmed runs of the crash-point tests, and every process of a withholding file lose coverage. Other children, such as the child of `scenario-process.test.ts` that handles `SIGTERM` and exits, keep inheriting the variable, because a normal exit completes the write.

## Risks / Trade-offs

These children no longer add coverage of the product modules they load; those modules are also loaded by the test processes, and the run's totals stay above the 75% threshold (see `verification.md`). A test that starts a new killable child must remember the helper; the requirement names that obligation.
