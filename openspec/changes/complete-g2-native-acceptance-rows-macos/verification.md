# Verification

Date: 2026-10-28. The author's verification, the evidence runs, and `make verify` are recorded below; no review pass has run yet.

## Scope and source

Worker Pepi's brief of 2026-10-28 from coordinator Niki for G3 item 43 (`docs/g3-plan.md`), the `macos-26-x86_64` part of `complete-g2-native-acceptance-rows`, size M-L, commit types `test`, `chore`, and `docs`. The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/complete-g2-native-acceptance-rows-macos` on branch `complete-g2-native-acceptance-rows-macos`, modelled on the archived Linux part (`openspec/changes/archive/2026-10-28-complete-g2-native-acceptance-rows/`).

- **Base revision:** `f6696995` (`origin/dev`, merge of pull request #384).
- **Scope:** the G2 scenario helpers `test/g2-scenarios/scenario-launch.ts`, `scenario-worker.ts`, `scenario-run.ts`, and `leftover-processes.ts`; `test/g2-cancellation-races.test.ts` (race g, the guard, the forged start's platform); `test/g2-scenario-launch.test.ts`; `scripts/native-acceptance.sh` and `test/native-acceptance-runner.test.ts`; the `Makefile` target `verify-macos-g2-scenarios`; `docs/local-installation.md`, `docs/worker-platforms.md`, and the item 43 row of `docs/g3-plan.md`; the two spec deltas.
- **Out of scope, open under item 43:** `macos-26-arm64` with its process ownership re-run (needs the owner's physical access to the MacBook Air), `linux-ubuntu-24.04-arm64`, and the hosted `ubuntu-24.04` re-dispatch. No product code changed.

## Revision

- `67cb1122`: the test tooling, target, runner, and `docs/local-installation.md`; the evidence runs ran on this commit.
- The next commit adds the OpenSpec records, `results.jsonl`, `acceptance.md`, and the `docs/worker-platforms.md` and `docs/g3-plan.md` edits; it changes no file that the evidence runs execute.

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
- **Evidence runs.** Two `make native-acceptance ENTRIES=macos` runs on `67cb1122` with seeds `20261026` and `7`: exit 0 each, `every proof passed`, 57 records each, 114 in all, every one `passed` ([acceptance](acceptance.md)).

## Fail-before

- **Race g against a signalling adopter.** With `packages/adapters/worker-supervisor/src/adoption.ts` changed locally to send the group `SIGTERM` after recording `not-applied`, rebuilt, `TASKELITH_TEST_SEED=1` and `2 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^g\.'`: race g failed in both seeds with `the adopter signalled nothing: the child still runs` (actual `[]`, expected the child's process ID). The change was reverted and the checkout rebuilt; it was never committed.
- **The macOS guard against a process that is not a launch supervisor's child.** With the guard changed locally to accept only adopting supervisors as parents, `TASKELITH_TEST_SEED=20261026 make verify-macos-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='^h\.'`: race h failed with `process 81955 is a child of 81930, not of a supervisor of /var/folders/.../unauthorized-start`. Reverted; never committed.
- **Unit tests.** `test/g2-scenario-launch.test.ts` covers the switch, its refusal off macOS, the launch host kinds and cancel signals, and the `ps` parsing; `test/native-acceptance-runner.test.ts` covers the two new macOS proofs.

## Checks

PENDING

<!-- make record: begin -->
<!-- make record: end -->

## Review

No review pass has run. Reviewers A and B are assigned by the coordinator.

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
