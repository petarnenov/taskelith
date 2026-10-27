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

## Evidence sources

On `dev` at `2a26714b`:

- `openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/` (`acceptance.md`; #306, archived with #307).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/` (`acceptance.md`, `design.md`, `verification.md`; #327, merge `33d341a9`).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/` (`acceptance.md`, `verification.md`; #328, merge `2a26714b`).
- `openspec/changes/archive/2026-10-27-keep-coverage-out-of-killed-test-processes/` (`proposal.md`, `verification.md`; #326, merge `3b1d1e33`), and `openspec/changes/archive/2026-10-26-run-g2-crash-windows/verification.md` for the `40aab95` claim.
- `openspec/changes/archive/2026-10-26-fix-launch-recovery-reauthorization/verification.md` and its `results.jsonl` (host Darwin 25.6.0, arch `x64`), and `openspec/changes/archive/2026-10-27-report-all-unconfirmed-sealed-executions/results.jsonl` (the same host and arch), for the arm64 re-run question.
- Code lines cited by the ADR: `apps/control-plane/src/application/placement-service.ts:47`, `:78`; `packages/adapters/worker-control-plane-client/src/failure-cause.ts:20` (`:19` in the draft is the URL rule); `packages/modules/observability/src/domain/redaction.ts:26`; `packages/modules/observability/src/domain/signals.ts:21`; `packages/adapters/postgres/src/control-plane-signals.ts:25`; `infra/installation/compose.yaml:108`; `scripts/native-acceptance.ts:75`; `scripts/installation-scenarios.sh:478`, `:633`.

On branches of `origin`, read with `git show <head>:<path>` after `git fetch origin`. `git ls-remote origin` showed these heads, none is an ancestor of `dev`, and `gh pr list --head <branch>` showed no pull request for any of them:

| Branch | Head | Record read |
| --- | --- | --- |
| `run-g2-crash-windows-on-linux` | `07568a20` (archive commit) | `openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/proposal.md`, `verification.md` |
| `run-g2-partition-and-races` | `5bed450b` (archive commit) | `openspec/changes/archive/2026-10-27-run-g2-partition-and-races/proposal.md`, `verification.md`, `results.jsonl` |
| `break-fair-order-ties-by-task-id` | `e66d0d72` (archive commit) | its archived `proposal.md` and `verification.md` |
| `stabilize-placement-fair-order-test` | `1a9fa773` (archive commit) | its archived `proposal.md` and `verification.md` |
| `fix-platform-probe-filesystem-label` | `b6d7dbb9` (archive commit) | its archived `proposal.md` and `verification.md` |
| `align-fair-order-rotation` | `d5f3baf3` (archive commit) | its archived `proposal.md`, `design.md`, and `verification.md` |

Outside the repository: the away run `20261027T045006Z-opencode-96871` (`decision.md`, `meta.txt`, `packet.md`) in the coordinator's local away run directory, a local, unversioned record; the ADR names it as such. No web link is used; pull request numbers are those of the GitHub repository `petarnenov/taskelith`, each named with its merge commit.

Not found in the repository or on any remote branch, so recorded only as the coordinator stated them: `stop-automatic-retry-of-unknown-exit` (named by the Linux crash-windows record, not yet started), the ReDoS fix change, `centralize-log-redaction-rules`, `advance-placement-rotation-cursor` (named by the `align-fair-order-rotation` record, not yet started), `check-change-record-links`, the worker image reproducibility follow-up, the quadratic behaviour of `redactText`, and the 24c macOS hang.

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

## Remaining placeholders

- ADR 0015 decision 1, "work items": archive dates on `dev` and pull requests of the branches still pending, and the fix changes still to come.
- ADR 0015 decision 4, "fresh clone".
- ADR 0015 decision 6, "closure statement".
- `docs/foundation.md`, G2 status: the closure sentence.

## Checks

Light checks only, because the host is shared with evidence runs; `make verify` has not run on this change.

- Draft, at `0bec0a6`: `npm run openspec -- validate close-g2 --strict` passed; `npm run verify:comments` passed; `make findings ARGS="validate"` passed (3 files).
- Evidence update, on the working tree committed after `3faaa03f`: `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run findings -- validate` passed ("Every findings file is valid: 6 file(s)."); `npm run verify:comments` passed ("Every comment is within the comment length rule."); `git diff --check` reported nothing.

## Independent review

Not started. Assigned reviewer: OpenCode `opencode-go/kimi-k3.1-pro#high`.

## Remaining gates

- Blockers that must land before the closure: the fix of the Linux CP9 defect L1 (`stop-automatic-retry-of-unknown-exit`); the integration into `dev` of 24c with its macOS hang fix, `run-g2-crash-windows-on-linux`, and the other branches marked "integration pending"; and, by the author's assignment for the owner to confirm, the ReDoS fix of `failure-cause.ts`.
- Re-check of the ADR's evidence against `dev` after those integrations (task 2.8) and the row map (task 2.5); task 2.1 stays open until 24c lands with its hang fix.
- The fresh-clone reproduction (tasks 3.1 to 3.4), run only after every blocker above lands, because the host is shared.
- The owner's confirmation of each author's assignment, and the closure records (section 4 of `tasks.md`).
- `make verify` and the link and evidence checks.
- Independent review by OpenCode `opencode-go/kimi-k3.1-pro#high`, recorded here and in `findings.jsonl`.
- Owner acceptance of ADR 0015.
- Integration into dev by the coordinator (single pull request). Promotion to `main` is a later owner decision.
