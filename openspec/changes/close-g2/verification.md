# Verification

Date: 2026-10-27. Draft: the author checks of the draft and of the evidence update are recorded below; the integration of the pending branches, the fresh-clone reproduction, `make verify`, and the independent review are not done yet.

## Scope and source

G2 work plan item 27, `close-g2`, assigned by coordinator Niki and developed in a briefed implementation subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/close-g2` on branch `close-g2`. Scope: `docs/decisions/0015-g2-closure.md` (new), `docs/foundation.md` (G2 section), and this change. Documentation only.

The evidence update of 2026-10-27 follows the coordinator's brief of that day: fill the placeholders for G2 work that is on `dev` or handed off on a branch, and add the deferrals the coordinator named, each with its source, its gate, and whether it blocks the closure.

## Revision

- Base of the draft: `fe64386` on `dev`.
- `origin/dev` at `33d341a9` (#327) merged in as `b0b7ae04`, a merge commit, without conflicts. It brings `keep-coverage-out-of-killed-test-processes` (#326) and `run-g2-native-acceptance-linux-host` (#327). `npm ci --ignore-scripts` ran after it, and `npm run verify:dependencies` reported the dependency inventory current ("Verified 731 package paths"), so it was not regenerated.
- `origin/dev` at `2a26714b` (#328, 25c) merged in as `3faaa03f`, a merge commit, without conflicts, after the coordinator reported that 25c had landed; the evidence edits were stashed across that merge and restored without conflicts. The archived 25c record on `dev` is identical to that of its branch head `5af2f9f8`. `npm ci --ignore-scripts` ran again, and `npm run verify:dependencies` again reported the inventory current.
- The evidence update is the next commit on this branch, on top of `3faaa03f`.
- `origin/dev` at `92f0830b` (#330) merged in as `8667c9e7`, a merge commit, without conflicts. It brings `run-g2-crash-windows-on-linux` (#329, merge `1e48c93b`) and `bound-failure-cause-userinfo-redaction` (#330, merge `92f0830b`). The archived Linux crash-windows record on `dev` is identical to that of its branch head `07568a20`. `npm ci --ignore-scripts` ran, and `npm run verify:dependencies` reported the inventory current ("Verified 731 package paths"), so it was not regenerated.

## Evidence sources

On `dev` at `92f0830b`:

- `openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/` (`acceptance.md`; #306, archived with #307).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/` (`acceptance.md`, `design.md`, `verification.md`; #327, merge `33d341a9`).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/` (`acceptance.md`, `verification.md`; #328, merge `2a26714b`).
- `openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/` (`proposal.md`, `verification.md`, `results.jsonl`; #329, merge `1e48c93b`).
- `openspec/changes/archive/2026-10-27-bound-failure-cause-userinfo-redaction/` (`proposal.md`, `verification.md`; #330, merge `92f0830b`).
- `openspec/changes/archive/2026-10-27-keep-coverage-out-of-killed-test-processes/` (`proposal.md`, `verification.md`; #326, merge `3b1d1e33`), and `openspec/changes/archive/2026-10-26-run-g2-crash-windows/verification.md` for the `40aab95` claim.
- `openspec/changes/archive/2026-10-26-fix-launch-recovery-reauthorization/verification.md` and its `results.jsonl` (host Darwin 25.6.0, arch `x64`), and `openspec/changes/archive/2026-10-27-report-all-unconfirmed-sealed-executions/results.jsonl` (the same host and arch), for the arm64 re-run question.
- Code lines cited by the ADR: `apps/control-plane/src/application/placement-service.ts:47`, `:78`; `packages/adapters/worker-control-plane-client/src/failure-cause.ts:22` (the user-information rule after #330; `:20` before it); `packages/modules/observability/src/domain/redaction.ts:26`; `packages/modules/observability/src/domain/signals.ts:21`; `packages/adapters/postgres/src/control-plane-signals.ts:25`; `infra/installation/compose.yaml:108`; `scripts/native-acceptance.ts:75`; `scripts/installation-scenarios.sh:478`, `:633`; `apps/worker/src/launch-orchestrator.ts:143-144` (`continue-launch` calls `#launch`), `:296` (`#track`'s cleanup calls `#wake`), `:514-515` (the clock read ends the launch without a back-off); `packages/modules/scheduling/src/application/capacity-operations.ts:268` (`isSafeToRetry`), `:270` (an `exited` outcome with `startProven` counts as certain). Contract lines cited by the ADR: `docs/contracts/capacity-reservation.md:242` (section 13, automatic retries) and `docs/contracts/supervisor-identity.md:107` (section 6, an exit with an unknown status); `apps/control-plane/test/crash-windows.integration.test.ts:38` (the crash windows run on macOS and in `make verify-linux-crash-windows`). Commit `e5db6610` was checked to be on `origin/run-g2-partition-and-races` and not an ancestor of `origin/dev`.

On branches of `origin`, read with `git show <head>:<path>` after `git fetch origin`. `git ls-remote origin` showed these heads, none is an ancestor of `dev`, and `gh pr list --head <branch>` showed no pull request for any of them:

| Branch | Head | Record read |
| --- | --- | --- |
| `run-g2-partition-and-races` | `5bed450b` (archive commit; read before the coordinator returned the task to its worker) | `openspec/changes/archive/2026-10-27-run-g2-partition-and-races/proposal.md`, `verification.md`, `results.jsonl` |
| `break-fair-order-ties-by-task-id` | `e66d0d72` (archive commit) | its archived `proposal.md` and `verification.md` |
| `stabilize-placement-fair-order-test` | `1a9fa773` (archive commit) | its archived `proposal.md` and `verification.md` |
| `fix-platform-probe-filesystem-label` | `b6d7dbb9` (archive commit) | its archived `proposal.md` and `verification.md` |
| `align-fair-order-rotation` | `d5f3baf3` (archive commit) | its archived `proposal.md`, `design.md`, and `verification.md` |

Outside the repository: the away run `20261027T045006Z-opencode-96871` (`decision.md`, `meta.txt`, `packet.md`) in the coordinator's local away run directory, a local, unversioned record; the ADR names it as such. No web link is used; pull request numbers are those of the GitHub repository `petarnenov/taskelith`, each named with its merge commit.

Not found in the repository or on any remote branch, so recorded only as the coordinator stated them: `stop-automatic-retry-of-unknown-exit` (named by the Linux crash-windows record; in review by Liki, by the coordinator's statement, with no branch on `origin`), `centralize-log-redaction-rules`, `advance-placement-rotation-cursor` (named by the `align-fair-order-rotation` record, not yet started), `check-change-record-links`, the worker image reproducibility follow-up, the quadratic behaviour of `redactText`, the 24c macOS hang, Desi's diagnostic of 2026-10-27 on the Intel iMac, `back-off-relaunch-after-pre-w2-failure`, and `align-safe-to-retry-with-supervisor-identity`.

## Author self-check of the draft

- Every G2 plan row is mapped to archived changes by the row named in each proposal; rows 24 (part 24c) and 25 (25c and the Linux-host run) were not fully archived at the draft, and row 27 is this change.
- Each deferral names the archived change or decision that recorded it, or is marked as the author's assignment.
- Checked against the repository at `fe64386`:
  - the D1 double fault is covered by `report-all-unconfirmed-sealed-executions` (its proposal); the cap of 8 is its design D5;
  - 20d2 open question 2 is resolved by 23b: `infra/installation/Dockerfile:42` sets `TASKELITH_CONTAINMENT_PARENT`;
  - the `EnrollmentRequest` description that 20a left to the coordinator no longer says the journal exists before enrollment;
  - the `worker/journal-fault` control record is in worker journal contract section 2;
  - the crash windows skip on non-macOS hosts at `apps/control-plane/test/crash-windows.integration.test.ts:34-35`;
  - the fair-order test is at `apps/control-plane/test/placement.integration.test.ts:226`.

## Author self-check and evidence check of the update

- Each filled placeholder states only what its record shows. Work on a branch is named with its branch and head and "integration pending"; nothing on a branch is called merged or archived on `dev`.
- 25c: 15 proofs and 48 records, all `passed`, commit `b82ad2f`, seed `4080300788`, as its `acceptance.md` and the `make native-acceptance` row of its verification state. Landed with #328. The change is `run-g2-native-acceptance-x86-64`, developed on branch `run-g2-native-acceptance-x86_64`, because OpenSpec refuses underscores in change names.
- Linux host: lines 1 to 11 with seed `1140438646` and line 12 with seed `2677284533`, commit `9a5ef14`, all passed; `apparmor=unconfined`; the hosted-runner check kept open by its design decision 1.
- arm64 re-run: every archived crash-window `results.jsonl` was searched; the runs after the D1 fix name arch `x64`, so the `macos-26-arm64` process ownership row is recorded as not re-run and open.
- Linux crash windows: 29 records of `d18d6d5c`, 28 `passed` and `crash-window-cp9` `failed` on L1.
- 24c: 34 records, all `passed`, commit `9630470a`, host Linux 6.8.0-147-generic, 17 records with seed `20261026` and 17 with seed `7`, 17 distinct scenarios.
- The `assignment.age` away decision was read in full; the two code lines it names still hold on this branch.
- The draft said that every entry ran on a local host, so no hosted-runner workflow was added; the Linux-host record keeps a hosted-runner check open, and the ADR now says both.
- Deferral gates that no record names are marked as the author's assignment for the owner to confirm; the draft's assignments are unchanged.

## Coordinator decisions of 2026-10-27

Recorded in the ADR in commit `docs: record the G2 closure blockers set by the coordinator`:

1. The macOS arm64 process ownership row is re-run on arm64 after the D1 fix before the closure (Maki); a blocker, not a deferral.
2. The ReDoS fix of `failure-cause.ts` gates acceptance; a blocker set by the coordinator, no longer an author's assignment. It is cited as pending until it lands.
3. The GitHub-hosted `ubuntu-24.04` check stays open and does not block; owner to confirm.
4. 24c was handed off and returned to its worker because its tests hang on macOS in the coordinator's integration `make verify`; a blocker, not a deferral, and no longer cited as handed off.

At that commit, the G2 blockers were exactly 24c, the fix of L1, the ReDoS fix, and the macOS arm64 re-run.

A further coordinator item of the same day, recorded in commit `docs: defer the relaunch back-off after a pre-W2 launch failure`: the relaunch without back-off after a launch fails before W2 is a deferral, not a blocker, with the follow-up `back-off-relaunch-after-pre-w2-failure`, assigned after the G2 closure unless it lands first.

Another coordinator item, found by Liki and recorded in commit `docs: defer aligning safe-to-retry with the supervisor identity contract`: the safe-to-retry rule of the capacity reservation contract, which counts any proven exit as safe, contradicts section 6 of the supervisor identity contract for an exit with an unknown status. It is a deferral, not a blocker, with the follow-up `align-safe-to-retry-with-supervisor-identity`, contract-first, after the G2 closure; after the fix of L1 an unknown exit no longer reaches that path.

A coordinator update of the same day, recorded in commit `docs: record the landed ReDoS fix and Linux crash windows in the G2 closure`: the ReDoS fix landed with #330 and no longer blocks the closure; `run-g2-crash-windows-on-linux` landed with #329, and its CP9 failure on L1 still blocks the closure through the fix of L1. The G2 blockers are now exactly three: 24c `run-g2-partition-and-races` (Zaki, in review), the fix of L1 `stop-automatic-retry-of-unknown-exit` (Liki, in review), and Maki's macOS arm64 process ownership re-run.

## Remaining placeholders

- ADR 0015 decision 1, "work items": archive dates on `dev` and pull requests of the branches still pending, and the fix changes still to come.
- ADR 0015 decision 4, "fresh clone".
- ADR 0015 decision 6, "closure statement".
- `docs/foundation.md`, G2 status: the closure sentence.

## Checks

Light checks only, because the host is shared with evidence runs; `make verify` has not run on this change.

- Draft, at `0bec0a6`: `npm run openspec -- validate close-g2 --strict` passed; `npm run verify:comments` passed; `make findings ARGS="validate"` passed (3 files).
- Evidence update, in `ee66935f`: `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run findings -- validate` passed ("Every findings file is valid: 6 file(s)."); `npm run verify:comments` passed ("Every comment is within the comment length rule."); `git diff --check` reported nothing.
- Blocker update: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Relaunch back-off deferral: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Safe-to-retry deferral: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Landed ReDoS fix and Linux crash windows: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (8 files, with the two archives of #329 and #330); `npm run verify:comments` passed; `git diff --check` reported nothing.

## Independent review

Not started. Assigned reviewer: OpenCode `opencode-go/kimi-k3.1-pro#high`.

## Remaining gates

- The three G2 blockers set by the coordinator on 2026-10-27 (ADR 0015 decision 5): 24c `run-g2-partition-and-races` (Zaki, in review), returned to its worker for a hang of its tests on macOS; the fix of the Linux CP9 defect L1, `stop-automatic-retry-of-unknown-exit` (Liki, in review); and Maki's re-run of the macOS arm64 process ownership row after the D1 fix. The ReDoS fix landed with #330.
- The integration into `dev` of the other branches marked "integration pending"; they do not block the closure.
- Re-check of the ADR's evidence against `dev` after those land (task 2.8) and the row map (task 2.5); task 2.1 stays open until 24c lands.
- The fresh-clone reproduction (tasks 3.1 to 3.4), run only after the three blockers land, because the host is shared.
- The owner's confirmation of each author's assignment and of the hosted-runner check left open, and the closure records (section 4 of `tasks.md`).
- `make verify` and the link and evidence checks.
- Independent review by OpenCode `opencode-go/kimi-k3.1-pro#high`, recorded here and in `findings.jsonl`.
- Owner acceptance of ADR 0015.
- Integration into dev by the coordinator (single pull request). Promotion to `main` is a later owner decision.
