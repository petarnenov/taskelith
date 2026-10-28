# Verification

Date: 2026-10-28. The author's verification, the evidence runs, `make verify`, and the fixes of review pass 1 are recorded below.

## Scope and source

Worker Pepi's brief of 2026-10-28 from coordinator Niki for G3 item 43 (`docs/g3-plan.md`), the `macos-26-x86_64` part of `complete-g2-native-acceptance-rows`, size M-L, commit types `test`, `chore`, and `docs`. The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/complete-g2-native-acceptance-rows-macos` on branch `complete-g2-native-acceptance-rows-macos`, modelled on the archived Linux part (`openspec/changes/archive/2026-10-28-complete-g2-native-acceptance-rows/`).

- **Base revision:** `f6696995` (`origin/dev`, merge of pull request #384).
- **Scope:** the G2 scenario helpers `test/g2-scenarios/scenario-launch.ts`, `scenario-worker.ts`, `scenario-run.ts`, and `leftover-processes.ts`; `test/g2-cancellation-races.test.ts` (race g, the guard, the forged start's platform); `test/g2-scenario-launch.test.ts`; `scripts/native-acceptance.sh` and `test/native-acceptance-runner.test.ts`; the `Makefile` target `verify-macos-g2-scenarios`; `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 row of `docs/g3-plan.md`; the two spec deltas.
- **Out of scope, open under item 43:** `macos-26-arm64` with its process ownership re-run (needs the owner's physical access to the MacBook Air), `linux-ubuntu-24.04-arm64`, and the hosted `ubuntu-24.04` re-dispatch. No product code changed.

## Revision

- `67cb1122`: the test tooling, target, runner, and `docs/local-installation.md`; the evidence runs ran on this commit.
- The next commit adds the OpenSpec records, `results.jsonl`, `acceptance.md`, and the `docs/worker-platforms.md` and `docs/g3-plan.md` edits; it changes no file that the evidence runs execute.
- Review pass 1 fixes: `f62ce2d1` (race g's recovery hold, M1), `5774715e` (the macOS guard's unit tests, M2), `911d75d8` (L1), and `8796da32` (L2). The evidence runs were repeated on `8796da32`; the records commit after it changes no file that they execute.

## Environment

macOS 26.6.2 (25G83), Darwin 25.6.0, x86_64 (2020 Intel iMac), APFS boot data volume; Node.js 24.22.1 (`.nvmrc`); Docker Desktop 4.75.0 (227598), Engine 29.5.2, Compose 5.1.3. Every Docker run of this change (the scenario runs, the evidence runs, and `make verify`'s `make test`) held the host-wide Docker slot (`scripts/docker-slot.ts run`).

## Author self-check

- **Composition.** Under `TASKELITH_MACOS_SCENARIOS=1` the scenario workers compose `supervisionHost` of `apps/worker`, as `apps/worker/src/main.ts` does, with the worker's admission check and the real volume probe; no product file changed (`git diff f6696995 --stat -- apps packages` is empty).
- **`make verify` unchanged on macOS.** Without the variable the scenario files still skip on macOS with their reason, so the hang that led to `6d40c0c4` cannot return through `make verify` ([design](design.md) decision 1).
- **Race g follows the contract.** The `uncertain` execution after the released child is the recovery table's row "macOS, same boot, `handle` present: the child's identity is not alive" (supervisor identity contract section 6), and the not-applied cancel is section 8; neither is a product defect.
- **Test authoring.** The new waits poll conditions the work signals (`waitFor`), with bounds of 30 s and 60 s for work that took about 1 s and 12 s here; no sleep synchronizes. Race g kills only the supervisor whose command line names its own worker's data root.
- **Requirement length.** Under 500 characters each; `npm run verify:archive`, inside `make verify`, archives the change in a temporary copy into strictly valid specs.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `test` and `docs`, without attribution.

## Evidence check

- **First run.** `make verify-macos-g2-scenarios` on the uncommitted change before race g: tests 18, pass 17, skipped 1 (the race g stub); every scenario passed through the macOS supervisor.
- **Race g, before its final assertions.** The first race g waited for the task to end after the released child; it timed out in both seeds, because the execution correctly stays `started` and becomes `uncertain` (a diagnostic run printed the evidence `cancellation-not-applied` then `uncertain` and the result `pending`). The final assertions check that state ([design](design.md) decision 5).
- **Evidence runs.** Two `make native-acceptance ENTRIES=macos` runs on `67cb1122` with seeds `20261026` and `7`: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed`. After the pass 1 fixes both runs were repeated on `8796da32` with the same seeds: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed`; they replace the first runs in `results.jsonl` ([acceptance](acceptance.md)). Race g recorded `cancel before the adopter started` with seed `20261026` and `cancel while the adopter observed` with seed `7`.
- **Race g alone after the fix.** `make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` on `5774715e` with `TASKELITH_TEST_SEED` `20261026` and `7`: tests 1, pass 1 each.

## Fail-before

- **Race g against a signalling adopter.** With `packages/adapters/worker-supervisor/src/adoption.ts` changed locally to send the group `SIGTERM` after recording `not-applied`, rebuilt, `make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` with `TASKELITH_TEST_SEED` `1` and `2`: race g failed in both seeds with `the adopter signalled nothing: the child still runs` (actual `[]`, expected the child's process ID). The change was reverted and the checkout rebuilt; it was never committed.
- **The macOS guard reaches its check.** With the guard changed locally to accept only adopting supervisors as parents, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^h\.'`: race h failed with `process 81955 is a child of 81930, not of a supervisor of /var/folders/.../unauthorized-start`. Reverted; never committed. This shows that race h reaches the check with the correct launching supervisor, not that the check rejects a wrong parent; the next item shows that (review pass 1, M2).
- **The macOS guard rejects a wrong parent.** `test/g2-scenario-launch.test.ts`, "the macOS guard", spawns real processes: a child of a fake supervisor process naming `SUPERVISOR_MAIN` and the worker's data root (accepted), and children of a test-side parent that names the data root but not the supervisor program, of a fake supervisor of another worker's data root, and of the test process itself (each rejected with `not of a supervisor of`). With `assertMacosSupervised` changed locally to return before its check, `node --experimental-strip-types --test test/g2-scenario-launch.test.ts` on `5774715e`: pass 7, fail 3, the three rejections failing with `Missing expected exception` and the acceptance passing. Restored, pass 10, fail 0; the bypass was never committed.
- **Race g's order.** Race g now holds the worker's next supervisor recovery before it kills the launching supervisor (review pass 1, M1), and with seed `20261026` asserts that no adopting supervisor runs once the cancel committed. With the test changed locally to release the hold and wait for the adoption before that cancel, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'` on `5774715e` failed with `no adopter before the cancel committed` (actual: the adopting `supervisor-main.js adopt` process). Reverted; never committed.
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

Reviewer details: recorded by the worker.

Fixes:

- **M1** (race g's order unproven): race g holds the worker's next supervisor recovery, through the new test-side `aroundSupervisorRecover` wrap, before it kills the launching supervisor; with the cancel before adoption it commits the cancel, checks that no adopter runs, and only then releases the hold; with the cancel during the watch it releases first and cancels once the recovery reported `adopted` and one adopting supervisor runs. Evidence runs repeated on `8796da32`; `design.md` decision 5 and `acceptance.md` describe the hold in the records commit. Commit `f62ce2d1`.
- **M2** (the guard's negative cases untested): unit tests of `assertMacosSupervised` with real processes, a positive control and three rejections (a test-side parent, another worker's supervisor, the test process), with the fail-before run above. Commit `5774715e`.
- **L1** (docs): `docs/worker-platforms.md` names network changes among the open Connectivity (G2) parts on macOS. Commit `911d75d8`.
- **L2** (record): `design.md` says the guard covers races c, g, and h. Commit `8796da32`; `tasks.md` 2.3 says the same in the records commit.

## Limitations

- The guard covers races c, g, and h; the other scenarios rely on the same composition.
- `make verify` does not run the scenarios on macOS; only `make verify-macos-g2-scenarios` and `make native-acceptance` do.
- The Linux entry was not run on this host; its scenario proofs are not applicable on macOS.

## Remaining gates

- Review passes by the assigned reviewers A and B, recorded here, in `passes.jsonl`, and in `findings.jsonl`.
- The archive commit, which links `docs/g3-plan.md` and `docs/worker-platforms.md` to the archived `acceptance.md`, with its checks.
- Full `make verify` of the clean archive commit directly before the push, whose stamp the `pre-push` hook reuses, and the handoff to the coordinator.
- Integration into dev by the coordinator (single pull request)
- Item 43 stays open for `macos-26-arm64` and its process ownership re-run, `linux-ubuntu-24.04-arm64`, and the hosted `ubuntu-24.04` re-dispatch.
