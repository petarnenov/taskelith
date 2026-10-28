# Verification: implement-git-remote-operations

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16c, developed by a briefed subagent of the worker session Liki for the coordinator Niki: `readRemoteHead` and the leased push with the credential transport against a local smart-HTTP Git server, the 9 conformance cases deferred to 16c, the time limit of Git processes that 16b handed over (decision B4), and the obligation from item 9a that the run credential reaches only the remote URL the control plane supplied. The contract amendments are coordinator decisions Q1 (a) and Q2 (a) of 2026-10-28 ([design](design.md), "Coordinator decisions"). Reviewers named by the brief: A Codex `gpt-6.1-sol`, B Claude Code `claude-opus-5-5` at high effort. Out of scope: 16d (hand-off, reclaim, `WS5` to `WS10`, Linux tests in the worker image, the 6 hand-off conformance cases) and 16e (wiring, execution group, slot, macOS composition, clone umask).

## Revision

- Base: `dev` `803c7057`.
- `5f6f2565` `test: add failing tests for the Git adapter's remote operations`: every new and changed test, with the new API as stubs that throw (`readRemoteHead`, `push`, `GitRunner.withTimeLimit`, `parseCommitParents`) and without `http.followRedirects=false`. The fail-before run below ran on this commit.
- `6b2ce77b` `chore: implement the Git adapter's remote operations and Git time limit`.
- `94deb819` `docs: record the implement-git-remote-operations change and amend contract section 7` (contract sections 7 and 13 and its header, proposal, design, spec delta, tasks, empty `findings.jsonl` and `passes.jsonl`, `checklist.json`).
- `fcf5a2f4` `docs: route the implement-git-remote-operations change` (`route.json`, unedited).
- `cbc8fd37` `docs: shorten the modified Git configuration scope requirement`, after the first `make verify` (Checks). The recorded `make verify` ran on this commit's clean tree.
- `ba442610` `docs: record the verification of implement-git-remote-operations`: the head that review pass 1 reviewed.
- `683feb1c` `chore: parse the remote head before redaction and bound the Git time limit`: the fixes of review pass 1 with their tests.
- `501840c6` `docs: record the pass 1 fixes in the implement-git-remote-operations design` (design decisions 6 and 9).
- The pass 1 records (`findings.jsonl`, `passes.jsonl`, this file) follow, up to `54780a6a`, the head that review pass 2 reviewed; the `make verify` of "After review pass 1" ran on their clean tree.
- `4bb55a92` `chore: scrub whole Git failure messages and settle a failed push by the remote head`: the source fixes of review pass 2 with their tests.
- `ab145df9` `docs: specify scrubbed parser output and the failed push outcome` (spec delta and design decisions 3 and 9).
- `cdc72db4` `docs: correct the fail-before record of implement-git-remote-operations` (finding L4).
- The pass 2 records follow; the `make verify` of "After review pass 2" ran on their clean tree, and the commit that completes this record changes no checked input other than this file.

## Environment

Native Ubuntu 26.04.1 LTS host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 (`nvm use`, as the `Makefile` pins); host Git `git version 2.55.0` at `/usr/bin/git`, which the tests wrap and pin with its own version string and which serves the test remote through `git http-backend`; libcurl 8.18.0; Perl for the recording wrapper. `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`. The Linux pin `git version 2.43.0` and Apple's 2.50.1 did not run.

## Author self-check

