# Verification

Date: 2026-10-28. The author's verification, the evidence runs, `make verify`, and the fixes of review passes 1 and 2 are recorded below.

## Scope and source

Worker Pepi's brief of 2026-10-28 from coordinator Niki for G3 item 43 (`docs/g3-plan.md`), the `macos-26-x86_64` part of `complete-g2-native-acceptance-rows`, size M-L, commit types `test`, `chore`, and `docs`. The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/complete-g2-native-acceptance-rows-macos` on branch `complete-g2-native-acceptance-rows-macos`, modelled on the archived Linux part (`openspec/changes/archive/2026-10-28-complete-g2-native-acceptance-rows/`).

- **Base revision:** `f6696995` (`origin/dev`, merge of pull request #384).
- **Scope:** the G2 scenario helpers `test/g2-scenarios/scenario-launch.ts`, `scenario-worker.ts`, `scenario-run.ts`, and `leftover-processes.ts`; `test/g2-cancellation-races.test.ts` (race g, the guard, the forged start's platform); `test/g2-scenario-launch.test.ts`; `scripts/native-acceptance.sh` and `test/native-acceptance-runner.test.ts`; the `Makefile` target `verify-macos-g2-scenarios`; `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 row of `docs/g3-plan.md`; the two spec deltas.
- **Out of scope, open under item 43:** `macos-26-arm64` with its process ownership re-run (needs the owner's physical access to the MacBook Air), `linux-ubuntu-24.04-arm64`, and the hosted `ubuntu-24.04` re-dispatch. No product code changed.

## Revision

- `67cb1122`: the test tooling, target, runner, and `docs/local-installation.md`; the evidence runs ran on this commit.
- The next commit adds the OpenSpec records, `results.jsonl`, `acceptance.md`, and the `docs/worker-platforms.md` and `docs/g3-plan.md` edits; it changes no file that the evidence runs execute.
- Review pass 1 fixes: `f62ce2d1` (race g's recovery hold, M1), `5774715e` (the macOS guard's unit tests, M2), `911d75d8` (L1), and `8796da32` (L2). The evidence runs were repeated on `8796da32`; the records commit after it changes no file that they execute.
- Review pass 2 fixes: `afbd5542` (race g's cancel file before adoption and its waits, M-A and M-B) and `0bef214b` (the guard and the process listing, L-2 to L-5) change test code; the evidence runs were repeated on `0bef214b`. The records commits after it change no file that the runs execute.

## Environment

macOS 26.6.2 (25G83), Darwin 25.6.0, x86_64 (2020 Intel iMac), APFS boot data volume; Node.js 24.22.1 (`.nvmrc`); Docker Desktop 4.75.0 (227598), Engine 29.5.2, Compose 5.1.3. Every Docker run of this change (the scenario runs, the evidence runs, and `make verify`'s `make test`) held the host-wide Docker slot (`scripts/docker-slot.ts run`).

## Author self-check

- **Composition.** Under `TASKELITH_MACOS_SCENARIOS=1` the scenario workers compose `supervisionHost` of `apps/worker`, as `apps/worker/src/main.ts` does, with the worker's admission check and the real volume probe; no product file changed (`git diff f6696995 --stat -- apps packages` is empty).
- **`make verify` unchanged on macOS.** Without the variable the scenario files still skip on macOS with their reason, so the hang that led to `6d40c0c4` cannot return through `make verify` ([design](design.md) decision 1).
- **Race g follows the contract.** The `uncertain` execution after the released child is the recovery table's row "macOS, same boot, `handle` present: the child's identity is not alive" (supervisor identity contract section 6), and the not-applied cancel is section 8; neither is a product defect.
- **Test authoring.** The new waits poll conditions the work signals (`waitFor`), with bounds of 20 s to 90 s; race g as a whole took 5.1 s and 6.1 s in the evidence runs on `0bef214b` and its `uncertain` wait is 90 s, under a test bound of 400 s that exceeds the sum of its waits (review pass 2, M-B); no sleep synchronizes. Race g kills only the supervisor whose command line names its own worker's data root.
- **Requirement length.** Under 500 characters each; `npm run verify:archive`, inside `make verify`, archives the change in a temporary copy into strictly valid specs.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `test` and `docs`, without attribution.

## Evidence check

- **First run.** `make verify-macos-g2-scenarios` on the uncommitted change before race g: tests 18, pass 17, skipped 1 (the race g stub); every scenario passed through the macOS supervisor.
- **Race g, before its final assertions.** The first race g waited for the task to end after the released child; it timed out in both seeds, because the execution correctly stays `started` and becomes `uncertain` (a diagnostic run printed the evidence `cancellation-not-applied` then `uncertain` and the result `pending`). The final assertions check that state ([design](design.md) decision 5).
- **Evidence runs.** Two `make native-acceptance ENTRIES=macos` runs on `67cb1122` with seeds `20261026` and `7`: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed`. After the pass 1 fixes both runs were repeated on `8796da32` with the same seeds: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed`; they replace the first runs in `results.jsonl` ([acceptance](acceptance.md)). After the pass 2 fixes both runs were repeated on `0bef214b` with the same seeds, 11:56:53 to 12:03:39 and 12:03:39 to 12:14:10 local: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed`; they replace the runs on `8796da32` in `results.jsonl`. Race g recorded `cancel filed before the adopter started` with seed `20261026` and `cancel while the adopter observed` with seed `7`.
- **Race g alone after the pass 2 fix.** `make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` on the uncommitted fix of `afbd5542` with `TASKELITH_TEST_SEED` `20261026` and `7`: tests 1, pass 1 each, race g 5.1 s and about 5.7 s.
- **Race g alone after the pass 1 fix.** `make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` on `5774715e` with `TASKELITH_TEST_SEED` `20261026` and `7`: tests 1, pass 1 each.

## Fail-before

- **Race g against a signalling adopter.** With `packages/adapters/worker-supervisor/src/adoption.ts` changed locally to send the group `SIGTERM` after recording `not-applied`, rebuilt, `make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` with `TASKELITH_TEST_SEED` `1` and `2`: race g failed in both seeds with `the adopter signalled nothing: the child still runs` (actual `[]`, expected the child's process ID). The change was reverted and the checkout rebuilt; it was never committed.
- **The macOS guard reaches its check.** With the guard changed locally to accept only adopting supervisors as parents, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^h\.'`: race h failed with `process 81955 is a child of 81930, not of a supervisor of /var/folders/.../unauthorized-start`. Reverted; never committed. This shows that race h reaches the check with the correct launching supervisor, not that the check rejects a wrong parent; the next item shows that (review pass 1, M2).
- **The macOS guard rejects a wrong parent.** `test/g2-scenario-launch.test.ts`, "the macOS guard", spawns real processes: a child of a fake supervisor process naming `SUPERVISOR_MAIN` and the worker's data root (accepted), and children of a test-side parent that names the data root but not the supervisor program, of a fake supervisor of another worker's data root, and of the test process itself (each rejected with `not of a supervisor of`). With `assertMacosSupervised` changed locally to return before its check, `node --experimental-strip-types --test test/g2-scenario-launch.test.ts` on `5774715e`: pass 7, fail 3, the three rejections failing with `Missing expected exception` and the acceptance passing. Restored, pass 10, fail 0; the bypass was never committed.
- **Race g's order.** Race g now holds the worker's next supervisor recovery before it kills the launching supervisor (review pass 1, M1), and with seed `20261026` asserts that no adopting supervisor runs once the cancel committed. With the test changed locally to release the hold and wait for the adoption before that cancel, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` on `5774715e` failed with `no adopter before the cancel committed` (actual: the adopting `supervisor-main.js adopt` process). Reverted; never committed.
- **The cancel file before adoption** (review pass 2, M-A). With race g changed locally to release the hold without the `observe` answer, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` failed with `the cancel file before the adopter started` (actual `false`, expected `true`): the adopter started before the watch filed the cancel. Reverted; never committed.
- **A launching supervisor of the exact data root** (review pass 2, L-2 and L-3). With `assertMacosSupervised` and `supervisorProcesses` changed locally back to any mode and a prefix match, `node --experimental-strip-types --test test/g2-scenario-launch.test.ts`: pass 11, fail 2, the new rejections of an adopter's child and of a child of a supervisor whose data root shares the worker's as a prefix; restored, pass 13, fail 0. Never committed.
- **Unit tests.** `test/g2-scenario-launch.test.ts` covers the switch, its refusal off macOS, the launch host kinds and cancel signals, and the `ps` parsing; `test/native-acceptance-runner.test.ts` covers the two new macOS proofs.

## Checks

`make verify` ran on the clean committed tree of `eda99b81` (tree `c52a8832`), the records commit after the review pass 1 fixes, with Node.js 24.22.1: exit 0, profile full, stamp written. Tests: 2659, 2652 pass, 0 fail, 7 skipped; on macOS the three G2 scenario files skip as before. Coverage of all files: lines 99.36%, branches 92.50%, functions 99.06%. `make record` wrote the generated part below from that log, and `make record-check` passed. Only the records commit that writes this paragraph and the generated part follows it, and it changes only this file.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c52a88323b64fd13abf753d3544e7fbcdecc090d`; tests 2659, pass 2652, fail 0, skipped 7; all files 99.36% lines, 92.50% branches, 99.06% functions.
- `npm run openspec -- validate complete-g2-native-acceptance-rows-macos --strict`: passed, `Change 'complete-g2-native-acceptance-rows-macos' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 61 file(s); every pass summary file is valid: 41 file(s).`.
- Spec diff against the merge base `f6696995dce0` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Review

### Pass 1 (reviewer A)

- **Reviewer:** Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, confirmed in the output header.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, prompt outside the worktree.
- **Session:** `01a181b7-647f-7d90-abe6-9892355ab6ca`.
- **Reviewed revision:** `e94ee6e2`; snapshot the same before and after the pass (`6bf2f840`).
- **Findings:** Critical 0, High 0, Medium 2, Low 2, all fixed.

Fixes:

- **M1** (race g's order unproven): race g holds the worker's next supervisor recovery, through the new test-side `aroundSupervisorRecover` wrap, before it kills the launching supervisor; with the cancel before adoption it commits the cancel, checks that no adopter runs, and only then releases the hold; with the cancel during the watch it releases first and cancels once the recovery reported `adopted` and one adopting supervisor runs. Evidence runs repeated on `8796da32`; `design.md` decision 5 and `acceptance.md` describe the hold in the records commit. Commit `f62ce2d1`.
- **M2** (the guard's negative cases untested): unit tests of `assertMacosSupervised` with real processes, a positive control and three rejections (a test-side parent, another worker's supervisor, the test process), with the fail-before run above. Commit `5774715e`.
- **L1** (docs): `docs/worker-platforms.md` names network changes among the open Connectivity (G2) parts on macOS. Commit `911d75d8`.
- **L2** (record): `design.md` says the guard covers races c, g, and h. Commit `8796da32`; `tasks.md` 2.3 says the same in the records commit.

### Pass 2 (reviewer B)

- **Reviewer:** Claude Code, `claude-opus-5-5`, effort high, plan permission mode with the edit tools disallowed; `claude-opus-5-5` in the `modelUsage` of the last result line.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, prompt and log outside the worktree.
- **Session:** `d58a9021-a9a3-40ca-8b5d-d7e096f085bb`.
- **Reviewed revision:** `21a00d22`; snapshot the same before and after the pass (`81eee889`).
- **Findings:** Critical 0, High 0, Medium 2, Low 8, all fixed. Pass 2 also confirmed the pass 1 fixes M2, L1, and, apart from L-1 below, L2; M1 it found only partly fixed (M-A).

Fixes:

- **M-A** (race g's cancel before adoption reached the worker only after the adopter started): with the cancel before adoption, race g now waits until the worker journals the cancellation and releases the held check with the answer that the supervisor lives, without recovering, so the watch files the cancel file before its next check adopts; the scenario checks that the cancel file existed when the adopting recovery began, yes with seed `20261026` and no with seed `7`, with the fail-before run above. Evidence runs repeated on `0bef214b`. Commit `afbd5542`; `design.md` decision 5 and `acceptance.md` in the records commit.
- **M-B** (race g's waits): the `uncertain` wait is 90 s and the test bound 400 s, above the sum of its waits; the measured durations are under "Author self-check". Commit `afbd5542`.
- **L-1** (docs): `proposal.md` and the spec delta name races h, g, and c after the start for the guard. Records commit.
- **L-2** (the guard accepted any supervisor mode): `assertMacosSupervised` accepts only launching supervisors, with a unit test of an adopter's child. Commit `0bef214b`.
- **L-3** (prefix match on the data root): `supervisorProcesses` matches the data root followed by a slash, with a unit test of a shared prefix. Commit `0bef214b`.
- **L-4** (the guard's unit tests could leak or hang): each process family is tracked once spawned, its start races the parent's exit, and the suite is bounded at 30 s. Commit `0bef214b`.
- **L-5** (NUL-separated `/proc` command lines): `procCommandLine` reads them with spaces, with a unit test. Commit `0bef214b`.
- **L-6** (stale generated checks): `make record` regenerated the part below from the `make verify` log of the pass 2 fixes, and "Checks" names the commits after it. Records commits.
- **L-7** (docs): `design.md` decision 2 names `HeldSupervision` with its start and recovery holds. Records commit.
- **L-8** (Linux paths not run): recorded under "Limitations"; no Linux host ran in this change. Records commit.

## Limitations

- The guard covers races c, g, and h; the other scenarios rely on the same composition.
- `make verify` does not run the scenarios on macOS; only `make verify-macos-g2-scenarios` and `make native-acceptance` do.
- The Linux entry was not run on this host; its scenario proofs are not applicable on macOS.
- The Linux paths of the shared scenario helpers (`SCENARIO_LAUNCH_HOST`, `workerLaunchHost`, `assertWorkerSupervised`, `processesNaming`, the stub volume probe) did not run in this change: `make verify` on macOS skips the scenario files, and neither `make verify-linux-g2-scenarios` nor a Linux `make verify` ran. The Linux `make verify` runs in `release.yml` at the promotion to `main` (review pass 2, L-8).

## Remaining gates

- Review pass 3 by reviewer A, confirming the pass 2 fixes only: governance "Conditional third pass" requires it, because the pass 2 fixes `afbd5542` and `0bef214b` change test code outside the records and documentation. It is recorded here, in `passes.jsonl`, and in `findings.jsonl`.
- The archive commit, which links `docs/g3-plan.md` and `docs/worker-platforms.md` to the archived `acceptance.md`, with its checks.
- Full `make verify` of the clean archive commit directly before the push, whose stamp the `pre-push` hook reuses, and the handoff to the coordinator.
- Integration into dev by the coordinator (single pull request)
- Item 43 stays open for `macos-26-arm64` and its process ownership re-run, `linux-ubuntu-24.04-arm64`, and the hosted `ubuntu-24.04` re-dispatch.
