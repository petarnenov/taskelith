# Verification: stabilize-evidence-publisher-test-server

## Scope and source

The coordinator Niki assigned B6, `stabilize-control-plane-fetch-tests`; its diagnosis split out this test failure as symptom c. `packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` fails intermittently under load with `Test hook "before" at ...:45:1 generated asynchronous activity after the test ended. This activity created the error "Error: aborted" ... unhandledRejection`. This change fixes that test only; the product publisher is unchanged.

- Branch `stabilize-evidence-publisher-test-server`, created from `origin/dev` at `c73c0fa`.
- Worktree `../taskelith-worktrees/stabilize-evidence-publisher-test-server`, developed by an implementation subagent that the worker session, Maki, briefed and checked.

## Diagnosis evidence

- Stress, at diagnosis revision `843e293`: the script `/private/tmp/claude-501/-Users-petarpetrov-taskelith/8ea91b33-b945-4014-af78-063dc260a565/scratchpad/stress.sh` starts `LOADPROCS` `yes > /dev/null` processes, runs the test file `RUNS` times with `PARALLEL` runs at a time through `seq 1 RUNS | xargs -P PARALLEL -I{} sh -c "node --experimental-strip-types --test <file> > OUTDIR/run{}.log 2>&1"`, kills the load, and counts the logs that contain `after the test ended` or a non-zero `fail`. The run was `stress.sh <outdir> 80 12 24 packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts`: 12 runs at a time next to 24 `yes` processes. In 80 runs, 3 failed with the exact message above. In 40 idle runs none failed.
- Cause: the fake server's `async` callback has no error handling. In the timeout case (`publisher(20)` against a 200 ms delayed answer) the client can abort before the server has read the body, so `for await (const chunk of request)` rejects with `Error: aborted` and nothing handles it.
- Deterministic repro: the regression test below fails every run on the old handler.

## Environment

macOS 26.6.2 on arm64, Node.js 24.22.1.

## Author self-check

- Only the test file changes: a total fake-server handler that tolerates only a client that left, and one regression test.
- No product code, no retries, and no widened timeouts.
- The new comment is one line of at most 80 characters. All content is English.

## Evidence check

The change adds no external link.

## Checks and results

- Request flag: a one-off check on Node.js 24.22.1 logged the flags in the handler's rejection path. For the mid-body abort: `errored` set (`Error: aborted`), `aborted: true`, `destroyed: true`. For a body that is not multipart: `errored: null`, `aborted: false`, `destroyed: true`, and the fake server answered `500` with the `TypeError` from `formData()`. The handler therefore branches on `request.errored`. The one-off check was removed after the run.
- Regression test before the handler fix: the new test, which aborts after the server's `request` event, was added to the file at `c73c0fa`, and the file was run with `node --experimental-strip-types --test packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts`. It failed 10 of 10 runs with exit code 1, `tests 6, pass 5, fail 1` (the failure is the file itself), and:
  `Error: Test hook "before" at packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts:46:1 generated asynchronous activity after the test ended. This activity created the error "Error: aborted" and would have caused the test to fail, but instead triggered an unhandledRejection event.`
- After the fix (`5565846`): the same command passed with `tests 5, pass 5, fail 0`. A lighter load check, `for i in $(seq 1 10); do for j in $(seq 1 8); do (node --experimental-strip-types --test <file> >/dev/null 2>&1 || echo FAIL >> <log>) & done; wait; done`, ran 80 runs, 8 at a time, with no failures.
- Under the diagnosis load, at `faf1da2`: `stress.sh <outdir> 80 12 24 packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts` reported 0 failing logs; all 80 logs show `tests 6, pass 6, fail 0`. The load was real: the first test took up to 1064 ms against about 37 ms idle.
- The 500 branch: the test "any other failure of the fake server answers 500", added at `faf1da2`, posts a body that is not multipart and asserts status 500. With the 500 answer replaced by an unconditional `response.destroy()`, that test failed (`tests 6, pass 5, fail 1`); restored, the file passed.
- `npm run openspec -- validate stabilize-evidence-publisher-test-server --strict` passed.
- `make verify` passed on the final tree at `c0e6a70`: 1930 tests, 1928 passed, 0 failed, 2 skipped; coverage of all files was 99.28% lines, 92.06% branches, and 99.04% functions. This was before review pass 2; the result after its fixes is recorded below.

