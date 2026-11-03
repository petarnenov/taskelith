# Verification: stabilize-webhook-limit-test

## Scope and source

Assigned on 2026-11-03 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the test "a body over the limit is 413 before any verification, and one at the limit is read" of `apps/control-plane/test/scm-webhook-receiver.test.ts` failed intermittently with `fetch failed` and `ECONNRESET` in three `make verify` runs on the loaded iMac on 2026-11-03, and passed alone in 3 of 3 runs. Scope: the product fix in `apps/control-plane/src/api/http-exchange.ts` and `apps/control-plane/src/api/api-server.ts`, the export of the drain bounds from `apps/control-plane/src/index.ts`, three tests in the test file, wire contract section 5, a `control-plane-api` spec delta, and this change. Excluded: other flaky tests, the 25 MiB limit, and the verification order. Commit types `chore`, `test`, and `docs`; `@taskelith/control-plane` is private.

## Revision

- Base: `dev` `0e8d10e0` (#432); the brief's checklist was saved with `--at 0e8d10e0a7bdd24680897050231c175fd016783c --size S`.
- `7ebb61f1` `chore: answer before an unread body ends and close after a bounded drain` (the fix, the tests, the contract, the proposal, design, tasks, spec delta, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `7a728252` `chore: route the stabilize webhook limit test change` (`route.json` unedited).
- The commit of this record and `make record` follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs. `make verify` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs below ran with Node.js 24.22.0 from the shell's `PATH` after `npm run build`, as `node --experimental-strip-types --test apps/control-plane/test/scm-webhook-receiver.test.ts` from the worktree.

## Diagnosis

- Every answer is sent with `response.shouldKeepAlive = false` (`apps/control-plane/src/api/api-server.ts:129`), so it carries `Connection: close`. `signedBody` answers 413 `body-too-large` when the declared `content-length` exceeds 25 MiB, before it reads the body. The test's oversized `fetch` declares 25 MiB + 1 byte, so the server answers at once while `fetch` still writes the body.
- On a finished response of a connection that is not kept alive, Node.js 24's `resOnFinish` calls `socket.destroySoon()` (`if (res._last) { ... socket.destroySoon(); }` in the `node` binary's `_http_server`), which destroys the socket once its FIN is written. A TCP close with received data still unread makes the kernel send a reset. The client's next write fails with `EPIPE` or `ECONNRESET`; `fetch` fails as a whole when that error comes before it has parsed the 413, which a loaded host makes likely.

## Fail-before

- An exploratory raw socket client against the server of the base, in a temporary test file that was deleted, failed with `Error: write EPIPE`, `code: 'EPIPE'`.
- The new test "a sender that writes its whole oversized body before reading still gets the 413" with the product fix of `api-server.ts` reverted to the base (`git checkout apps/control-plane/src/api/api-server.ts`, `npm run build`), the rest of the change kept: 3 of 3 runs failed that test, 13 others passed in each run. With the fix restored and rebuilt, the file passed 14 of 14.
- The two bound tests pass also without the fix, because the server then closes at once; they guard the bounds, not the race.

## Author self-check

- Against the brief: the product, not the test, is fixed; the preferred mechanism, `Connection: close` and a graceful end after the answer is written, with a drain bounded in bytes and time, named `MAX_DRAINED_BODY_BYTES` (32 MiB) and `MAX_DRAIN_MILLISECONDS` (10 s) in `apps/control-plane/src/api/http-exchange.ts`. Discarded bytes are counted, never buffered.
- The declared-length test "a declared length over the limit is 413 before the body is read" is unchanged and passes: its sender reads the answer at once, and its `request.destroy()` ends the drain.
- The fix keys on `request.complete`, so it also covers other answers sent before their body ended (design "Every early answer"); requests whose body was read and event streams are written as before.
- The time bound test uses the test runner's mock `setTimeout`, and the other new tests wait on socket events with 60 s outer bounds; no fixed sleeps.
- `npm run verify:comments`: "Every comment is within the comment length rule." No AI attribution in commits.
- Spec: one ADDED requirement, "Answer before the body ends", of 325 characters; an archive of a scratch copy of `openspec/` archived it and `openspec validate --specs --strict` passed there (`Totals: 71 passed, 0 failed (71 items)`).

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| The test file, 20 consecutive runs with 16 busy-loop Node.js processes on the 8 logical CPUs | `7ebb61f1` | 20 of 20 runs passed 14 of 14 tests, load average 3.9 to 19.2; the flaky test took 1559 to 2694 ms, the new raw sender test 109 to 272 ms |
| `npm run openspec -- validate stabilize-webhook-limit-test --strict` | `7ebb61f1` | `Change 'stabilize-webhook-limit-test' is valid` |
| `env -u NODE_ENV make verify` | `7a728252` | Passed on the first run, profile full, tree `a1fd9563`, stamp written; the totals are in "Generated checks"; the four tests of the test file named in this change passed (1092, 118, 103, and 5 ms) |

### Route

Route (`route.json`, rule version 5): elevated, trigger `contracts`; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.53, threshold 0.4). The route's efforts are a recommendation only: the reviews run at effort medium for every pass, owner decision 2026-11-02, as the brief and governance "Routed effort" state.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a1fd9563bc7291420cf2d3647e97b455ff947353`; tests 4632, pass 4585, fail 0, skipped 47; all files 99.41% lines, 92.78% branches, 98.82% functions.
- `npm run openspec -- validate stabilize-webhook-limit-test --strict`: passed, `Change 'stabilize-webhook-limit-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 109 file(s); every pass summary file is valid: 89 file(s); every route file is valid: 42 file(s).`.
- Spec diff against the merge base `0e8d10e0a7bd` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending: the worker runs the passes at effort medium (owner decision 2026-11-02).

## Limitations

- The intermittent failure was not reproduced on the iMac; the raw sender reproduces its mechanism deterministically on this host.
- A sender that writes more than 32 MiB past an early answer, or for more than 10 s, can still lose it to a reset; that is the bound the brief requires.

## Remaining gates

- Independent review, passes 1 and 2, and pass 3 if pass 2 has a Medium or worse finding.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
