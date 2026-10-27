# Verification: keep-coverage-out-of-killed-test-processes

## Scope and source

Assigned on 2026-10-27 by the coordinator session, option A of its diagnosis. Source: on a loaded 2020 Intel iMac, `npm test` once exited 1 with every test passing, because the coverage summary threw `ERR_OPERATION_FAILED` ("coverage file is empty") on a 0-byte `coverage-<pid>-<timestamp>-<thread>.json` that a Node child killed while exiting had left in the runner's `NODE_V8_COVERAGE` directory. Base revision: `656a34d` on `dev`. Prepared in the git worktree `../taskelith-worktrees/keep-coverage-out-of-killed-test-processes` on branch `keep-coverage-out-of-killed-test-processes`; code commits `2079c3f` and `d2d2e5f`, change files `3c30662`. `origin/dev` at `5c60c15` was merged in as `85548f3` without conflicts; it brings the review findings record, so the change has an empty `findings.jsonl`, as worker step 2 requires.

Scope: the helper module `packages/testing/src/coverage-environment.ts` with its export and unit test, the tests that start Node processes they or the product code they drive may kill, the refit of `apps/control-plane/test/harness-composition.ts`, and this change with an ADDED requirement in `deterministic-test-harness`. No product code changes. Worker-runtime and worker launch files were out of scope and are untouched; none of the listed call sites lives in them. Commit type `test`; the packages are private.

## Environment

MacBook Air, macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1, Docker services as `make verify` starts them. This is not the iMac on which the failure occurred; the failure was not reproduced as such, since it needs a kill that lands during the exit write.

## Author self-check

- Against the requirement "Coverage kept out of killed processes": `uncoveredEnvironment()` passes no `NODE_V8_COVERAGE` to a child, `withholdCoverageFromDescendants()` withholds it from everything a test process starts, every killed Node child of the touched tests is started with one of them, and the test processes keep their own coverage (evidence below).
- Against the brief: the darwin product-spawn paths (`runSupervisorProgram` through `NodeSpawner`, `startDetachedSupervisor`) are handled from the test side by withholding coverage for the test file, with no product change. Children that exit normally keep inheriting the variable.
- Finding beyond the brief: leaving the key out of an `env` option does not keep the directory from the child. Node's `normalizeSpawnArguments` copies `NODE_V8_COVERAGE` from `process.env` into an `env` option without an own key of that name. So the first helper, which omitted the key, failed its own unit test under `make verify`, and the destructuring of `40aab95` in `harness-composition.ts` never took effect. The helper now keeps the key with the value `undefined`, which `spawn` skips.
- Evidence check: no external link; the results below come from the commands listed.

## Checks

- Spawn propagation (scratch test `spawn.test.mjs` under the session scratchpad, not committed), run with `node --test --experimental-test-coverage`: a child started with an `env` that omits the key printed the runner's `node-coverage-*` directory, one whose key is `undefined` printed `null`, and one whose key is `''` printed `""`.
- Caveat, own coverage after removal (scratch test `own.test.mjs`, not committed): the test file deletes `process.env.NODE_V8_COVERAGE` at load and then imports `lib.mjs`; under `node --test --experimental-test-coverage` the report lists `lib.mjs` with 100 % lines, 66.67 % branches, and 100 % functions, and the lcov shows the taken branch hit and the other at 0, so the process wrote its own coverage file; a child it spawned printed `unset`.
- Caveat in this repository: `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/*/*/dist/**/*.js' packages/adapters/worker-supervisor/test/darwin-supervisor.test.ts` passed 11 of 11 tests and reported `supervisor-program.js` at 93.59 % lines and `node-spawner.js` at 69.23 % lines, which only the withholding test process itself can have covered.
- Coverage files per test file: each file run as `NODE_V8_COVERAGE=<fresh directory> node --experimental-strip-types <file>`, counting the files written, with the test files of `656a34d` (before) and of `d2d2e5f` (after). All runs exited 0, and no file was empty.

  | Test file | Before | After |
  | --- | --- | --- |
  | `worker-supervisor/test/darwin-supervisor.test.ts` | 18 | 1 |
  | `worker-supervisor/test/worker-supervision.test.ts` | 2 | 1 |
  | `worker-supervisor/test/process-reaper.test.ts` | 1 | 1 |
  | `worker-supervisor/test/file-adapters.test.ts` | 1 | 1 |
  | `worker-journal/test/journal-crash.test.ts` | 16 | 1 |
  | `worker-journal/test/worker-root.test.ts` | 1 | 1 |
  | `testing/test/crash-points.test.ts` | 3 | 1 |
  | `testing/test/process-lock.test.ts` | 1 | 1 |
  | `testing/test/scenario-process.test.ts` | 3 | 3 |

  The remaining files of `scenario-process.test.ts` come from its two children that exit normally, which keep coverage by design. Files that wrote 1 before had killed children that died before their exit hook.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate keep-coverage-out-of-killed-test-processes --strict`: valid.
- First `make verify` on `2079c3f`: failed, 1976 tests, 1 failed (`an uncovered environment derives from this process by default`), which exposed the spawn propagation above.
- `make verify` on `d2d2e5f` with this change's files: exit 0; 1976 tests, 1974 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.93 % branches, 98.96 % functions; `coverage-environment.js` 100 % on all three; strict OpenSpec validation 70 passed, 0 failed; archive dry run, contract compatibility, dependency inventory, and package verification passed.
- `npm run verify:findings`: every findings file is valid, 2 files.
- `make verify` after the merge `85548f3`, with the empty `findings.jsonl` and the `tasks.md` wording for it: exit 0; 2009 tests, 2007 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 91.95 % branches, 98.96 % functions; findings validation, strict OpenSpec validation (70 passed, 0 failed), archive dry run, dependency inventory check, and package verification passed. The only later edit before review is this record.

## Independent review

Pending.

## Limitations

- The failure was seen once on the iMac and was not reproduced here; the fix removes its precondition, a killed Node child that writes into the runner's coverage directory, which the counts above show for the touched test files.
- Killed children no longer add coverage; totals dropped slightly against recent runs on `dev` (for example 99.28 % lines, 92.07 % branches, 99.04 % functions in the record of `stabilize-observability-lag-test`) and stay well above 75 %.
- The NATS and PostgreSQL recovery integration tests and `harness-composition.ts` were not counted file by file; they ran green inside `make verify`.
- The coordinator's integration runs `make verify` on the merged state on the 2020 Intel iMac (Desi host); this record has only the macOS arm64 run.

## Remaining gates

- Independent review by the assigned reviewer, recorded here.
- Integration into dev by the coordinator (single pull request).
