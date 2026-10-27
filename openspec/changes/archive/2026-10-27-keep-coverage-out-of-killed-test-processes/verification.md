# Verification: keep-coverage-out-of-killed-test-processes

## Scope and source

Assigned on 2026-10-27 by the coordinator session, option A of its diagnosis. Source: on a loaded 2020 Intel iMac, `npm test` once exited 1 with every test passing, because the coverage summary threw `ERR_OPERATION_FAILED` ("coverage file is empty") on a 0-byte `coverage-<pid>-<timestamp>-<thread>.json` that a Node child killed while exiting had left in the runner's `NODE_V8_COVERAGE` directory. Base revision: `656a34d` on `dev`. Prepared in the git worktree `../taskelith-worktrees/keep-coverage-out-of-killed-test-processes` on branch `keep-coverage-out-of-killed-test-processes`; code commits `2079c3f` and `d2d2e5f`, change files `3c30662`. `origin/dev` at `5c60c15` was merged in as `85548f3` without conflicts; it brings the review findings record, so `fc2f30d` added an empty `findings.jsonl`, as worker step 2 requires, and recorded the merge here. The fixes of review pass 1 are `ea33df9` (tests) and `01f5afd` (documents); the unreviewed fixes after review pass 2 are `4e4f7d6` (test) and the commit that records pass 2 (documents).

Scope: the helper module `packages/testing/src/coverage-environment.ts` with its export and unit test, the tests that start Node processes that they or the product code they drive kill as part of the test, the refit of `apps/control-plane/test/harness-composition.ts`, and this change with an ADDED requirement in `deterministic-test-harness`. No product code changes. Worker-runtime and worker launch files were out of scope and are untouched; none of the listed call sites lives in them. Commit type `test`; the packages are private.

## Environment

MacBook Air, macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1, Docker services as `make verify` starts them. This is not the iMac on which the failure occurred; the failure was not reproduced as such, since it needs a kill that lands during the exit write.

## Author self-check

- Against the requirement "Coverage kept out of killed processes": `uncoveredEnvironment()` passes no `NODE_V8_COVERAGE` to a child, `withholdCoverageFromDescendants()` withholds it from everything a test process starts, every killed Node child of the touched tests is started with one of them, and the test processes keep their own coverage (evidence below).
- Against the brief: the product-spawn paths (`runSupervisorProgram` through `NodeSpawner`, `startDetachedSupervisor`) are handled from the test side by withholding coverage for the whole test file in `darwin-supervisor.test.ts`, `worker-supervision.test.ts`, and `linux-cgroup.privileged.ts`, with no product change. Coverage is lost by the processes a test kills, by the other runs it starts through the same helper call, such as the unarmed crash-point runs and the archive check runs, and by every process of a withholding file; other children keep inheriting the variable.
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
  | `test/check-archive-dry-run.test.ts` (pass 1, `ea33df9` against `fc2f30d`) | 14 | 4 |

  The remaining files of `scenario-process.test.ts` come from its two children that exit normally, which keep coverage by design; those of `check-archive-dry-run.test.ts` are the test process's own and three of its `runCommand` children, started with `process.env`, that exit by themselves, one after handling `SIGTERM`; no run of the check writes coverage any more. Files that wrote 1 before had killed children that died before their exit hook.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate keep-coverage-out-of-killed-test-processes --strict`: valid.
- First `make verify` on `2079c3f`: failed, 1976 tests, 1 failed (`an uncovered environment derives from this process by default`), which exposed the spawn propagation above.
- `make verify` on `d2d2e5f` with this change's files: exit 0; 1976 tests, 1974 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.93 % branches, 98.96 % functions; `coverage-environment.js` 100 % on all three; strict OpenSpec validation 70 passed, 0 failed; archive dry run, contract compatibility, dependency inventory, and package verification passed.
- `npm run verify:findings`: every findings file is valid, 2 files.
- `make verify` after the merge `85548f3`, with the empty `findings.jsonl` and the `tasks.md` wording for it: exit 0; 2009 tests, 2007 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 91.95 % branches, 98.96 % functions; findings validation, strict OpenSpec validation (70 passed, 0 failed), archive dry run, dependency inventory check, and package verification passed.
- `make verify` after the fixes of review pass 1 (`ea33df9` with the updated change files): exit 0; 2010 tests, 2008 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.96 % branches, 98.96 % functions; findings validation (8 lines of this change), strict OpenSpec validation (70 passed, 0 failed), archive dry run, dependency inventory check, and package verification passed.
- `make verify-linux-cgroup` on `4e4f7d6` (the privileged Linux container, without coverage): exit 0 in 16 s; `linux-cgroup.privileged.ts` 14 tests, 14 passed, 0 failed.
- `make verify` after the unreviewed fixes of review pass 2 (`4e4f7d6` with the updated change files): exit 0; 2010 tests, 2008 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.95 % branches, 98.96 % functions; findings validation (13 lines of this change), strict OpenSpec validation (70 passed, 0 failed), archive dry run, dependency inventory check, and package verification passed.

## Independent review

