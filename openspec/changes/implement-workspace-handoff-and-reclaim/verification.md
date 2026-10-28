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

## After the change

- Host, after `npm run build`: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 181, pass 181, fail 0, skipped 0, before the configuration-mode test was added; `make verify` below includes all of them.
- Host, after `db767f8f`: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 185, pass 185, fail 0, skipped 0.
- Worker image, first run: `bash scripts/linux-git-workspace.sh taskelith-worker:taskelith-665132492-installation-git-workspace` on the tree of `f056b039` gave tests 35, pass 35, fail 0 (the image pin, the 27 conformance cases with the real execution account, and the 7 tests of contract section 13).
- Worker image, after `db767f8f`: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-git-workspace` built `taskelith-worker:taskelith-665132492-installation-git-workspace` (image `sha256:f9a4bacd6ddd`) with `installation.sh build-worker`, whose Git is `git version 2.43.0` of the package `1:2.43.0-1ubuntu7.4`, with Node.js v24.22.1, and gave tests 36, pass 36, fail 0, skipped 0: the 35 above and "a reclaim program without go in its window or with a dead worker empties its cgroup unchanged", which runs the fixed program as the execution account in its cgroup with a 500 ms window, and a launcher killed by `SIGKILL` before `go`. The suite stays opt-in, outside `make verify` (coordinator decision Q2).

- Host, after the pass 1 fixes: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 189, pass 189, fail 0, skipped 0, three runs of `hand-off.test.ts` and `reclaim-program.test.ts` in a row 38 of 38 each; with `TMPDIR` unset (the default `/tmp`, whose `/tmp/.git` is empty) 189 of 189, and with `TMPDIR` inside a directory that `git init` made a repository with `core.hooksPath` set 189 of 189 (finding 7).
- Worker image, after the merge `f33090db`: `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify-linux-git-workspace` built `taskelith-worker:taskelith-665132492-installation-git-workspace` (image `sha256:046ea37357f8`) and gave tests 37, pass 37, fail 0, skipped 0: the 36 above, with the surviving program now crashed by `SIGKILL`, the program without `go` rewritten (finding 3), and the redaction test widened (finding 5), plus "a Linux launch resolves only once its program is in its cgroup as the execution account".

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` | `d7a1b785`, after the merge `1bdc5bab`, tree `e1c9f859` | Passed, profile full, stamp written: tests 3233, suites 46, pass 3186, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.82 % branches, 98.95 % functions. `make record` of this run is under "Generated checks" |
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

- `make verify`: passed, profile full, tree `e1c9f859477f0defc7bff2e53a6f9a07362501bf`; tests 3233, pass 3186, fail 0, skipped 47; all files 99.38% lines, 92.82% branches, 98.95% functions.
- `npm run openspec -- validate implement-workspace-handoff-and-reclaim --strict`: passed, `Change 'implement-workspace-handoff-and-reclaim' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 73 file(s); every pass summary file is valid: 53 file(s); every route file is valid: 9 file(s).`.
- Spec diff against the merge base `7efc48d330b4` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The Linux suite ran in the worker image with the repository's host-built `dist` mounted read-only, not with the image's own build.
- The scan's exclusion of a recorded containment, the start check of `fs.protected_hardlinks`, the slot admission with `worker-slots-exhausted`, and the worker's umask and supplementary group are 16e's; the Linux tests set the umask and the group themselves.
- The adapter has no logger; "no secret in a log" checks every result and failure message, the runner's scrubbed output, the worker's stdout and stderr, every Git process's argv, and every file under the data root. Git's raw output before the runner's redaction carries an echoed credential by design and is not checked.
- The worker image covers the real `SIGKILL` crash only at `WS8`, with a surviving program; the 13 crash points run killed on the host with the process-group host.
- A program that hangs before its readiness signal keeps `launch` waiting; `launch` has no bound of its own.
- The host's adapter tests still put their data roots under `TMPDIR` (carried from 16c); the new Linux tests do not.

## Remaining gates

- `make verify-worker-image-reproducible` compares index digests, which differ by the default provenance attestation on a Docker host with the containerd image store; fixing the check, for example with `--provenance=false` or by comparing the image manifest, is for the coordinator to assign.

- Review pass 2 (reviewer B), and pass 3 if required.
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator.
- 16e: the worker wiring and admission.
- Integration into `dev` by the coordinator.