- Scope: only `readRemoteHead`, the push, the time limit, the redirect setting, and the smart-HTTP fixture; no hand-off, reclaim, or wiring; `docs/g3-plan.md` unchanged; the contract changed only as decisions Q1 (a) and Q2 (a) say (sections 7 and 13, and one revision sentence in its header). No new third-party dependency; the dependency inventory is unchanged.
- Push arguments: exactly `taskBranchPushArguments`, no `-C`, started in the checkout; no bare `--force`, bare `--force-with-lease`, `+` refspec, or cancelling option anywhere (`grep -n "force" packages/adapters/git-workspace/src/*.ts` finds only `rm` options; the lease comes from `taskBranchPushArguments`).
- Crash points: contract section 3 names none for the remote operations (design D7), so none was added.
- Comments: at most two lines of at most 80 characters (`npm run verify:comments`).
- Tests: no fixed sleep; the tests that wait for a killed process group poll a condition (`kill` with signal 0 until `ESRCH`) with a 30 s deadline. Since review pass 1 (findings 4 and 5) no test races a real time limit: an injected `ManualGitTimer` arms each limit, and the test fires it only after a readiness signal, the stalled client's atomically written pid file (runner) or the test server's `beforeAnswer` hook for the stalled request (adapter); a 30 s watchdog (`within`) bounds the termination after the kill, and cleanup expires the timer and kills leftovers on failure.
- Checklist categories: contract-drift (Q1 and Q2 amend section 7 with what the code does; D2, D3, and D6 name every detail the adapter settled); error-handling (D2, D3, D6: every Git failure maps to `unavailable` or `internal`, unreadable output to `internal`); spec-wording (each new requirement is under 500 characters with a scenario that a named test checks); redaction (D9); missing-fail-before-test (below); concurrency-race (the lease race test drives the race through the server's hook, without timing).

## Fail-before

On `5f6f2565`, after `npm run build`: `node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/*.test.ts packages/modules/workspace/test/workspace-domain.test.ts` gave tests 162, pass 126, fail 30, skipped 6. The failures: the 9 un-skipped conformance cases and the 15 new adapter tests of `remote-operations.test.ts` and "a commit whose bytes do not hash to its name fails the push ancestry check", each with `Error: not implemented` from the `readRemoteHead`, `push`, or `withTimeLimit` stub; "a commit names its parents right after its tree" (stub); "the time limit is ten minutes by default and must be a positive whole number" (stub); "the built Git environment holds the contract settings, the header last" (the missing `http.followRedirects=false`); "a prepare whose advertisement request is redirected ...", because without that setting the other origin received requests, not because of a stub; and "a process past its time limit is killed with its group, remote unavailable, local internal", which the stub runner never killed: the test's 60 s timeout marked it failed, and the test file's process waited for the stub's `sleep 600` child until the author killed it, so the run took about 325 s. The 126 passing tests are those of 16b, which still pass over the smart-HTTP fixture, one of them, "every deferred case names a case of the suite", with its new assertion that 6 cases stay skipped, and the new "a prepare whose service request is redirected ...", which needs neither a stub nor the setting (see the next paragraph). Review pass 2 (finding L4) found the unnamed 30th failure and the wrong claim that all 126 were of 16b; both are corrected here.

Redirect setting, on the working tree of `6b2ce77b` with only `http.followRedirects=false` removed from `GIT_COMMAND_SCOPE_SETTINGS` (then restored, `git diff` empty): `node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/remote-operations.test.ts` gave tests 17, pass 14, fail 3: "a prepare whose advertisement request is redirected ...", "a readRemoteHead whose advertisement request is redirected ...", and "a push whose advertisement request is redirected ... sends that origin nothing", each because the other origin received requests. A redirect of a later request alone is not followed by Git's default either, so those three tests pass without the setting.

### Redirect reproduction (decision Q1)

The coordinator's experiment, `redirect2.mjs` in the coordinator's scratch directory, rerun by the author: two loopback servers on `127.0.0.1`, the first answering every request with `302` to the second, which serves a bare repository through `git http-backend`; `git ls-remote <first>/repo.git` with git 2.55.0 and libcurl 8.18.0, in `/`, with `HOME=/nonexistent`, `GIT_TERMINAL_PROMPT=0`, no system or global configuration, and `http.extraHeader=Authorization: Basic c2VjcmV0` as command-scope configuration.

- Default (`http.followRedirects` unset, Git's `initial`): exit 0, `warning: redirecting to http://127.0.0.1:<second>/repo.git/`; the first server saw `GET /repo.git/info/refs?service=git-upload-pack` with the header, the second `GET /repo.git/info/refs?service=git-upload-pack` without it and then `POST /repo.git/git-upload-pack` with `Authorization: Basic c2VjcmV0`: the header reached the other origin.
- With `http.followRedirects=false`: exit 128, `fatal: unable to access 'http://127.0.0.1:<first>/repo.git/': The requested URL returned error: 302`; only the first server saw a request.

## After the change

On `6b2ce77b`, after `npm run build`: `node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/*.test.ts packages/modules/workspace/test/*.test.ts` gave tests 266, pass 260, fail 0, skipped 6 (the 6 hand-off cases of 16d). `npx tsc -p tsconfig.check.json` passed.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `npm run openspec -- validate implement-git-remote-operations --strict` | `94deb819` | "Change 'implement-git-remote-operations' is valid" |
| `make findings ARGS="route --change implement-git-remote-operations"` | `94deb819` | "route: elevated (lines, contracts), rule version 1"; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow agrees; recommendation only, committed unedited as `fcf5a2f4` |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `fcf5a2f4` | Failed only at `npm run verify:archive`: after the archive in a scratch copy, the modified requirement "Git configuration scope" was longer than 500 characters; tests 3071, pass 3018, fail 0, skipped 53. Fixed in `cbc8fd37` |
| `npm run openspec -- validate implement-git-remote-operations --strict` and `npm run verify:archive` | `cbc8fd37` | "Change 'implement-git-remote-operations' is valid"; "Every active OpenSpec change archives into strictly valid specs" |
| `make findings ARGS="route --change implement-git-remote-operations"`, repeated after the fix | `cbc8fd37` | The same route and reviewers; only `generatedAt`, `headCommit`, `expectedPasses` (2.6 to 2.63), and `latencyMs` differed, so the committed `route.json` was kept unedited |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `cbc8fd37`, tree `7f9bda42` | Passed, profile full, stamp written: tests 3071, suites 45, pass 3018, fail 0, cancelled 0, skipped 53; all files 99.33 % lines, 92.76 % branches, 99.00 % functions. `make record` of this run is under "Generated checks" |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of that run | `cbc8fd37` | lines 1099 of 1105 (99.46 %), branches 549 of 598 (91.81 %), functions 153 of 155 (98.71 %) |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`, after review pass 1 | `c5e295d3`, tree `a8473b8e` | Passed, profile full, stamp written: tests 3077, pass 3024, fail 0, skipped 53; all files 99.33 % lines, 92.77 % branches, 99.02 % functions. `make record` of this run is under "Generated checks" |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of that run | `c5e295d3` | lines 1136 of 1142 (99.47 %), branches 565 of 614 (92.02 %), functions 164 of 165 (99.39 %) |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`, after review pass 2 | `fcc2cfd7`, tree `4f377b1b` | Passed, profile full, stamp written: tests 3080, suites 45, pass 3027, fail 0, cancelled 0, skipped 53; all files 99.33 % lines, 92.75 % branches, 99.00 % functions. `make record` of this run is under "Generated checks" |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of that run | `fcc2cfd7` | lines 1166 of 1172 (99.49 %), branches 579 of 631 (91.76 %), functions 168 of 170 (98.82 %) |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `cfb0811f836f456ceefd098f4b54ca50072cdfe9`; tests 3080, pass 3027, fail 0, skipped 53; all files 99.33% lines, 92.74% branches, 99.00% functions.
- `npm run openspec -- validate --all --strict --no-interactive`: passed, `Totals: 70 passed, 0 failed (70 items)`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 65 file(s); every pass summary file is valid: 45 file(s); every route file is valid: 2 file(s).`.
- Spec diff against the merge base `803c70575499` with `origin/dev`: `openspec/specs/git-workspace-port/spec.md | 66 +++++++++++++++++++++++++++++--`, `1 file changed, 63 insertions(+), 3 deletions(-)`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18236-6bcc-7be2-a94b-9740320041c8` | 0 | 0 | 5 | 0 |
| 2 | B | `claude claude-opus-5-5#high` | `d3d895f6-cd86-4187-b164-c27c38b721aa` | 0 | 0 | 2 | 4 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a18251-3ace-7b90-bdd1-1cc3f82aa195` | 0 | 0 | 0 | 0 |
<!-- make record: end -->

## Review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox (`codex gpt-6.1-sol#medium`). The route record recommends `high` for pass 1; it only recommends (governance "Routed effort").
- Invocation, run by the coordinator session: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the Codex session ran `gpt-6.1-sol` with reasoning effort `medium`, as the coordinator's pass report states.
- Session: `01a18236-6bcc-7be2-a94b-9740320041c8`.
- Reviewed: `803c7057..ba442610`. Snapshot of the worktree before and after the pass: `7b8c4bd558d046c4f7f11a1e388da32bb4ce8a3c5fc4f112ba939689bea8eca0` both times, so the reviewer changed no file.
- Counts: Critical 0, High 0, Medium 5, Low 0, as in `passes.jsonl`. The reviewer wrote in Bulgarian; the findings below and in `findings.jsonl` are the author's English summaries.

Findings and resolutions, all fixed in `683feb1c` (design decisions 6 and 9 updated in `501840c6`):

1. **Medium, contract-drift** (`git-workspaces.ts:265`): the remote head was parsed from the already scrubbed `ls-remote` output, so a short valid secret such as `task` corrupted the ref (`refs/heads/<redacted>elith/...`) and the head read `null`, or corrupted an object name into `internal`. Fixed: `GitRunner.runParsed` hands the raw output to a parser inside the runner and scrubs only its failure message; `run` still returns scrubbed output. Tests: "a short read secret that matches the task branch ref still reads the remote head" (adapter, through the smart-HTTP remote), "a parser reads the raw output, so a short secret cannot corrupt the data" (a secret inside both the ref and the object name), and "a parser failure is scrubbed, and a failed process is not parsed".
2. **Medium, error-handling** (`git-runner.ts:67`): a time limit above 2,147,483,647 ms passed validation, and `setTimeout` fires it after 1 ms. Fixed: such a limit is a `RangeError` (`MAX_GIT_TIME_LIMIT_MS`). Test: "the time limit is ten minutes by default and must fit the timer" accepts the maximum and refuses one more and `Number.MAX_SAFE_INTEGER`.
3. **Medium, redaction** (`git-runner.ts:114`): the time limit message was not scrubbed, so a credential form inside the client path (secret `git` in `/usr/bin/git`) or the limit could leak. Fixed: the runner scrubs each whole composed message, the time limit and the start failure, path included. Tests: "the time limit message is scrubbed of a credential form in the client path" and "a client that cannot start is unavailable, its message scrubbed".
4. **Medium, test-flakiness** (`git-runner.test.ts:197`): the runner test relied on the shell recording its pids before a real 1000 ms timer, with no upper bound on the termination. Fixed: an injected `GitTimer` (`GitWorkspacesOptions.gitTimer`, `GitRunner.withTimer`), fired after the client recorded its pids; a 30 s watchdog and cleanup on failure. "the system timer expires after its delay unless disarmed" and "a time limit set later keeps the injected timer" cover the default timer and the composition.
5. **Medium, test-flakiness** (`remote-operations.test.ts:256`): the stalled `prepare` and `readRemoteHead` tests relied on the request reaching the server before a real 1500 ms timer. Fixed: the server's `beforeAnswer` hook signals the request, then the test fires the injected timer; a 30 s watchdog bounds the operation, and cleanup expires the timer.

Fail-before of the fixes: on the working tree of `683feb1c` with fixes 1 to 3 reverted in the source (the range bound, both message scrubs, and `#remoteHead` back on `run` with the scrubbed output), then restored (`git diff` empty), `npm run build` and `node --experimental-strip-types --test packages/adapters/git-workspace/test/git-runner.test.ts packages/adapters/git-workspace/test/remote-operations.test.ts` gave tests 35, pass 31, fail 4: "a client that cannot start is unavailable, its message scrubbed", "a short read secret that matches the task branch ref still reads the remote head", "the time limit is ten minutes by default and must fit the timer", and "the time limit message is scrubbed of a credential form in the client path". With the fixes: tests 35, pass 35. Findings 4 and 5 are timing races, which no test can make fail on demand; their tests now have no race left to lose. The raw-output parser test passes without fix 1 because the runner gained `runParsed` with the fix; the adapter test is the fail-before test of finding 1.

Route: the fixes changed the diff, but worker step 4 asks for a new route only after fixes of the pre-review `make verify` run, not after review fixes (finding 5 of `route-reviewers-by-change-complexity`, pass 2), so `route.json` stays the pre-review record of `fcf5a2f4`.

### Pass 2

- Reviewer B: Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed (`claude claude-opus-5-5#high`). The route record recommends `xhigh` for pass 2; it only recommends (governance "Routed effort").
- Invocation, run by the coordinator session: `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`.
- Model confirmation: the session's `modelUsage` names only `claude-opus-5-5`.
- Session: `d3d895f6-cd86-4187-b164-c27c38b721aa`.
- Reviewed: `803c7057..54780a6a`. Snapshot of the worktree before and after the pass: `9e11e44a317cc3f8c0f62f2532976458c87d4cc7fc1833a8cdcf4bdd254160e1` both times, so the reviewer changed no file.
- Pass 1 findings: the reviewer confirmed all 5 fixed.
- Counts: Critical 0, High 0, Medium 2, Low 4, as in `passes.jsonl`. M2, L2, L3, and L4 were present at `ba442610`, so `findings.jsonl` records them as missed by pass 1 (reviewer A); M1 and L1 came from the pass 1 fix.

Findings and resolutions:

1. **M1, Medium, spec-wording** (`specs/git-workspace-port/spec.md:47`): the pass 1 fix let the parser read raw output, but the living requirement "Scrubbed Git output" still demanded scrubbing every standard output of a process with the credential, and the delta did not modify it. Fixed in `ab145df9`: the delta modifies that requirement (a parser in the runner reads the raw output, and only its value leaves unscrubbed; failure messages are scrubbed whole with their details), with the scenarios "Short secret in the task branch ref" and "Short secret in a failure message"; `npm run verify:archive` passes, so the archived requirement stays under 500 characters.
2. **M2, Medium, redaction** (`git-runner.ts:171`): `succeeded()` composed the failure message outside the runner, so its fixed text and exit code were not scrubbed. Fixed in `4bb55a92`: `GitRunner.runChecked` and `runParsed` compose the message from the raw standard error and scrub the whole message once; the push and the clone, the processes besides `ls-remote` that carry a credential, use `runChecked`, and `succeeded` remains only for local processes. Test: "a failure message is scrubbed whole, its fixed text and exit code included" (secret `128`, exit code 128).
3. **L1, Low, redaction** (`git-runner.ts:110`): `runParsed` passed a parser's failure details through unscrubbed. Fixed in `4bb55a92`: every detail value is scrubbed. Test: "a parser failure is scrubbed with its details, and a failed process is not parsed".
4. **L2, Low, redaction** (`git-fixture.ts:180`): the header echo answered only `git-upload-pack`, so the push case failed in its `ls-remote` and `git push` never met it. Fixed in `4bb55a92`: the echo can name one service; the push case echoes from `git-receive-pack` and asserts that the message is the push's own ("the push failed ..."), with `<redacted>` and no form.
5. **L3, Low, error-handling** (`git-workspaces.ts:266`): a push that the remote took but whose answer was lost returned `remote-moved`, and a push killed at its time limit waited up to a second full limit on the re-read. Fixed in `4bb55a92`: a re-read that equals the pushed head returns the head, and a time-limit failure, which the runner marks (`exceededTimeLimit`), skips the re-read. Tests: "a push whose answer is lost after the remote took it returns the head" (the fixture serves the `git-receive-pack` request and then destroys the connection) and "a stalled remote fails push as unavailable at the time limit and kills its process group" (a stalled `git-receive-pack`, the injected timer fired after the server's `beforeAnswer` signal, and no Git process after the push).
6. **L4, Low, evidence-mismatch** (`verification.md:35`): the fail-before record counted 30 failures but named 29 and called all 126 passing tests those of 16b. Fixed in `cdc72db4` under "Fail-before".

Fail-before of the fixes: on the working tree of `cdc72db4` with `packages/adapters/git-workspace/src` restored from `54780a6a`, then from `HEAD` (`git status` clean for the source), `npm run build` and `node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/git-runner.test.ts packages/adapters/git-workspace/test/remote-operations.test.ts` gave tests 38, pass 33, fail 5: "a failure message is scrubbed whole, its fixed text and exit code included", "a parser failure is scrubbed with its details, and a failed process is not parsed", "a parser reads the raw output, so a short secret cannot corrupt the data" (its new `runChecked` assertion), "a push whose answer is lost after the remote took it returns the head", and "a stalled remote fails push as unavailable at the time limit and kills its process group". With the fixes: tests 38, pass 38. The push case of the echo test (L2) passes without the source fixes, because the stderr scrub already covered what `git push` printed; it fixes the test's coverage, not the code.

Pass 3: required (governance "Conditional third pass"), because the pass 2 fixes change source and a spec delta, not only records and documentation; reviewer A confirms.

### Pass 3

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox (`codex gpt-6.1-sol#medium`).
- Invocation, run by the coordinator session: `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Model confirmation: the Codex session ran `gpt-6.1-sol` with reasoning effort `medium`, as the coordinator's pass report states.
- Session: `01a18251-3ace-7b90-bdd1-1cc3f82aa195`.
- Reviewed head `0c881f71`; scope: confirm the pass 2 fixes and look for regressions they introduced. Snapshot of the worktree before and after the pass: `af0b04a7e1838902c8a0b4535be3fba50b0c5610b874a9f9493a77a4a22e16b8` both times, so the reviewer changed no file. The reviewer ran no tests.
- Result: all six pass 2 findings (M1, M2, L1, L2, L3, L4) confirmed fixed; no regression. Counts: Critical 0, High 0, Medium 0, Low 0, as in `passes.jsonl`; `findings.jsonl` has no line for the pass. The reviewer wrote in Bulgarian; this is the author's English summary.
- Contract section 8: the reviewer accepted the author's call (L3) that a push whose answer was lost returns the head when the re-read remote head equals the pushed commit. After a push with the required ancestry check and exact lease, that read confirms the intended remote state, though not who wrote the identical commit; the spec delta states the behavior.

The review is complete: pass 3 found nothing, and governance allows at most three passes.

## Limitations

- Ran on Linux with the host's Git 2.55.0 behind a recording wrapper, not with the pinned Linux Git 2.43.0 or Apple's 2.50.1, and not natively on macOS; the test remote is plain HTTP on `127.0.0.1` with the policy `https-or-loopback-http`, so the HTTPS transport itself did not run.
- The adapter has no logger; the "no secret in a log" test of contract section 13 checks its failure messages, the text a worker log would receive. The worker log itself is 16e's wiring and the Linux test of 16d.
- The ancestry walk reads the whole history, one process per generation, when the clone holds the expected head but the head does not descend from it (design, "Risks").
- 6 conformance cases stay skipped with their reason (16d).

## Follow-ups

- `http.lowSpeedLimit` and `http.lowSpeedTime`, so that a remote that trickles bytes fails before the 10-minute limit (decision Q2 (a) left them out).
- Item 20: the control plane sends the canonical remote URL, because a redirecting remote now fails as `unavailable` (decision Q1 (a), item 9a's follow-up).

## Archive checks

Run on 2026-10-28 on the tree of this archive commit, the archive of `c34811a1` on merge base `803c7057` with `origin/dev`:

- `npm run openspec -- archive implement-git-remote-operations --yes`: archived as `2026-10-28-implement-git-remote-operations`; `git-workspace-port` 4 added, 3 modified; task status complete.
- `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 70 passed, 0 failed (70 items)`.
- `npm run openspec -- validate --archived --no-interactive`: this change's line `✓ change/2026-10-28-implement-git-remote-operations`; the command as a whole gave 225 passed, 14 failed, all 14 older archived changes already on `dev`.
- `git diff 803c7057 -- openspec/specs`: only `openspec/specs/git-workspace-port/spec.md`, 63 insertions and 3 deletions: the 4 added requirements of the delta ("Git adapter remote operations", "Leased push outcome", "Run credential to the bound remote only", "Git process time limit") and the 3 modified ones ("Git configuration scope", "Conformance run of the local operations", "Scrubbed Git output").
- The moved change has `findings.jsonl` (11 lines), `passes.jsonl` (3 lines), `checklist.json`, and `route.json`; `make findings ARGS="validate"`: `Every findings file is valid: 65 file(s); every pass summary file is valid: 45 file(s); every route file is valid: 2 file(s).`
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on the clean archive commit before this section and the generated part were written, tree `cfb0811f`: passed, profile full, stamp written; tests 3080, suites 45, pass 3027, fail 0, cancelled 0, skipped 53; all files 99.33 % lines, 92.74 % branches, 99.00 % functions; "Every product module is in the coverage report"; `openspec validate --all --strict` 70 passed, 0 failed; "Every checked link conforms"; "No active OpenSpec change; nothing to archive". "Generated checks" above is `make record` of its log. The archive commit's tree differs from `cfb0811f` only in this file, which `make record-check` accepts.
- `make record-check CHANGE=implement-git-remote-operations`: the generated part matches the tree.

## Remaining gates

- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator; it now includes the remote cases and the smart-HTTP server.
- 16d: the hand-off, the reclaim program and its containment, `WS5` to `WS10`, and the Linux tests in the worker image with the pinned Git, which un-skip the last 6 cases.
- 16e: the worker wiring and admission, the execution group, the single slot, the clone umask, and the macOS composition.
- Integration into dev by the coordinator (single pull request).