- **Pass 1 — Claude Code, model `claude-opus-5-5`, effort high, permission mode plan, editing tools disallowed, session `fabc1ad3-37f8-4a16-9b34-37b8e917edbf`, reviewed head `fc2f30d` (diff `5c60c15..fc2f30d`), run by the coordinator, 72 s.** Invocation: `claude -p "$(cat prompt-1.md)" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`. The JSON `modelUsage` confirmed `claude-opus-5-5`; the SHA-256 tree snapshot was `a1d9dbc501ae080865b4e632509d7b1e177bbb427f601c693d1e2f09cd531851` before and after the pass. The reviewer, writing in Bulgarian (paraphrased here), confirmed the `spawn` propagation against the Node v24 source, that the test process keeps its own coverage, that the default process isolation keeps the withholding to one file, and that the 13 call sites are justified. Findings: 0 Critical, 0 High, 1 Medium, 7 Low. All were resolved, and review pass 2 confirmed the resolutions.
  1. Medium (`test/check-archive-dry-run.test.ts:102`): the `SIGTERM` test starts the archive check with the coverage directory, and the check forwards the signal to its `openspec` Node child. Accepted: `runCheck` passes `uncoveredEnvironment()`; the proposal and the table above name the site (14 coverage files before, 4 after).
  2. Low (`packages/adapters/worker-supervisor/test/linux-cgroup.privileged.ts:83`): the Linux counterpart starts and kills supervisors with `process.env`. Accepted: it withholds coverage at module load like the macOS file; `design.md` notes that it runs without coverage today.
  3. Low (spec delta): "may kill" also covered timeout guards against hung processes. Accepted: the requirement now says "kills as part of the test", and `design.md` puts timeout guards out of scope.
  4. Low (`design.md`): "Apply only to killed Node children" was inaccurate, since unarmed runs and every child of a withholding file lose coverage too. Accepted: the decision is now "Scope of the loss", and the risk names these children.
  5. Low (`packages/testing/test/coverage-environment.test.ts`): no automated proof that an uncovered child writes no coverage file. Accepted: a new test starts a child with `uncoveredEnvironment(base)` for a fresh directory and finds it empty, then starts one with the directory and finds one file.
  6. Low (`packages/testing/test/coverage-environment.test.ts:35`): the default-base assertion sat in the spawn test. Accepted: it moved to the first test, whose name now states it.
  7. Low (`packages/testing/src/coverage-environment.ts:1`): the module rationale read as the constant's comment and said "A node". Accepted: the comment now sits on `uncoveredEnvironment` and says "A Node process".
  8. Low (`verification.md`): `fc2f30d` was not named. Accepted: the scope paragraph names it.

- **Pass 2 — Claude Code, model `claude-opus-5-5`, effort high, permission mode plan, editing tools disallowed, session `686cd9f3-20cf-4c1a-a485-97146a55ded0`, reviewed head `01f5afd` (diff `5c60c15..01f5afd`), run by the coordinator, 190 s.** Invocation as in pass 1, with `prompt-2.md`: the pass-1 prompt, the pass-1 report, and an instruction to confirm the fixes and then review the whole change. The JSON `modelUsage` confirmed `claude-opus-5-5`; the SHA-256 tree snapshot was `9a213804ffa7843b5d79a7ec36808c43d263370c49e94d9f64c2916f72d69053` before and after the pass. The reviewer, writing in Bulgarian (paraphrased here), re-confirmed the `spawn` mechanism against the Node v24 source and that no module of the withholding files snapshots `process.env`, and confirmed the fixes of all pass-1 findings, with a leftover of the third and a weak test for the fifth raised as new findings. Findings: 0 Critical, 0 High, 0 Medium, 5 Low. As a Low-only pass, they were fixed without another review pass, as the review process allows; each is an unreviewed fix:
  1. Low (`verification.md:16`): the self-check still said that children that exit normally keep the variable, and named only the macOS paths. Unreviewed fix: rewritten to the scope of the loss of `design.md`, naming `linux-cgroup.privileged.ts`.
  2. Low (`packages/testing/test/coverage-environment.test.ts:23`): the new test set the checked directory only in the child's base, so a helper that omits the key would leak the runner's directory and still pass. Unreviewed fix (`4e4f7d6`): the test points `process.env` at the checked directory too and restores it afterwards.
  3. Low (`verification.md:40`): the remaining coverage files of `check-archive-dry-run.test.ts` were attributed to unkilled runs of the check, though every run now goes through the helper. Unreviewed fix: attributed to the test process and three `runCommand` children that exit by themselves.
  4. Low (`verification.md:46`): two check results were merged into one list item. Unreviewed fix: split.
  5. Low (`tasks.md:7-8`): tasks 2.1 and 2.2 did not name the archive check and the Linux file, and the Linux change had not been run. Unreviewed fix: the tasks name them, and `make verify-linux-cgroup` ran (below).

## Limitations

- The failure was seen once on the iMac and was not reproduced here; the fix removes its precondition, a killed Node child that writes into the runner's coverage directory, which the counts above show for the touched test files.
- Killed children no longer add coverage; totals dropped slightly against recent runs on `dev` (for example 99.28 % lines, 92.07 % branches, 99.04 % functions in the record of `stabilize-observability-lag-test`) and stay well above 75 %.
- The NATS and PostgreSQL recovery integration tests and `harness-composition.ts` were not counted file by file; they ran green inside `make verify`.
- The coordinator's integration runs `make verify` on the merged state on the 2020 Intel iMac (Desi host); this record has only the macOS arm64 run.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, run by the worker after review pass 2 and its unreviewed fixes. The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive keep-coverage-out-of-killed-test-processes --yes` (base `908d0fc`, merge base with `origin/dev` `5c60c15`).

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`: exit 0; 2010 tests, 2008 passed, 0 failed, 2 skipped; coverage 99.27 % lines, 91.94 % branches, 98.96 % functions; findings validation passed (the moved `findings.jsonl` with 13 lines).
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-27-keep-coverage-out-of-killed-test-processes` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only the ADDED requirement "Coverage kept out of killed processes" with its two scenarios in `deterministic-test-harness`.