## Independent review

### Pass 1

- Reviewer: Claude Code, model `claude-opus-5-5`, effort high, read-only.
- Invocation, from the worktree: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Revision: `8daf188` (diff `c73c0fa..8daf188`). The JSON `modelUsage` names `claude-opus-5-5`.
- Session: `aaccfdcb-6c21-4a6b-b83c-6e723a566a35`.
- Snapshot: `e03aaebf4dfdf862832c03a37361e006cbb5e8511ff4cf15e344213dfefe276d` before and after, unchanged.
- Findings: Critical 0, High 0, Medium 1, Low 5. A Medium is present, so pass 2 follows. The resolutions below are to be confirmed by pass 2.

1. M1: the blanket `.catch(() => response.destroy())` swallowed every fake-server error, and a destroyed socket maps to `unavailable`, which the gateway and timeout cases expect. Resolved: only a client that left (`request.errored` set) destroys the response; anything else answers 500, which the publisher reports as `internal`. The flag and both branches are proven by the one-off check above; the comment and `design.md` are updated.
2. L1: `AbortSignal.timeout(20)` could fire before the request reached the server, making the regression test vacuous. Resolved: the test waits for the server's `request` event and then aborts through an `AbortController`. Re-proven: 10 of 10 failures on the old handler, passing after.
3. L2: the `closeAllConnections()` rationale was overstated. Resolved: the call is removed, since nothing showed it was needed.
4. L3: `make verify` was recorded before the OpenSpec files existed. Resolved: it is re-run on the final tree and recorded above, under Checks and results.
5. L4: the unchanged requirement and the `skip_specs` precedent were not named. Resolved: `proposal.md` names "Evidence publication client" and cites `2026-10-25-fix-flaky-event-loop-lag-test`.
6. L5: the diagnosis was not traceable. Resolved: the diagnosis evidence is recorded inline above; B6 is named only as the coordinator's assignment.

### Pass 2

- Reviewer and invocation: the same as pass 1.
- Revision: `ef5eaf8`. The pass 1 resolutions were checked in the diff `8daf188..ef5eaf8`, and the whole change in `c73c0fa..ef5eaf8`. The JSON `modelUsage` names `claude-opus-5-5`.
- Session: `08397f37-a7a5-46cf-a35b-f79f8184b07c`.
- Snapshot: `6917def607e1c6cb62fc51a316a50dbd52088e1d92b6ffa46d5c1dccac054d9c` before and after, unchanged.
- Pass 1 findings: all resolved.
- Findings: Critical 0, High 0, Medium 0, Low 7. This was a Low-only pass, so the findings are fixed without another review and recorded as unreviewed fixes:

1. L-A: the 500 branch was untested. Unreviewed fix: the test "any other failure of the fake server answers 500"; reverting to an unconditional destroy fails it.
2. L-B: the L3 resolution said "recorded below". Unreviewed fix: it says "recorded above, under Checks and results".
3. L-C: "The next commit only adds this result line" was inaccurate. Unreviewed fix: that line now refers to the result after the pass 2 fixes, and the final result is recorded at the end of this record.
4. L-D: the exact commands of the diagnosis stress run and of the post-fix check were missing. Unreviewed fix: both are recorded under Diagnosis evidence and Checks and results.
5. L-E: the post-fix check ran under a lighter load than the diagnosis. Unreviewed fix: it was re-run with the same `stress.sh` setup, 80 runs, with 0 failures.
6. L-F: Scope and source did not name the developer. Unreviewed fix: the branch, worktree, and the subagent briefed and checked by Maki are recorded.
7. L-G: `proposal.md` now cites `docs/sdlc-framework-mapping.md`, which states that a change without capabilities sets `skip_specs: true`.

## Limitations

- The intermittent failure depended on load. The stress runs show that it did not appear in 80 runs, which does not prove that it cannot appear. The regression test reproduces the cause deterministically instead.
- The request flag was checked on Node.js 24.22.1 only.
- The diagnosis arguments `80 12 24` are taken from the script's usage, the 80 diagnosis logs, and the coordinator's description of the run; the diagnosis shell history was not kept.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Final checks

PENDING
