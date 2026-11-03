# Verification: stabilize-webhook-limit-test

## Scope and source

Assigned on 2026-11-03 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the test "a body over the limit is 413 before any verification, and one at the limit is read" of `apps/control-plane/test/scm-webhook-receiver.test.ts` failed intermittently with `fetch failed` and `ECONNRESET` in three `make verify` runs on the loaded iMac on 2026-11-03, and passed alone in 3 of 3 runs. Scope: the product fix in `apps/control-plane/src/api/body-drain.ts`, `apps/control-plane/src/api/http-exchange.ts`, and `apps/control-plane/src/api/api-server.ts`, the export of the drain bounds from `apps/control-plane/src/index.ts`, the new tests in `apps/control-plane/test/scm-webhook-receiver.test.ts`, `apps/control-plane/test/body-drain.test.ts`, and `apps/control-plane/test/early-answer.test.ts` with the raw sender `apps/control-plane/test/raw-sender.ts`, wire contract section 5, a `control-plane-api` spec delta, and this change. Excluded: other flaky tests, the 25 MiB limit, and the verification order. Commit types `chore`, `test`, and `docs`; `@taskelith/control-plane` is private.

## Revision

- Base: `dev` `0e8d10e0` (#432); the brief's checklist was saved with `--at 0e8d10e0a7bdd24680897050231c175fd016783c --size S`.
- `7ebb61f1` `chore: answer before an unread body ends and close after a bounded drain` (the fix, the tests, the contract, the proposal, design, tasks, spec delta, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `7a728252` `chore: route the stabilize webhook limit test change` (`route.json` unedited).
- `809228ce` `docs: record the checks of the stabilize webhook limit test change`.
- `f86d074a` `chore: bound and force the discard after an early answer` (the pass 1 fixes, with the pass 1 summary in `passes.jsonl`).
- `130f59bb` `docs: record the pass 1 fix round of the stabilize webhook limit test change` (`findings.jsonl` and this record).
- `ad68f928` `test: show that the drain retains none of the bytes it discards` (the coordinator's decisions).
- `4e21b578` and `07ebe518`, the coordinator's decisions and the `make verify` of the pass 1 fix round.
- `ff0a16c8` `chore: flush an empty early answer and answer a bodiless request at once` (the pass 2 fixes, with the pass 2 summary in `passes.jsonl`).
- The commit of the pass 2 records and `make record` follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs. `make verify` ran with the `.nvmrc` pin, Node.js 24.22.1; the targeted runs below ran with Node.js 24.22.0 from the shell's `PATH` after `npm run build`, as `node --experimental-strip-types --test apps/control-plane/test/scm-webhook-receiver.test.ts` from the worktree.

## Diagnosis

- Every answer is sent with `response.shouldKeepAlive = false` (`apps/control-plane/src/api/api-server.ts:133`), so it carries `Connection: close`. `signedBody` answers 413 `body-too-large` when the declared `content-length` exceeds 25 MiB, before it reads the body. The test's oversized `fetch` declares 25 MiB + 1 byte, so the server answers at once while `fetch` still writes the body.
- On a finished response of a connection that is not kept alive, Node.js 24's `resOnFinish` calls `socket.destroySoon()` (`if (res._last) { ... socket.destroySoon(); }` in the `node` binary's `_http_server`), which destroys the socket once its FIN is written. A TCP close with received data still unread makes the kernel send a reset. The client's next write fails with `EPIPE` or `ECONNRESET`; `fetch` fails as a whole when that error comes before it has parsed the 413, which a loaded host makes likely.

## Fail-before

First round, at `7ebb61f1`; the pass 1 fix round has its own below.


- An exploratory raw socket client against the server of the base, in a temporary test file that was deleted, failed with `Error: write EPIPE`, `code: 'EPIPE'`.
- The new test "a sender that writes its whole oversized body before reading still gets the 413" with the product fix of `api-server.ts` reverted to the base (`git checkout apps/control-plane/src/api/api-server.ts`, `npm run build`), the rest of the change kept: 3 of 3 runs failed that test, 13 others passed in each run. With the fix restored and rebuilt, the file passed 14 of 14.
- The two bound tests pass also without the fix, because the server then closes at once; they guard the bounds, not the race.

## Author self-check

- Against the brief: the product, not the test, is fixed; the preferred mechanism, `Connection: close` and a graceful end after the answer is written, with a drain bounded in bytes and time, named `MAX_DRAINED_BODY_BYTES` (32 MiB) and `MAX_DRAIN_MILLISECONDS` (10 s), since `f86d074a` in `apps/control-plane/src/api/body-drain.ts`. Discarded bytes are counted, never buffered.
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
| `env -u NODE_ENV make verify`, pass 1 fix round | `4e21b578` | Passed on the first run (an earlier run at `130f59bb` was stopped unfinished, to add the coordinator's decisions), profile full, tree `b4e8245a`, stamp written; tests 4646, pass 4599, fail 0, skipped 47 |

### Route

Route (`route.json`, rule version 5): elevated, trigger `contracts`; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router agreed (P(third) 0.53, threshold 0.4). The route's efforts are a recommendation only: the reviews run at effort medium for every pass, owner decision 2026-11-02, as the brief and governance "Routed effort" state.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `b4e8245adf977b3dc379646db6a0c6f1a70b1495`; tests 4646, pass 4599, fail 0, skipped 47; all files 99.41% lines, 92.80% branches, 98.85% functions.
- `npm run openspec -- validate stabilize-webhook-limit-test --strict`: passed, `Change 'stabilize-webhook-limit-test' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 109 file(s); every pass summary file is valid: 89 file(s); every route file is valid: 42 file(s).`.
- Spec diff against the merge base `0e8d10e0a7bd` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a2a3-6447-7620-a2d4-ad6e537b3c1e` | 0 | 2 | 5 | 1 |
<!-- make record: end -->

## Independent review

Pass 1: Codex CLI `gpt-6-astra`, effort medium, session `01a1a2a3-6447-7620-a2d4-ad6e537b3c1e`, reviewed `0e8d10e0..809228ce`: Critical 0, High 2, Medium 5, Low 1, all fixed in `f86d074a` (`findings.jsonl`). Pass 2: Claude Code `claude-fable-5-1`, effort medium, session `34844afd-1dac-4b08-9356-c15e840c4a7c`, reviewed `0e8d10e0..07ebe518`: Critical 0, High 0, Medium 1, Low 5; five fixed in `ff0a16c8`, L4 declined as the reviewer's information only (`findings.jsonl`). Pass 3 is next, since pass 2 had a Medium finding.

## Pass 1 fix round

- **Fixes.** `readBody` reads through `request.iterator({ destroyOnReturn: false })` (`apps/control-plane/src/api/http-exchange.ts:70`). `BodyDrains` (`apps/control-plane/src/api/body-drain.ts`) pauses the input and destroys the socket at either bound, keeps the deadline until the socket closes, admits at most `MAX_CONCURRENT_DRAINS` (16) drains and ends the answer at once beyond them; `serve` calls it synchronously (`apps/control-plane/src/api/api-server.ts:193`). Spec delta: "Answer before the body ends" (466 characters), "Bounded discards" (326), and MODIFIED "SCM webhook receiver served" (477) with its three scenarios; wire contract section 5 matches.
- **Fail-before.** The new tests against the source of `809228ce` (`git stash` of `apps/control-plane/src` and the new unit test, `npm run build`), the rest of the tests kept: 13 passed and 5 failed. The chunked sender of 8 MiB over the limit read nothing (`actual: ''`; 5 of 5 runs of that test alone failed); the time bound test failed at `assert.equal(serverSide.destroyed, true)` after the deadline; the saturation test failed with `no answer within 60000 ms`; the fault test failed with `Error: writeHead failed` as an unhandled rejection; and the slot test failed because it now observes `request.iterator`, which the old `readBody` did not call. The early 401 test and the declared senders passed there, as the first round had fixed them. With the fixes restored and rebuilt, the three files passed 27 of 27, twice.
- **Mutations.** Each edit of the built `apps/control-plane/dist/api/body-drain.js`, restored after, failed at least one test: byte bound `>=` (1 failed), byte bound removed (2), deadline one millisecond shorter (2) or longer (2), body end ignored (3, the saturation test by its 60 s watchdog, so no run hung), drain slots unbounded (3), drain slots off by one (3).
- **Coordinator decisions.** Added to the round's scope: the named `MAX_CONCURRENT_DRAINS` with the answer-and-close fallback is accepted, and its saturation tests stay; the drain keeps covering every early answer; design.md states its worst case and the reason for 16 ("Worst case of the unauthenticated drain"); `docs/operational-targets.md` is unchanged. The new test "the drain retains none of the bytes it discards" (`ad68f928`) writes 32 chunks of 1 MiB that only `WeakRef`s watch and collects garbage: 10 of 10 runs of its file passed, and with the built drain edited to keep each chunk, it failed with `every chunk was collected`.
- **Load.** The three files (`scm-webhook-receiver.test.ts`, `body-drain.test.ts`, `early-answer.test.ts`) at `ad68f928`, 20 consecutive runs with 16 busy-loop Node.js processes on the 8 logical CPUs: 20 of 20 runs passed 28 of 28 tests, load average 4.94 to 20.27, run duration 7178 to 19093 ms. An earlier series at `f86d074a`, before the no-buffering test, passed 27 of 27 in 20 of 20 runs.
- **Scratch archive.** A copy of `openspec/` archived the change (`+ 2, ~ 1`), and `openspec validate --specs --strict` passed there: `Totals: 71 passed, 0 failed (71 items)`.

## Pass 2 fix round

- **Fixes.** M1: `BodyDrains.answer` flushes the head of an empty answer with `response.flushHeaders()` and writes other content (`apps/control-plane/src/api/body-drain.ts:36`). L1: `serve` answers a request with neither `transfer-encoding` nor a nonzero `content-length` at once (`bodyEnded`, `apps/control-plane/src/api/api-server.ts:205`), so it takes no drain slot; the fault test's requests now declare `content-length: 1` to keep the drain path. L2: the scope, the self-check, and the `shouldKeepAlive` citation (`api-server.ts:133`) are current. L3: contract section 5 and design "A bound really stops" state that the 32 MiB are body bytes without chunk framing and that the time bound limits the wire bytes; the spec delta speaks of the discarded body and is unchanged. L5: section 5 says "like every answer". L4: declined, no code change.
- **Fail-before.** The new tests against the source of `07ebe518` (`git checkout apps/control-plane/src`, `npm run build`), with `body-drain.test.ts` and `early-answer.test.ts`: 12 passed and 3 failed. The unit case "an empty answer flushes its head at once instead of writing nothing" got `[ false, [ <Buffer > ] ]`; the wire test "an empty answer given before its body ends sends its head before the body ends" failed after 10009 ms with `the connection closed before any answer`; "a request without a body is answered at once and takes no drain slot" got `'drained'` for no headers. With the fixes restored and rebuilt, the two files passed 15 of 15.
- **Load.** The three files at `ff0a16c8`, 20 consecutive runs with 16 busy-loop Node.js processes on the 8 logical CPUs: 20 of 20 runs passed 31 of 31 tests, load average 9.91 to 21.50, run duration 8081 to 18764 ms. An earlier series ran by mistake against the fail-before build, not rebuilt after the fixes were restored: in 20 of 20 runs exactly the three new tests failed and 28 passed, the no-buffering test included; it is not evidence for the fix.
- **Scratch archive.** A copy of `openspec/` archived the change (`+ 2, ~ 1`), and `openspec validate --specs --strict` passed there: `Totals: 71 passed, 0 failed (71 items)`.

## Limitations

- The intermittent failure was not reproduced on the iMac; the raw sender reproduces its mechanism deterministically on this host.
- A sender that writes more than 32 MiB past an early answer, or for more than 10 s, or that arrives while all 16 discard slots are taken, can still lose the answer to a reset; that is the bound the brief requires.
- The byte bound overshoots by at most the chunk that crosses it; the wire test accepts any close between 32 and 64 MiB written, since kernel buffers hold part of what the sender wrote.

## Remaining gates

- Independent review: pass 3, which runs because pass 2 had a Medium finding; it is the last pass.
- The coordinator's check, as solution architect, of every fix that no later pass reviews.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
