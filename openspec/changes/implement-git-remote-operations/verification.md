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
- The commit that completes this record changes no checked input other than this file.

## Environment

Native Ubuntu 26.04.1 LTS host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 (`nvm use`, as the `Makefile` pins); host Git `git version 2.55.0` at `/usr/bin/git`, which the tests wrap and pin with its own version string and which serves the test remote through `git http-backend`; libcurl 8.18.0; Perl for the recording wrapper. `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`. The Linux pin `git version 2.43.0` and Apple's 2.50.1 did not run.

## Author self-check

- Scope: only `readRemoteHead`, the push, the time limit, the redirect setting, and the smart-HTTP fixture; no hand-off, reclaim, or wiring; `docs/g3-plan.md` unchanged; the contract changed only as decisions Q1 (a) and Q2 (a) say (sections 7 and 13, and one revision sentence in its header). No new third-party dependency; the dependency inventory is unchanged.
- Push arguments: exactly `taskBranchPushArguments`, no `-C`, started in the checkout; no bare `--force`, bare `--force-with-lease`, `+` refspec, or cancelling option anywhere (`grep -n "force" packages/adapters/git-workspace/src/*.ts` finds only `rm` options; the lease comes from `taskBranchPushArguments`).
- Crash points: contract section 3 names none for the remote operations (design D7), so none was added.
- Comments: at most two lines of at most 80 characters (`npm run verify:comments`).
- Tests: no fixed sleep; the two tests that wait for a killed process group poll a condition (`kill` with signal 0 until `ESRCH`) with a 30 s deadline; the time limits under test are 1000 ms (runner) and 1500 ms (adapter), far above the milliseconds the shell or the Perl wrapper needs before the stalled process starts, and each test asserts that its stalled process was recorded and its request reached the remote, so an early kill cannot pass it.
- Checklist categories: contract-drift (Q1 and Q2 amend section 7 with what the code does; D2, D3, and D6 name every detail the adapter settled); error-handling (D2, D3, D6: every Git failure maps to `unavailable` or `internal`, unreadable output to `internal`); spec-wording (each new requirement is under 500 characters with a scenario that a named test checks); redaction (D9); missing-fail-before-test (below); concurrency-race (the lease race test drives the race through the server's hook, without timing).

## Fail-before

On `5f6f2565`, after `npm run build`: `node --experimental-strip-types --test --test-reporter=spec packages/adapters/git-workspace/test/*.test.ts packages/modules/workspace/test/workspace-domain.test.ts` gave tests 162, pass 126, fail 30, skipped 6. The failures: the 9 un-skipped conformance cases and the 15 new adapter tests of `remote-operations.test.ts` and "a commit whose bytes do not hash to its name fails the push ancestry check", each with `Error: not implemented` from the `readRemoteHead`, `push`, or `withTimeLimit` stub; "a commit names its parents right after its tree" (stub); "the time limit is ten minutes by default and must be a positive whole number" (stub); "the built Git environment holds the contract settings, the header last" (the missing `http.followRedirects=false`); and "a process past its time limit is killed with its group, remote unavailable, local internal", which the stub runner never killed: the test's 60 s timeout marked it failed, and the test file's process waited for the stub's `sleep 600` child until the author killed it, so the run took about 325 s. The 126 passing tests are those of 16b, which still pass over the smart-HTTP fixture.

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

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `7f9bda428f9e92934dc9108c337e35bea0a6a640`; tests 3071, pass 3018, fail 0, skipped 53; all files 99.33% lines, 92.76% branches, 99.00% functions.
- `npm run openspec -- validate implement-git-remote-operations --strict`: passed, `Change 'implement-git-remote-operations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 65 file(s); every pass summary file is valid: 45 file(s); every route file is valid: 2 file(s).`.
- Spec diff against the merge base `803c70575499` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Review

No review pass has run yet; `passes.jsonl` and `findings.jsonl` are empty.

## Limitations

- Ran on Linux with the host's Git 2.55.0 behind a recording wrapper, not with the pinned Linux Git 2.43.0 or Apple's 2.50.1, and not natively on macOS; the test remote is plain HTTP on `127.0.0.1` with the policy `https-or-loopback-http`, so the HTTPS transport itself did not run.
- The adapter has no logger; the "no secret in a log" test of contract section 13 checks its failure messages, the text a worker log would receive. The worker log itself is 16e's wiring and the Linux test of 16d.
- The ancestry walk reads the whole history, one process per generation, when the clone holds the expected head but the head does not descend from it (design, "Risks").
- 6 conformance cases stay skipped with their reason (16d).

## Follow-ups

- `http.lowSpeedLimit` and `http.lowSpeedTime`, so that a remote that trickles bytes fails before the 10-minute limit (decision Q2 (a) left them out).
- Item 20: the control plane sends the canonical remote URL, because a redirecting remote now fails as `unavailable` (decision Q1 (a), item 9a's follow-up).

## Remaining gates

- Review passes: reviewer A (pass 1) and reviewer B (pass 2), and pass 3 only as governance requires.
- Integration into dev by the coordinator (single pull request).
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator; it now includes the remote cases and the smart-HTTP server.
- 16d: the hand-off, the reclaim program and its containment, `WS5` to `WS10`, and the Linux tests in the worker image with the pinned Git, which un-skip the last 6 cases.
- 16e: the worker wiring and admission, the execution group, the single slot, the clone umask, and the macOS composition.
