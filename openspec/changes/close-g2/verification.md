# Verification

Date: 2026-10-27. Draft: the author checks of the draft and of the evidence updates are recorded below. Every G2 change is on `dev` at `bd6108d4`, and no blocker remains. The fresh-clone reproduction of `bd6108d4` passed on 2026-10-27 ("Fresh-clone reproduction" below), `make verify` passed on this branch at `d7bc65bd`, and review passes 1 and 2 are recorded and fixed; review pass 3, the owner's acceptance, the archive, and the integration are not done yet.

## Scope and source

G2 work plan item 27, `close-g2`, assigned by coordinator Niki and developed in a briefed implementation subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/close-g2` on branch `close-g2`. Scope: `docs/decisions/0015-g2-closure.md` (new), `docs/foundation.md` (G2 section), `docs/fleet.md` (the roster row removed by the owner's instruction of 2026-10-27), and this change. Documentation only.

The evidence update of 2026-10-27 follows the coordinator's brief of that day: fill the placeholders for G2 work that is on `dev` or handed off on a branch, and add the deferrals the coordinator named, each with its source, its gate, and whether it blocks the closure.

## Revision

- Base of the draft: `fe64386` on `dev`.
- `origin/dev` at `33d341a9` (#327) merged in as `b0b7ae04`, a merge commit, without conflicts. It brings `keep-coverage-out-of-killed-test-processes` (#326) and `run-g2-native-acceptance-linux-host` (#327). `npm ci --ignore-scripts` ran after it, and `npm run verify:dependencies` reported the dependency inventory current ("Verified 731 package paths"), so it was not regenerated.
- `origin/dev` at `2a26714b` (#328, 25c) merged in as `3faaa03f`, a merge commit, without conflicts, after the coordinator reported that 25c had landed; the evidence edits were stashed across that merge and restored without conflicts. The archived 25c record on `dev` is identical to that of its branch head `5af2f9f8`. `npm ci --ignore-scripts` ran again, and `npm run verify:dependencies` again reported the inventory current.
- The evidence update is the next commit on this branch, on top of `3faaa03f`.
- `origin/dev` at `92f0830b` (#330) merged in as `8667c9e7`, a merge commit, without conflicts. It brings `run-g2-crash-windows-on-linux` (#329, merge `1e48c93b`) and `bound-failure-cause-userinfo-redaction` (#330, merge `92f0830b`). The archived Linux crash-windows record on `dev` is identical to that of its branch head `07568a20`. `npm ci --ignore-scripts` ran, and `npm run verify:dependencies` reported the inventory current ("Verified 731 package paths"), so it was not regenerated.
- `origin/dev` at `bd6108d4` (#342) merged in as `31dbd30f`, a merge commit, without conflicts, after `git fetch origin`. It brings #331 to #342: `stabilize-placement-fair-order-test`, `stop-automatic-retry-of-unknown-exit`, 24c `run-g2-partition-and-races`, `require-finding-capability`, `fix-platform-probe-filesystem-label`, `break-fair-order-ties-by-task-id`, `align-fair-order-rotation`, `advance-placement-rotation-cursor`, `centralize-log-redaction-rules`, `alternate-reviewers-per-pass` (governance policy version 5), `back-off-relaunch-after-pre-w2-failure`, and `align-safe-to-retry-with-supervisor-identity`. `npm ci --ignore-scripts` ran after it, and `npm run verify:dependencies` reported the inventory current ("Verified 731 package paths"), so it was not regenerated.
- Fresh-clone record: on top of `2af551b6`. The fresh clone ran `dev` at `bd6108d4`, the `dev` side of the merge `31dbd30f`; every commit of this branch after that merge changes documentation and this change only.
- `origin/dev` at `34af90f4` (#343, `review-pass-statistics`, not a G2 row) merged in as `2f9b1010`, a merge commit, without conflicts. It adds the rule that every change records its review pass summaries in `passes.jsonl`; `d7bc65bd` then added this change's empty `passes.jsonl`. `d7bc65bd` is the revision of `make verify` ("Checks") and of review pass 1.
- `991324dd` fixed the pass 1 findings and `fa1b127d` recorded them; `fa1b127d` is the revision of review pass 2. `ac922f31` fixed the pass 2 findings, and the commit after it records them.

## Evidence sources

On `dev` at `92f0830b`:

- `openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/` (`acceptance.md`; #306, archived with #307).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/` (`acceptance.md`, `design.md`, `verification.md`; #327, merge `33d341a9`).
- `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/` (`acceptance.md`, `verification.md`; #328, merge `2a26714b`).
- `openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/` (`proposal.md`, `verification.md`, `results.jsonl`; #329, merge `1e48c93b`).
- `openspec/changes/archive/2026-10-27-bound-failure-cause-userinfo-redaction/` (`proposal.md`, `verification.md`; #330, merge `92f0830b`).
- `openspec/changes/archive/2026-10-27-keep-coverage-out-of-killed-test-processes/` (`proposal.md`, `verification.md`; #326, merge `3b1d1e33`), and `openspec/changes/archive/2026-10-26-run-g2-crash-windows/verification.md` for the `40aab95` claim.
- `openspec/changes/archive/2026-10-26-fix-launch-recovery-reauthorization/verification.md` and its `results.jsonl` (host Darwin 25.6.0, arch `x64`), and `openspec/changes/archive/2026-10-27-report-all-unconfirmed-sealed-executions/results.jsonl` (the same host and arch), for the arm64 re-run question.
- Code lines cited by the ADR: `apps/control-plane/src/application/placement-service.ts:47`, `:78`; `packages/adapters/worker-control-plane-client/src/failure-cause.ts:22` (the user-information rule after #330; `:20` before it); `packages/modules/observability/src/domain/redaction.ts:26`; `packages/modules/observability/src/domain/signals.ts:21`; `packages/adapters/postgres/src/control-plane-signals.ts:25`; `infra/installation/compose.yaml:108`; `scripts/native-acceptance.ts:75`; `scripts/installation-scenarios.sh:478`, `:633`; `apps/worker/src/launch-orchestrator.ts:143-144` (`continue-launch` calls `#launch`), `:296` (`#track`'s cleanup calls `#wake`), `:514-515` (the clock read ends the launch without a back-off); `packages/modules/scheduling/src/application/capacity-operations.ts:268` (`isSafeToRetry`), `:270` (an `exited` outcome with `startProven` counts as certain). Contract lines cited by the ADR: `docs/contracts/capacity-reservation.md:242` (section 13, automatic retries) and `docs/contracts/supervisor-identity.md:107` (section 6, an exit with an unknown status); `apps/control-plane/test/crash-windows.integration.test.ts:38` (the crash windows run on macOS and in `make verify-linux-crash-windows`). Commit `e5db6610` was checked to be on `origin/run-g2-partition-and-races` and not an ancestor of `92f0830b`; it has since landed on `dev` with #333, merge `744689cb` (`git merge-base --is-ancestor`, 2026-10-27).

On branches of `origin`, read with `git show <head>:<path>` after `git fetch origin`. `git ls-remote origin` showed these heads, none an ancestor of `92f0830b`, and `gh pr list --head <branch>` then showed no pull request for any of them. Each head has since landed on `dev`; the last column names the first-parent `dev` merge that contains it (`git merge-base --is-ancestor` and `git log --merges --first-parent`, 2026-10-27):

| Branch | Head | Record read | Landed |
| --- | --- | --- | --- |
| `run-g2-partition-and-races` | `5bed450b` (archive commit; read before the coordinator returned the task to its worker) | `openspec/changes/archive/2026-10-27-run-g2-partition-and-races/proposal.md`, `verification.md`, `results.jsonl` | #333, `744689cb` |
| `break-fair-order-ties-by-task-id` | `e66d0d72` (archive commit) | its archived `proposal.md` and `verification.md` | #336, `0864892f` |
| `stabilize-placement-fair-order-test` | `1a9fa773` (archive commit) | its archived `proposal.md` and `verification.md` | #331, `477a423e` |
| `fix-platform-probe-filesystem-label` | `b6d7dbb9` (archive commit) | its archived `proposal.md` and `verification.md` | #335, `627c8c03` |
| `align-fair-order-rotation` | `d5f3baf3` (archive commit) | its archived `proposal.md`, `design.md`, and `verification.md` | #337, `37afc149` |

Outside the repository: the away run `20261027T045006Z-opencode-96871` (`decision.md`, `meta.txt`, `packet.md`) in the coordinator's local away run directory, a local, unversioned record; the ADR names it as such. No web link is used; pull request numbers are those of the GitHub repository `petarnenov/taskelith`, each named with its merge commit.

Not found in the repository or on any remote branch at the evidence update, so recorded then only as the coordinator stated them: `stop-automatic-retry-of-unknown-exit`, `centralize-log-redaction-rules`, `advance-placement-rotation-cursor`, `check-change-record-links`, the worker image reproducibility follow-up, the quadratic behaviour of `redactText`, the 24c macOS hang, Desi's diagnostic of 2026-10-27 on the Intel iMac, `back-off-relaunch-after-pre-w2-failure`, and `align-safe-to-retry-with-supervisor-identity`. Every branch in the table above is now archived on `dev`, and so are `stop-automatic-retry-of-unknown-exit`, `centralize-log-redaction-rules`, `advance-placement-rotation-cursor`, `back-off-relaunch-after-pre-w2-failure`, and `align-safe-to-retry-with-supervisor-identity` ("Landed changes" below); the 24c record and the `centralize-log-redaction-rules` proposal record the macOS hang and the quadratic rules. The exceptions, still without an archive or any record in the repository: `check-change-record-links`, the worker image reproducibility follow-up, and Desi's diagnostic.

### Landed changes

On `dev` at `bd6108d4`, each archived under `openspec/changes/archive/2026-10-27-<change>/` and found with `git log --first-parent --diff-filter=A origin/dev -- <archive>/proposal.md`, which names the `dev` merge that added it:

| Change | Pull request | `dev` merge |
| --- | --- | --- |
| `stabilize-placement-fair-order-test` | #331 | `477a423e` |
| `stop-automatic-retry-of-unknown-exit` | #332 | `b79a2a3d` |
| `run-g2-partition-and-races` | #333 | `744689cb` |
| `require-finding-capability` (not a G2 row) | #334 | `9c0c1706` |
| `fix-platform-probe-filesystem-label` | #335 | `627c8c03` |
| `break-fair-order-ties-by-task-id` | #336 | `0864892f` |
| `align-fair-order-rotation` | #337 | `37afc149` |
| `advance-placement-rotation-cursor` | #338 | `3db26333` |
| `centralize-log-redaction-rules` | #339 | `606df666` |
| `alternate-reviewers-per-pass` (not a G2 row) | #340 | `d3e9e636` |
| `back-off-relaunch-after-pre-w2-failure` | #341 | `1fc7006f` |
| `align-safe-to-retry-with-supervisor-identity` | #342 | `bd6108d4` |

Read from those archives: 24c `results.jsonl` on `dev` holds 34 records, all `passed`, of commit `36481ad9` (Linux 6.8.0-147-generic, `x64`), 17 with seed `20261026` and 17 with seed `7`; the branch head read earlier had `9630470a`, re-run after the return (its verification, "Revision and environment"). `stop-automatic-retry-of-unknown-exit` verification, "Evidence check": `make verify-linux-crash-windows` passed 29 of 29, CP9 included. The ADR's remaining code lines were re-checked on this branch: `placement-service.ts:51` (the `#after` field) and `:89` (its assignment) moved from `:47` and `:78`; the scheme-less user-information rule moved to `packages/modules/observability/src/domain/redaction-rules.ts:44` with #339; `signals.ts:21`, `control-plane-signals.ts:25`, `compose.yaml:108`, and `crash-windows.integration.test.ts:38` still hold. Lines the ADR no longer cites, because the entries now cite the landed change: `launch-orchestrator.ts`, `capacity-operations.ts`, `redaction.ts`, the two contract lines, and the probe script lines.

### arm64 numbers

`openspec/changes/archive/2026-10-26-run-g2-native-acceptance-arm64/results.jsonl`, lines 4 to 29, are the 26 crash windows, all of commit `4b3d6937`, host Darwin 25.6.0, arch `arm64`, target `harness-composition`: 15 `passed` and 11 `failed` with `D1:` in the detail (W3, W4, and W6 both sides; CP1, CP2, CP3, CP5, CP6). The file's 46 records hold 35 `passed` and 11 `failed`. `acceptance.md` of the same archive, line 20, the process ownership row of `macos-26-arm64`, states the same 15 and 11.

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
- 24c: 34 records, all `passed`, commit `36481ad9` in the archive on `dev` (`9630470a` on the branch head read at the update; "Landed changes" above), host Linux 6.8.0-147-generic, 17 records with seed `20261026` and 17 with seed `7`, 17 distinct scenarios.
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

## Fresh-clone reproduction

Run by worker Desi on 2026-10-27, 13:29:33 to 13:42:18 +0200, on the coordinator's Intel iMac in a host slot granted by coordinator Niki, with a script in the session's scratch directory that ran each step in order, logged it, and recorded its exit status and duration. The clone, the logs, and the script stay in that local scratch directory and are not committed; the native acceptance records are committed as [`fresh-clone-results.jsonl`](fresh-clone-results.jsonl), byte for byte (SHA-256 `e091dc3db09f1ccebdfb0f1ac205acac4bf50a230ac8431131aa3699fd1da670`).

- Revision: `git rev-parse HEAD` of the clone, `bd6108d44142b697a3f1fde6be997ec83665a64f`, `dev` after #342; every record of `fresh-clone-results.jsonl` names it.
- Host: `uname -a` Darwin 25.6.0, `x86_64`; `sw_vers` macOS 26.6.2, build 25G83. Toolchain: Node.js v24.22.1 and npm 12.2.1 from `.nvmrc` through `nvm use`; Docker Engine 29.5.2, server and client, of Docker Desktop.
- Docker configuration: the script exported `DOCKER_CONFIG` for every step, set to a directory whose `config.json` is `{}`, because Docker Desktop's credential helper hangs on this host, as in 25c (its verification, "Environment re-check before the evidence run"). Steps 4 to 7 are the ones that call Docker.
- Two differences from the commands of ADR 0015 decision 4: the clone checked out `dev` with `git clone --branch dev` instead of `git switch dev`, and `make setup` was not preceded by a separate `make doctor`, because `make setup` runs its checks.

| # | Step | Exit | Duration | Result |
| --- | --- | --- | --- | --- |
| 1 | `git clone --branch dev https://github.com/petarnenov/taskelith.git <scratch>` | 0 | 3 s | Cloned `dev` at `bd6108d4` |
| 2 | `nvm use` | 0 | 0 s | Node.js v24.22.1 (npm v12.2.1) from `.nvmrc` |
| 3 | `make setup` | 0 | 7 s | `npm ci --ignore-scripts` added 595 packages; hooks and the inventory merge driver configured; "All checks passed." `npm ci` printed its audit summary, 2 vulnerabilities (1 moderate, 1 high), as on `dev`; not part of any check |
| 4 | `make verify` | 0 | 193 s | Comments and 19 findings files valid; 2093 tests, 44 suites, 2091 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.29 % lines, 92.12 % branches, 99.00 % functions; every product module in the report; contracts without a breaking change against `bd6108d44142`; "Verified 731 package paths"; `openspec validate --all --strict` 69 passed, 0 failed; no active change to archive; package allowlist and installed CLI verification passed. The log marks two Linux scan tests and the 24c cancellation-race, partition, and stale-generation scenarios as skipped outside Linux, as on the coordinator's iMac before |
| 5 | `make verify-installation` | 0 | 75 s | "built, bootstrapped, started, enrolled, restarted, removed" |
| 6 | `make installation-smoke` | 0 | 29 s | Run `installation-smoke-run` ended `exited` with code 0 and `startProven`; "submitted, assigned, executed, stored the result, removed" |
| 7 | `make native-acceptance RESULTS=<scratch>/results.jsonl` | 0 | 457 s | Seed `3537894576`, entries `macos-26-x86_64` and `linux-ubuntu-24.04-x86_64`; "every proof passed"; 48 records, all `passed` |
| 8 | `git status --short` | | | Empty |

### Native acceptance records

Read with `jq` from `fresh-clone-results.jsonl`: 48 records, each `passed`, seed `3537894576`, commit `bd6108d4`, host Darwin 25.6.0, arch `x64`; 15 records name an `acceptance-` proof and 33 are the scenario records under them.

- `macos-26-x86_64`, 37 records: 2 `compose-installation` (the native worker lifecycle and its proof), 31 `harness-composition` (28 crash windows, the crash-window proof 28 of 28, duplicate delivery and its proof 1 of 1), and 4 `host-test-suite` proofs (supervisor suites 113 of 113, journal suites 99 of 99, cancellation suites 19 of 19, connectivity suites 25 of 25). By row: process ownership 30, service lifecycle 2, connectivity 3, journal and storage 1, cancellation 1.
- `linux-ubuntu-24.04-x86_64` under Docker Desktop, 11 records: 6 `compose-installation` (worker lifecycle, worker kill, and worker disk loss, each with its proof) and 5 `linux-test-container` proofs (cgroup 14 of 14, journal suites 97 of 99 with 2 skipped, cgroup cancellation 2 of 2, cancellation suites 17 of 19 with 2 skipped, connectivity suites 25 of 25). By row: process ownership 3, journal and storage 3, cancellation 2, service lifecycle 2, connectivity 1.

Compared with 25c's [`results.jsonl`](../archive/2026-10-27-run-g2-native-acceptance-x86-64/results.jsonl), lines 1 to 48 (commit `b82ad2f`, seed `4080300788`, the same host): the same 48 scenarios with the same entry, row, and target, all `passed`, and the same 15 proofs; the crash windows finish in another order. The only count that differs is the journal suites, 99 tests instead of 97 on both entries, because the journal tests grew on `dev` after `b82ad2f`. 25c's line 49, the namespace-confinement extra, was not part of this run. The results match.

Content check: `grep` for token, secret, password, bearer, API key, authorization, and credential shapes found only the text "started again without a token" in the native lifecycle detail; no secret. Like 25c's committed records, one record names the local user `petarnenov` and the native data root under the user's temporary directory `/private/var/folders/...`; the session's scratch path does not appear. They are kept, consistent with 25c.

## Owner and coordinator decisions of 2026-10-27, after #342

From coordinator Niki's brief of 2026-10-27, which relays the owner's decisions of that day:

1. **arm64 re-run deferred (owner).** The owner removed Maki from the fleet, because its session hung and could not be restarted remotely. The macOS arm64 process ownership crash-window re-run after the D1 fix is deferred to G3, to run when the owner has physical access to the MacBook Air. It is an owner-confirmed deferral, not an author's assignment. G2 closes on the one arm64 run of 25b (15 passed, 11 failed on D1; "arm64 numbers" above), the x86_64 macOS run of 25c, and the Linux crash windows of #329. Recorded in ADR 0015 decisions 3 and 5 and the foundation ledger.
2. **No blockers remain (coordinator).** 24c landed with #333 and the fix of L1 with #332; the ReDoS fix had landed with #330. The ADR records each blocker as resolved, with its pull request, `dev` merge commit, and archive.
3. **Landed follow-ups (coordinator).** `align-safe-to-retry-with-supervisor-identity` landed with #342, so its deferral is dropped from the ADR and the ledger and recorded as landed. The other deferrals whose follow-ups landed (`back-off-relaunch-after-pre-w2-failure`, `centralize-log-redaction-rules`, the fair-order changes, `fix-platform-probe-filesystem-label`, and the flaky fair-order test) are recorded the same way, each with the limitations its record leaves open; `placement-backoff-preserves-rotation`, which `advance-placement-rotation-cursor` names, is added to the ledger as after G2 and contract-first.
4. **Fresh clone (coordinator).** The coordinator runs the fresh-clone reproduction; the ADR's decision 4 placeholder now lists its commands, checked against the `Makefile` (`verify-installation`, `installation-smoke`, `native-acceptance` with `RESULTS`), `scripts/native-acceptance.sh` (on Darwin the default entries are `macos linux`), and the 25c record (`DOCKER_CONFIG` on the iMac and the data-root disk floor of its design decision 2).

### Roster

By the owner's instruction of 2026-10-27, relayed by the coordinator, Maki is removed as an active worker:

- `docs/fleet.md`: the roster row `| Maki | Worker | Another machine (macOS arm64) | |` is removed. No rule of that page names Maki or assigns arm64 tasks to a machine, so no rule changed.
- ADR 0015: the blocker "Maki re-runs it before the closure" and the arm64 assignment of decision 3 are replaced by the owner's deferral; the deferral of archived record links now says that `check-change-record-links`, assigned to Maki, has no worker.
- `docs/foundation.md`: the blocker sentence naming Maki's re-run is replaced.
- Searched with `grep -rn Maki` outside `openspec/changes/archive/` and `.git`: no other active mention in `docs/architecture.md`, `AGENTS.md`, `.claude/`, or elsewhere (`architecture.md` matches only the word "Making"). Historical mentions in this record and everything under `openspec/changes/archive/` are kept.

## Coordinator answers of 2026-10-27, after the fresh clone

From coordinator Niki's brief of 2026-10-27:

0. **Landed follow-ups stay rewritten as resolved,** each with the limits its record leaves open and its pull request: the relaunch back-off #341, safe-to-retry #342, the fair-order rotation #336 to #338, the flaky fair-order test #331, the platform probe label #335, and the logger redaction rules #339. Checked in ADR 0015 decision 5, where each entry names its pull request; the foundation ledger now lists them with their pull requests in its G2 paragraph.
1. **Governance exceptions (coordinator).** This change is reviewed under governance policy version 5, although it was briefed before version 5 reached `dev`, an explicit exception to "Tasks under the previous rule": it is the G2 closure record that the owner accepts, and version 5 landed (#340) before its review began. Reviewer B is Codex `gpt-6.1-sol` by name, an exception to "Rotation", whose turn after reviewer A, OpenCode `kimi-k3.1-pro`, would skip the paused Antigravity CLI and OpenCode `deepseek-v4-pro`, the same harness as A, and reach Claude Code `claude-fable-5-1`: the archived findings show `gpt-6.1-sol` finding most High and Medium issues, and Antigravity is paused until about 2026-10-31. Reviewer A is OpenCode `opencode-go/kimi-k3.1-pro#high` (passes 1 and 3), reviewer B Codex `gpt-6.1-sol` (pass 2).
2. **`check-change-record-links` reassigned to Pepi,** in progress on a branch from `bd6108d4`: an open follow-up owned by Pepi, not a deferral, in ADR 0015 decision 5 and the ledger. It replaces "has no worker" in the roster item above.
3. **In-memory `#after` rotation cursor:** stays listed as the author's assignment, owner to confirm; the owner decides it at the acceptance of ADR 0015.
4. **Follow-up owners (coordinator Niki's decision, 2026-10-27, brief after pass 2).** `placement-backoff-preserves-rotation`: Liki, in progress. `make native-acceptance` without the Linux crash windows: Zaki, in progress as change `wire-linux-crash-windows-into-native-acceptance`. Worker image reproducibility: the coordinator, not assigned to a worker yet (not Liki). Confirmed: the in-memory rotation cursor, the hosted-runner Linux x86_64 check, and multi-architecture `make verify-linux-cgroup` to the coordinator; `check-change-record-links` to Pepi; the Docker credential helper on the iMac to the owner. These owners are the coordinator's decision, no longer the author's assignment, in ADR 0015 decision 5 and the ledger; keeping the cursor in memory and the no-gate disposition of image reproducibility stay the author's assignment, owner to confirm.

## Remaining placeholders

Only the two owner-acceptance placeholders remain:

- ADR 0015 decision 6, "closure statement", pending the owner's acceptance; the ADR stays Proposed.
- `docs/foundation.md`, G2 status: the closure sentence "G2 is closed".

The fresh-clone placeholder of decision 4 is filled, and the "work items" placeholder of decision 1 was filled earlier.

## Checks

Light checks only until `d7bc65bd`, because the host is shared with evidence runs; `make verify` then ran at `d7bc65bd` (last item).

- Draft, at `0bec0a6`: `npm run openspec -- validate close-g2 --strict` passed; `npm run verify:comments` passed; `make findings ARGS="validate"` passed (3 files).
- Evidence update, in `ee66935f`: `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run findings -- validate` passed ("Every findings file is valid: 6 file(s)."); `npm run verify:comments` passed ("Every comment is within the comment length rule."); `git diff --check` reported nothing.
- Blocker update: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Relaunch back-off deferral: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Safe-to-retry deferral: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (6 files); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Landed ReDoS fix and Linux crash windows: `npm run openspec -- validate close-g2 --strict` passed; `npm run findings -- validate` passed (8 files, with the two archives of #329 and #330); `npm run verify:comments` passed; `git diff --check` reported nothing.
- Owner decisions after #342 (this update): `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run openspec -- validate --all --strict` passed (70 passed, 0 failed); `npm run verify:comments` passed; `npm run findings -- validate` passed ("Every findings file is valid: 20 file(s)."); `git diff --check` reported nothing; every relative link in the ADR, the ledger, `docs/fleet.md`, and this change resolves (a scratch script over `](...)` targets). Archive test in a scratch copy of the tracked `openspec/` tree and this change, with this worktree's `node_modules`: `openspec archive close-g2 --yes` archived it as `2026-10-27-close-g2` (`foundation-closure` + 1), and `openspec validate --all --strict` then passed (69 passed, 0 failed).
- Fresh-clone record and coordinator answers (this update): `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run openspec -- validate --all --strict` passed (70 passed, 0 failed); `npm run verify:comments` passed; `npm run findings -- validate` passed ("Every findings file is valid: 20 file(s)."); `git diff --check` reported nothing; the 93 relative link targets in the ADR, the ledger, `docs/fleet.md`, and this change's Markdown resolve, apart from the literal `](...)` in the check line above. Archive test in a scratch copy of the tracked `openspec/` tree and this change, with this worktree's `node_modules`: `openspec archive close-g2 --yes` archived it as `2026-10-27-close-g2` with `fresh-clone-results.jsonl` (`foundation-closure` + 1), and `openspec validate --all --strict` then passed (69 passed, 0 failed). `make verify` was not run on this branch.
- `make verify` at `d7bc65bd`, the revision of review pass 1, 2026-10-27: exit 0 in 206 s; 2113 tests, 2111 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.29 % lines, 92.11 % branches, 99.00 % functions; findings valid (21 files) and pass summaries valid (2 files). Docker ran with `DOCKER_CONFIG` set to an empty configuration, as in the fresh-clone reproduction.
- Pass 1 fixes and record (`991324dd` and the record commit after it): `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run openspec -- validate --all --strict` passed (70 passed, 0 failed); `npm run verify:comments` passed; `npm run findings -- validate` passed ("Every findings file is valid: 21 file(s); every pass summary file is valid: 2 file(s)."); `git diff --check` reported nothing; the 94 relative link targets in the ADR, the ledger, `docs/fleet.md`, and this change's Markdown resolve. Archive test in a scratch copy of the tracked `openspec/` tree and this change, with this worktree's `node_modules`: `openspec archive close-g2 --yes` archived it as `2026-10-27-close-g2` with `findings.jsonl`, `passes.jsonl`, and `fresh-clone-results.jsonl` (`foundation-closure` + 1), and `openspec validate --all --strict` then passed (69 passed, 0 failed). `make verify` was not run again; these commits change documentation and records only.
- Pass 2 fixes and record (`ac922f31` and the record commit after it): `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run openspec -- validate --all --strict` passed (70 passed, 0 failed); `npm run verify:comments` passed; `npm run findings -- validate` passed ("Every findings file is valid: 21 file(s); every pass summary file is valid: 2 file(s)."); `git diff --check` reported nothing; the 95 relative link targets in the ADR, the ledger, `docs/fleet.md`, and this change's Markdown resolve. The requirement body is 497 characters. Archive test in a scratch copy of the tracked `openspec/` tree and this change, with this worktree's `node_modules`: `openspec archive close-g2 --yes` archived it as `2026-10-27-close-g2` with `findings.jsonl`, `passes.jsonl`, and `fresh-clone-results.jsonl` (`foundation-closure` + 1), and `openspec validate --all --strict` then passed (69 passed, 0 failed). `make verify` was not run again; these commits change documentation and records only.
- Follow-up owners set by the coordinator (this update): `npm run openspec -- validate close-g2 --strict` passed ("Change 'close-g2' is valid"); `npm run openspec -- validate --all --strict` passed (70 passed, 0 failed); `npm run verify:comments` passed; `npm run findings -- validate` passed ("Every findings file is valid: 21 file(s); every pass summary file is valid: 2 file(s)."); `git diff --check` reported nothing; the 95 relative link targets in the ADR, the ledger, `docs/fleet.md`, and this change's Markdown resolve. `make verify` was not run; this commit changes documentation only.
- `make verify` at `1f8a04ba`, after the pass 2 fixes and the follow-up owners, 2026-10-27: exit 0 in 166 s; 2113 tests, 2111 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.29 % lines, 92.11 % branches, 99.00 % functions; findings valid (21 files) and pass summaries valid (2 files). Docker ran with `DOCKER_CONFIG` set to an empty configuration, as above.

## Independent review

The record before this update named one reviewer, OpenCode `opencode-go/kimi-k3.1-pro#high`, under governance policy version 4. This task was briefed before version 5 reached `dev` (#340), but the coordinator assigned it under version 5 (Niki, 2026-10-27): reviewer A OpenCode `opencode-go/kimi-k3.1-pro#high`, reviewer B Codex `gpt-6.1-sol`. Governance "Tasks under the previous rule" would otherwise finish a task briefed before version 5 under version 4's one reviewer, and "Rotation" would give another reviewer B; both exceptions are the coordinator's, with the reasons under "Coordinator answers of 2026-10-27, after the fresh clone", item 1.

### Pass 1 (reviewer A)

- Reviewer: OpenCode, model `opencode-go/kimi-k3.1-pro`, variant `high`, agent `reviewer`; the JSON output confirmed the model and variant. Session `ses_e82c9a9a6ffekHu2Tsz94tSyX6`.
- Invocation: `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title close-g2 "<prompt>" < /dev/null`.
- Run: 2026-10-27, 13:54:34 to 13:57:38 local, on `d7bc65bd`, read-only. The worktree snapshot was `1b0bb5a900bede6f8b9e4db91b5827f1db4e645cd3ecaf95ff063e6ef9e9c67d` before and after the run.
- Findings: 0 Critical, 1 High, 2 Medium, 2 Low, as `passes.jsonl` and `findings.jsonl` record them. Each was checked against the repository before it was fixed; none was wrong.
- Fix commit: `991324dd`. Every finding is `fixed-unreviewed` until pass 2 checks it.

| Finding | Resolution |
| --- | --- |
| H1: macOS race g and the macOS cancellation and connectivity parts that 25b and 25c leave to 24c had no deferral; 24c pointed to item 25 and the item 25 records to 24c | Coordinator Niki's decision of 2026-10-27, option (a), in the brief of the pass 1 fixes: one G3 deferral, "macOS cancellation race g and the 24c-dependent macOS rows", under "Containment and platforms" next to the arm64 re-run, marked as the author's assignment for the owner to confirm at the ADR's acceptance. It cites race g in the 24c verification's scenario table and the Cancellation and Connectivity (G2) rows of the macOS entries in the 25b and 25c `acceptance.md`. ADR decisions 2 and 3 and the foundation matrix rows point to it, and the ADR says that it supersedes the archived records' pointers, which are not edited. The 24c suites skip outside Linux since `6d40c0c4` (`SCENARIO_HOST`, `test/g2-scenarios/scenario-run.ts:16`; recorded in `e5db6610`, which changes only the 24c record), so they cannot run on macOS as built. The foundation deferral table has a row for it |
| M2: the row map gave `report-control-plane-failure-cause` #330 and `report-all-unconfirmed-sealed-executions` #326 | `git log --first-parent --diff-filter=A origin/dev` of each archive: #322 merge `656a34d0` and #325 merge `fe643864`; the grouped entries are split, each change with its own pull request and merge commit |
| M3: the evidence check of the update cited 24c commit `9630470a` | The archived `results.jsonl` names `36481ad9` in all 34 records; cited, with `9630470a` kept as the branch head read then |
| L4: the revision list stopped before the merge of #343 | Added the merge `2f9b1010` and `d7bc65bd`, the revision of `make verify` and of this pass; the `make verify` run is under "Checks" |
| L5: #326 to #330 had no merge commit in the row map | Added `3b1d1e33`, `33d341a9`, `2a26714b`, `1e48c93b`, and `92f0830b`, each checked with `git log --merges origin/dev` |

Next: pass 2 by reviewer B, Codex `gpt-6.1-sol`, a full independent review of the change and a check of the pass 1 fixes.

### Pass 2 (reviewer B)

- Reviewer: Codex CLI v0.164.0, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`; the run's header confirmed the version, model, reasoning effort, and sandbox. Session `01a17d3d-a7f0-76c0-929f-46662130bfe1`.
- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Run: 2026-10-27, 14:02:34 to 14:06:20 local, on `fa1b127d`, read-only. The worktree snapshot was `6c52bb3e3ea770d91c5927e5100f62578bb648daad356c3f0f4e6545ef9fa5ba` before and after the run.
- Pass 1 confirmation: all five pass 1 findings resolved; their lines in `findings.jsonl` are now `fixed`.

| Pass 1 finding | Pass 2 confirmation |
| --- | --- |
| H1: macOS race g and the 24c pointers | Resolved: ADR decision 5 defers race g and both macOS entries' 24c-dependent rows to G3 as an author's assignment and supersedes the archived pointers; the ledger mirrors it |
| M2: wrong pull requests in the row map | Resolved: #322 merge `656a34d0` and #325 merge `fe643864`, as the first-parent merge history shows |
| M3: superseded 24c evidence commit | Resolved: `36481ad9` cited; all 34 archived records name it |
| L4: missing revision records | Resolved: merge `2f9b1010` of `34af90f4` and the reviewed head `d7bc65bd` recorded |
| L5: missing merge commits for #326 to #330 | Resolved: `3b1d1e33`, `33d341a9`, `2a26714b`, `1e48c93b`, and `92f0830b`, as the merge history shows |

- Findings: 0 Critical, 1 High, 1 Medium, 3 Low, as `passes.jsonl` and `findings.jsonl` record them. Each was checked against the repository before it was fixed; none was wrong. All five were present at `d7bc65bd`, inside the full review of pass 1, so each names `missedBy` pass 1, reviewer A.
- Fix commit: `ac922f31`. Every pass 2 finding is `fixed-unreviewed` until pass 3 checks it.

| Finding | Resolution |
| --- | --- |
| H1: the Linux cancellation and connectivity rows (25b and 25c `acceptance.md` lines 25 and 27, Linux-host `acceptance.md` lines 30 to 32) pointed to 24c, whose 34 records are Linux x64 runs with the test-side process-group launch host (24c verification line 204 excludes the Linux cgroup supervisor) | Checked: every 24c record has arch `x64`, host Linux 6.8.0-147-generic, and target `harness-composition`. Coordinator Niki's decision of 2026-10-27, option (a), in the brief of the pass 2 fixes: the G3 deferral is widened and retitled "Cancellation race g and the 24c-dependent rows on macOS and Linux". It names the Cancellation and Connectivity (G2) rows of 25b (`macos-26-arm64`, `linux-ubuntu-24.04-arm64`), 25c (`macos-26-x86_64`, `linux-ubuntu-24.04-x86_64` under Docker Desktop), and the Linux-host run (`linux-ubuntu-24.04-x86_64`, native host); states that 24c's records come from the test-side process-group launch host, not the cgroup supervisor or a native worker, so these rows have no native evidence; and stays the author's assignment, owner to confirm. ADR decisions 2 and 3 and the foundation matrix rows of both Linux entries point to it instead of 24c, and the ledger row covers all four entries |
| M2: the closure requirement required a later gate for every unfinished item, while the ADR keeps follow-ups without one | Coordinator Niki's decision of 2026-10-27, option (a): the requirement and its scenario, now "Unfinished item", accept a deferral to a named later gate or a non-blocking follow-up with its owner, each with its source or as the author's assignment for the owner to confirm. Requirement body 497 characters (464 before); the scratch archive test passes strict validation. ADR decision 5 now says so in its introduction and labels each follow-up with its owner, as later set by the coordinator's decision under "Coordinator answers of 2026-10-27, after the fresh clone", item 4: the coordinator for the in-memory cursor, the image reproducibility, the hosted-runner check, and the multi-architecture tooling; Liki for `placement-backoff-preserves-rotation`; Zaki for the Linux crash windows in `make native-acceptance`; Pepi for `check-change-record-links`; the owner for the Docker credential helper, which is not G2 work. Resolved items and the rejected assignment-age option are marked as not open work. The ledger rows match |
| L3: the ledger lacked the multi-architecture `make verify-linux-cgroup` follow-up | Added to the ledger's coordinator-owned follow-up row |
| L4: the record called every listed change archived, `check-change-record-links` and the image reproducibility follow-up included | The archive claim names the five landed changes; the three items without a record are named as exceptions |
| L5: negative ancestry statements about the moving `dev` ref were stale | Stated against `92f0830b`, with the current disposition checked by `git merge-base --is-ancestor` and `git log --merges --first-parent`: `e5db6610` and `5bed450b` landed with #333 (`744689cb`), `e66d0d72` with #336 (`0864892f`), `1a9fa773` with #331 (`477a423e`), `b6d7dbb9` with #335 (`627c8c03`), and `d5f3baf3` with #337 (`37afc149`); the branch table has a "Landed" column |

Next: pass 3 by reviewer A, OpenCode `opencode-go/kimi-k3.1-pro#high`: confirmation of the pass 2 fixes only, no new scope. The pass cap of three is reached after it.

## Remaining gates

- The owner's confirmation of each author's assignment, the widened deferral "Cancellation race g and the 24c-dependent rows on macOS and Linux" (macOS and Linux, all four entries and the native Linux host) and the in-memory rotation cursor included (the follow-up owners of ADR 0015 decision 5 are the coordinator's decision of 2026-10-27), and of the hosted-runner check left open, and the closure records (section 4 of `tasks.md`).
- Independent review under governance version 5: pass 1 by reviewer A OpenCode `opencode-go/kimi-k3.1-pro#high` and pass 2 by reviewer B Codex `gpt-6.1-sol` are done and fixed; pass 3 by reviewer A remains, a confirmation of the pass 2 fixes only, after which the pass cap is reached; recorded here, in `findings.jsonl`, and in `passes.jsonl`.
- `make verify` again on the head that is integrated, by the pre-push hook.
- Owner acceptance of ADR 0015.
- Archive of this change after review and verification, as the last commit of the branch; the archive commit points the ADR's links to `fresh-clone-results.jsonl` at the archived path.
- Integration into dev by the coordinator (single pull request). Promotion to `main` is a later owner decision.
