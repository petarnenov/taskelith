# Verification: implement-workspace-handoff-and-reclaim

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16d, developed by a briefed subagent of the worker session Liki for the coordinator Niki: the hand-off with its record and the `handedOff` read, the reclaim program and its containment, the crash points `WS5` to `WS10`, the `reclaim-failed` outcome, the 6 conformance cases deferred to 16d, and the contract's Linux tests in the worker image with its pinned Git (design, decisions 1 to 14). Review pass 1 (reviewer A) ran; its fixes follow.

## Revision

- Base: `dev` `964f0b57`; `origin/dev` `10fc3bbe` (#393 and later) merged in `cf6b3d0b`, one conflict in the `Makefile` `.PHONY` list, resolved by keeping both new targets.
- `e4bd32d4` `chore: start the implement-workspace-handoff-and-reclaim change` (the brief's `checklist.json`, unedited).
- `09884ac3` `chore: hand off and reclaim Git workspaces with the reclaim program`.
- `f056b039` `chore: run the Git workspace Linux tests in the worker image with its pinned Git` (worker image, `make verify-linux-git-workspace`, Linux suite, `.git/config` mode `0660`).
- `cf6b3d0b` the merge of `origin/dev`.
- `34a9773d` `docs: describe the implement-workspace-handoff-and-reclaim change` (proposal, design, spec delta, tasks, empty `findings.jsonl` and `passes.jsonl`, one status sentence in contract section 7). A first `make verify` passed on its clean tree `ad07be3e`.
- `254cf2d7` `docs: route the implement-workspace-handoff-and-reclaim change` (`route.json`, unedited). The first recorded `make verify` ran on its clean tree `275cb48f`, since `make record-check` counts `route.json` as a change of the tree.
- `111235a8` `docs: record the verification of implement-workspace-handoff-and-reclaim`.
- `db767f8f` `chore: bound the reclaim program's wait for go` (coordinator decision Q3: the window `RECLAIM_GO_BOUND_MS`, the `abandoned` outcome, and their tests).
- `e33d2c5f` `docs: record the coordinator decisions of implement-workspace-handoff-and-reclaim` (the coordinator's decisions of 2026-10-28 in the design, contract sections 2, 3, and 9, the spec scenario "No go within the window", and this record). `git fetch origin` showed `origin/dev` still at `10fc3bbe`, so no merge was needed.
- `6b9a59e7` `docs: route the implement-workspace-handoff-and-reclaim change again` (`route.json` deleted and routed again, unedited, because `db767f8f` changed the implementation after the first route, as worker step 4 of the agent task protocol requires).
- `32051372` `docs: record the second route of implement-workspace-handoff-and-reclaim`.
- `2c038591` `chore: type the late-go host of the hand-off tests as a reclaim host` (the first `make verify` after `db767f8f` failed at `tsc -p tsconfig.check.json`: `hand-off.test.ts(233,52): error TS2554: Expected 1 arguments, but got 2.`).
- `613818cd` `docs: route the implement-workspace-handoff-and-reclaim change after the type fix` (routed again, unedited, since `2c038591` changed the diff).
- `1bdc5bab` the merge of `origin/dev` `7efc48d3` (#396, ADR 0016 and the archived `schedule-intent-and-council-gates`, documentation only), without a conflict; it changes no file of this change, so `route.json` stays.
- `fd69f117` `docs: record review pass 1 of implement-workspace-handoff-and-reclaim` (pass 1 of reviewer A on `dcfdf821`: High 1, Medium 6, Low 1).
- `10a95669` `chore: require the containment key in a hand-off record` (finding 8).
- `fe994aa7` `chore: start a reclaim only once its program signals that it is ready` (finding 1).
- `4f620a33` `test: kill a worker process at each hand-off and reclaim crash point` (finding 2).
- `e1a5d52a` `test: wait for the reclaim program's readiness and exit in the Linux tests and observe every output channel for secrets` (findings 1, 2, 3, 4, and 5 in the worker image).
- `962c500d` `docs: record the reclaim program's containment after its readiness in the spec delta and contract` (finding 6).
- `f33090db` the merge of `origin/dev` `a10ceaaf` (#397, `run-reviews-through-make`), with one conflict in the `Makefile` `.PHONY` list, resolved by keeping `review` and `verify-linux-git-workspace`. `route.json` is not routed again: worker step 4 routes before pass 1, and the `make review` route gate runs only before pass 1.
- `5bad0cc4` and `13029b84`, the records of the pass 1 fixes and their `make verify`.
- `aee9571d` `docs: record review pass 2 of implement-workspace-handoff-and-reclaim` (pass 2 of reviewer B on `13029b84`: Medium 4, Low 16).
- `d7b724bb` `chore: give the rewritten repository configuration mode 0660 whatever the umask` (N11).
- `055323b2` `chore: bound the reclaim program's readiness and run and serialize the operations of one workspace` (N1, N2, N6, N9, N10, N12, N13, N17, N20, with the contract section 3 step 7 amendments of the coordinator's decisions on N1 and N6).
- `02391cea` `test: run the whole workspace conformance suite again with an execution account` (N3).
- `70c665f5` `test: check the reclaim program's full identity, the worker capabilities, and the freed cgroup in the Linux tests` (N4, N5, N7, N8, N20).
- `5bd54589` `chore: build the installation images and the worker image through one helper` (N19).
- `eb3e3430` `docs: list make verify-linux-git-workspace and the modified reclaim requirements` (N14, N18).
- The records of the pass 2 fixes, the commit names of N15 and N16 (`e4e1b3f2`), and this record of their `make verify`.
- `8e05da54` the record of the `make verify` after the pass 2 fixes.
- `ae465618` `chore: make the pass 3 hand-off, FIFO, and cgroup fixes deterministic` (P1, P2, P3 of review pass 3 of reviewer A on `8e05da54`: Low 3).

## Environment

Native Ubuntu host, Linux 7.0.0-38-generic x86_64; Node.js 24.22.1 and the npm of the `Makefile` pin; host Git 2.55.0 at `/usr/bin/git`, wrapped and pinned with its own version string by the host tests; Docker with cgroup v2. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`, because this host has an empty `/tmp/.git`. The Linux suite ran in `taskelith-worker:taskelith-665132492-installation-git-workspace`, built by `installation.sh build-worker` from this branch, with `git version 2.43.0` of the package `1:2.43.0-1ubuntu7.4` and Node.js 24.22.1.

## Author self-check

- Scope: hand-off, reclaim, program, hosts, image pin, Linux tests; no worker wiring, slot, `fs.protected_hardlinks`, scan exclusion, or macOS composition (16e). `docs/g3-plan.md` unchanged. No new third-party dependency; no contract document under `packages/contracts/` changed, so `breaking-changes.json` needs no declaration.
- Concurrency: the check for another hand-off and the write of the record are one step of a chain per workspace root (design, decision 2); the conformance case of two concurrent hand-offs passes on the host with an execution account and in the worker image.
- Comments: `npm run verify:comments` passes.
- The coordinator's decisions of 2026-10-28 on Q1 to Q3, deviations A and B, and the reviewer efforts are recorded in the design, "Coordinator decisions (2026-10-28)".

## Fail-before

On the working tree of `f056b039` with `git-workspaces.ts`, `repository-config.ts`, `crash-points.ts`, and `index.ts` of `packages/adapters/git-workspace/src` restored from `964f0b57`, then from `HEAD` (`git status` clean): `npm run build` and `node --experimental-strip-types --test packages/adapters/git-workspace/test/conformance.test.ts packages/adapters/git-workspace/test/hand-off.test.ts packages/adapters/git-workspace/test/reclaim-program.test.ts packages/adapters/git-workspace/test/checkout-safety.test.ts` gave tests 4, pass 0, fail 4: every file failed at import, because the 16c adapter exports no `ProcessGroupReclaimHost` or `LinuxReclaimHost`. The finer fail-before of the configuration mode (deviation A) is the Linux run before the fix: the agent's `git add -A && git commit` failed with `fatal: unable to access '.git/config': Permission denied`, as did the inherited-settings case.

Coordinator decision Q3, the reclaim program's window for `go`: on the tree of `db767f8f` with `packages/adapters/git-workspace/src` restored from `111235a8`, `npm run build` and `node --experimental-strip-types --test packages/adapters/git-workspace/test/hand-off.test.ts packages/adapters/git-workspace/test/reclaim-program.test.ts` gave tests 26, pass 24, fail 2: "a program that misses its window for go fails the reclaim as unavailable and a retry reclaims" failed with `precondition-failed` (a recorded `reclaim-failed`) where `unavailable` was expected, and `reclaim-program.test.ts` failed at import, since `RECLAIM_GO_BOUND_MS` did not exist. With only that constant added to the old `index.ts`, `reclaim-program.test.ts` gave tests 9, pass 7, fail 2: "a program that gets no go within its window exits without a change" (the old program refused `--go-within-ms` as usage, exit code 2, so it had no window) and the argument parsing test. "a program whose worker dies before go exits without a change" passed before the change too: the closed input already ended a program whose worker died, so it guards that behavior without a fail-before. The source was then restored from `db767f8f`.

Review pass 1, each on its fix commit's tree with only `packages/adapters/git-workspace/src` restored, then rebuilt and restored with `git status` clean:

- Finding 8: with `src` of `fd69f117`, `node --experimental-strip-types --test --test-name-pattern=parses.only packages/adapters/git-workspace/test/hand-off.test.ts` gave pass 0, fail 1 (`AssertionError: {"reclaimFailed":false}`, parsed as a record without containment); after `10a95669` pass 1, fail 0.
- Finding 1, host: with `src` of `10a95669` plus only the constant `RECLAIM_READY`, the tests "a launch resolves once the program signals that it is ready, not at its spawn" and "a launch fails as unavailable when the program ends before it is ready" of `reclaim-program.test.ts` gave tests 2, pass 0, fail 2 ("the program ran but was not ready", and "expected a failure"); after `fe994aa7` both pass.
- Finding 1, worker image: with the same `src`, `bash scripts/linux-git-workspace.sh taskelith-worker:taskelith-665132492-installation-git-workspace --test-name-pattern='Linux launch resolves only once|without go in its window'` gave tests 3, pass 0, fail 3: right after `launch` resolved, `reclaim-held` and `reclaim-late-go` held no process (`[]` where `[[10003, '0::/executions/…']]` was expected), so the old launch resolved before the program was in its cgroup; the third failure is the file's `test.after` cleanup, which a failed case leaves an account-owned file for.
- Finding 3: the test's own control, a program that normalizes without `go`, turns the account's `0600` file into `0660` in every run, so a program that ignored `go` would fail the test's mode check.
- Findings 2, 4, 5, and 7 change no behavior; findings 2, 4, and 5 make the tests observe what the contract requires, and finding 7 was declined after the runs below.

Review pass 2, each with only the named source restored, rebuilt, and then restored with `git status` showing only the fix:

- N1, N2, N6, and N20 (abandoned program): with `packages/adapters/git-workspace/src` of `d7b724bb` and the new tests of `055323b2`, `node --experimental-strip-types --test packages/adapters/git-workspace/test/hand-off.test.ts` failed 4 tests: "a program that is not ready within its bound fails the reclaim as unavailable" timed out at its 20 s test timeout (the launch waited for `ready` forever), "a program still running at the run bound fails the reclaim and is left running" timed out at 30 s (the reclaim waited for the exit forever), "a hand-off that meets a running reclaim of its workspace waits until the reclaim is done" failed in 101 ms (the hand-off polled during the reclaim and left the checkout open without a record), and "a program that misses its window for go …" failed on `host.released` (`[]`, the empty containment was not freed). With the fix all 31 tests of the file pass.
- N12: with only the root chain in `#handOff` bypassed (`await this.#recordHandOff(attemptId)` without `inChain`), three runs of the new test "two adapters of one process hand off two workspaces one at a time" and the conformance case "lets one of two concurrent hand-offs through where executions share a separate account" with an execution account each failed both, 3 of 3; the one-account case passed, as it allows both.
- N4: with `process.setgroups!([])` removed from `reclaim-program.ts` and `npm run build`, `make verify-linux-git-workspace PATTERN='execution account|without go|surviving|capabilities'` gave tests 32, pass 28, fail 4: the three tests that read the program's identity failed with `groups: [10003]` where `[]` was expected (uids and gids were `10003` in all four fields), plus a file-level cleanup error of the aborted case; the capability test passed. The line was restored before any commit.
- N11: with `repository-config.ts` of `HEAD` before `d7b724bb`, the new test under umask `0022` failed (`416 !== 432`, mode `0640` where `0660` was expected); with the fix both umask tests pass.
- N3, N5, N7, N8, N13, and N17 add or tighten tests of behavior that already held; N9, N10, N14 to N16, and N18 are records and documentation; N19 keeps the script's behavior, which `test/installation-script.test.ts` (26 of 26) checks.

Review pass 3, each on the tree of `ae465618` with one change undone, rebuilt, and then restored with `git status` clean:

- P1: with `#inWorkspaceChain` running its work without the chain, three runs of "a hand-off that meets a running reclaim of its workspace waits until the reclaim is done" each failed in about 120 ms (`'polled during the release'` where `'queued'` was expected), 3 of 3; with the chain the test passes in about 100 ms.
- P2: with `readFifo` reading through `readFile` again and the new test's timeout at 600 ms, `make verify-linux-git-workspace PATTERN='without a writer'` reported the test timed out after 600 ms, but the test file's process stayed alive for 67 s more and then failed with "Promise resolution is still pending but the event loop has already resolved"; with the killable reader the test passes in about 600 ms.
- P3: with the removal after the program's exit deleted from `LinuxReclaimHost.launch`, `make verify-linux-git-workspace PATTERN='not ready frees'` failed: `reclaim-entered was never freed`; with it the test passes.

## After the change

- Host, after `npm run build`: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 181, pass 181, fail 0, skipped 0, before the configuration-mode test was added; `make verify` below includes all of them.
- Host, after `db767f8f`: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 185, pass 185, fail 0, skipped 0.
- Worker image, first run: `bash scripts/linux-git-workspace.sh taskelith-worker:taskelith-665132492-installation-git-workspace` on the tree of `f056b039` gave tests 35, pass 35, fail 0 (the image pin, the 26 conformance cases with the real execution account, and the 8 tests of contract section 13).
- Worker image, after `db767f8f`: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-git-workspace` built `taskelith-worker:taskelith-665132492-installation-git-workspace` (image `sha256:f9a4bacd6ddd`) with `installation.sh build-worker`, whose Git is `git version 2.43.0` of the package `1:2.43.0-1ubuntu7.4`, with Node.js v24.22.1, and gave tests 36, pass 36, fail 0, skipped 0: the 35 above and "a reclaim program without go in its window or with a dead worker empties its cgroup unchanged", which runs the fixed program as the execution account in its cgroup with a 500 ms window, and a launcher killed by `SIGKILL` before `go`. The suite stays opt-in, outside `make verify` (coordinator decision Q2).

- Host, after the pass 1 fixes: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 189, pass 189, fail 0, skipped 0, three runs of `hand-off.test.ts` and `reclaim-program.test.ts` in a row 38 of 38 each; with `TMPDIR` unset (the default `/tmp`, whose `/tmp/.git` is empty) 189 of 189, and with `TMPDIR` inside a directory that `git init` made a repository with `core.hooksPath` set 189 of 189 (finding 7).
- Worker image, after the merge `f33090db`: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-git-workspace` built `taskelith-worker:taskelith-665132492-installation-git-workspace` (image `sha256:046ea37357f8`) and gave tests 37, pass 37, fail 0, skipped 0: the 36 above, with the surviving program now crashed by `SIGKILL`, the program without `go` rewritten (finding 3), and the redaction test widened (finding 5), plus "a Linux launch resolves only once its program is in its cgroup as the execution account".
- Host, after the pass 2 fixes: `hand-off.test.ts` 31 of 31, `conformance.test.ts` 52 of 52 (26 cases twice), the two umask tests of `checkout-safety.test.ts`, and `test/installation-script.test.ts` 26 of 26.
- Worker image, after the pass 2 fixes, on the source of `eb3e3430`: `make verify-linux-git-workspace` rebuilt `taskelith-worker:taskelith-665132492-installation-git-workspace` through the shared `build_stages` helper and gave tests 39, pass 39, fail 0, skipped 0: the 37 above, with the full identity checks, plus the capability test and the freed-cgroup test.
- Host, after the pass 3 fixes: `hand-off.test.ts` 31 of 31.
- Worker image, after the pass 3 fixes, on the source of `ae465618`: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-git-workspace` gave tests 41, pass 41, fail 0, skipped 0: the 39 above plus the FIFO bound test and the not-ready cgroup test.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `e4e1b3f2`, after the pass 2 fixes, tree `a4b9e286` | Passed, profile full, stamp written: tests 3296, suites 46, pass 3249, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.82 % branches, 98.88 % functions. `git fetch origin` showed `origin/dev` still at `a10ceaaf`, so no merge was needed. `make record` of this run is under "Generated checks" |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `5bad0cc4`, after the pass 1 fixes and the merge `f33090db`, tree `e88eafd3` | Passed, profile full, stamp written: tests 3271, suites 46, pass 3224, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.82 % branches, 98.93 % functions. `make record` of this run is under "Generated checks" |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `d7a1b785`, after the merge `1bdc5bab`, tree `e1c9f859` | Passed, profile full, stamp written: tests 3233, suites 46, pass 3186, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.82 % branches, 98.95 % functions |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `ae323e15`, tree `56041e78` | Passed, profile full, stamp written: tests 3233, suites 46, pass 3186, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.80 % branches, 98.93 % functions. |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `254cf2d7`, tree `275cb48f` | Passed, profile full, stamp written: tests 3230, suites 46, pass 3183, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.80 % branches, 98.93 % functions. |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `34a9773d`, tree `ad07be3e` | Passed, profile full: the same counts; 98.95 % functions |
| Coverage of `packages/adapters/git-workspace/dist/**`, summed from `coverage/lcov.info` of the recorded run | `254cf2d7` | lines 1610 of 1635 (98.47 %), branches 773 of 839 (92.13 %), functions 229 of 235 (97.45 %) |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-worker-image-reproducible` | `db767f8f` with the uncommitted records | Failed: `installation.sh: two builds of one revision gave sha256:036dad823c49… and sha256:abc511323824…`. Diagnosis: two full `docker build --no-cache --target worker` builds of an archive of `db767f8f` with the `Makefile` pins and its commit time as `SOURCE_DATE_EPOCH` gave one image manifest, `sha256:e20064fc9b01…`, with one config, `sha256:606bd09d676a…`, and the same 7 layers, the Git layer included. Only the provenance attestation manifest that BuildKit attaches by default differed (`sha256:8d880a23f93f…` and `sha256:b4d0c9179ba7…`), and on this host's Docker 29.8.2 with the containerd image store, buildx 0.37.1, `docker image inspect .Id` is the digest of the index that holds both. So the Git step is reproducible, and the check fails on this host for every revision; it is not fixed here (out of scope) |
| `make findings ARGS="route --change implement-workspace-handoff-and-reclaim"`, again after `db767f8f` | `e33d2c5f` | The same result: "route: elevated (lines, files, contracts, docker, size), rule version 1"; reviewer A `codex gpt-6.1-sol#high`, reviewer B `claude claude-opus-5-5#xhigh`; shadow `jev-1.14.0` agrees; committed unedited as `6b9a59e7`; routed once more after `2c038591` with the same result, committed unedited as `613818cd` |
| `make findings ARGS="route --change implement-workspace-handoff-and-reclaim"` | `34a9773d` | "route: elevated (lines, files, contracts, docker, size), rule version 1"; pass 1 reviewer A `codex gpt-6.1-sol#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`; shadow agrees; recommendation only, committed unedited as `254cf2d7`. The coordinator decided on 2026-10-28 that the review runs at the brief's efforts, reviewer A `codex gpt-6.1-sol` medium and reviewer B `claude claude-opus-5-5` high, since "Routed effort" is not authorized yet |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a4b9e286a52188def6a81615d849eec42db270e2`; tests 3296, pass 3249, fail 0, skipped 47; all files 99.36% lines, 92.82% branches, 98.88% functions.
- `npm run openspec -- validate implement-workspace-handoff-and-reclaim --strict`: passed, `Change 'implement-workspace-handoff-and-reclaim' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 74 file(s); every pass summary file is valid: 54 file(s); every route file is valid: 10 file(s).`.
- Spec diff against the merge base `a10ceaaf860c` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a182da-55e4-7800-adb1-5c516c82d86f` | 0 | 1 | 6 | 1 |
| 2 | B | `claude claude-opus-5-5#high` | `61a1d4a6-99ed-4830-8b00-9f5ff4d90fc2` | 0 | 0 | 4 | 16 |
<!-- make record: end -->

## Contract amendments

- Coordinator decision on N1 (2026-10-28, confirmed): contract section 3, step 7, bounds the wait for `ready` by `RECLAIM_READY_BOUND_MS`, 60 s, after which the worker abandons the program and `reclaim` fails with `unavailable`, next to the 60 s `go` bound; spec scenario "Program not yet ready".
- Coordinator decision on N6 (2026-10-28, confirmed, option (a)): contract section 3, step 7, records a program still running `RECLAIM_RUN_BOUND_MS`, 10 min, after `go` as failed without killing it, and leaves its cleanup to 16e; spec scenario "Program past its run bound". Both are in `055323b2`; nothing under `packages/contracts/` changes, so `breaking-changes.json` needs no declaration.

## Limitations

- The Linux suite ran in the worker image with the repository's host-built `dist` mounted read-only, not with the image's own build.
- The scan's exclusion of a recorded containment, the start check of `fs.protected_hardlinks`, the slot admission with `worker-slots-exhausted`, and the worker's umask and supplementary group are 16e's; the Linux tests set the umask and the group themselves.
- The adapter has no logger; "no secret in a log" checks every result and failure message, the runner's scrubbed output, the worker's stdout and stderr, every Git process's argv, and every file under the data root. Git's raw output before the runner's redaction carries an echoed credential by design and is not checked.
- The worker image covers the real `SIGKILL` crash only at `WS8`, with a surviving program; the 13 crash points run killed on the host with the process-group host.
- A program left running past `RECLAIM_RUN_BOUND_MS` keeps its workspace handed off and its slot held; 16d does not clean it up (coordinator decision N6).
- The host's adapter tests still put their data roots under `TMPDIR` (carried from 16c); the new Linux tests do not.

## Remaining gates

- `make verify-worker-image-reproducible` compares index digests, which differ by the default provenance attestation on a Docker host with the containerd image store; fixing the check, for example with `--provenance=false` or by comparing the image manifest, is for the coordinator to assign.

- 16e: killing a program left running past `RECLAIM_RUN_BOUND_MS`, freeing its slot, and any retry (coordinator decision N6), and freeing the empty cgroup of a failed program.
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator.
- 16e: the worker wiring and admission.
- Integration into `dev` by the coordinator.
