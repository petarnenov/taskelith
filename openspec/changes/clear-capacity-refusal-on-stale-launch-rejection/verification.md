# Verification

Date: 2026-10-26. The author verification and review passes 1 to 3 are recorded below. Every finding is fixed; the pass 3 Low fix is unreviewed.

## Scope and source

Bug B5, from Zaki's dump of the G2 item 24c scenarios (B3 there), as Niki briefed it. A worker refuses the next generation's offer with `worker-slots-exhausted`. The earlier generation's launch is then rejected with `assignment-not-active`, and that observation is rejected as `stale-ownership-generation` before the capacity refusal is cleared. The refusal stays, and the worker gets no new offer (2 failures in 6 runs). The coordinator decided the open questions of the design pass:

- Q1 (b): every final launch rejection clears its producer's capacity refusal under the fence, at the current or a stale generation.
- Q2: stale-epoch and quarantine evidence still applies nothing (launch authorization section 7).
- Q3 (a): the section 8 "Ended assignments" bullet is not reworded. The worker's gap goes to backlog item `end-assignment-on-not-active`.

An implementation subagent that the worker session briefed and checks developed the change.

- Base revision: `26ff102` on `dev`.
- Scope:
  - capacity reservation contract section 8, the "Refusal" bullet only;
  - `apps/control-plane/src/application/observation-effects.ts` and `observation-service.ts`;
  - control-plane tests;
  - the spec deltas of `observation-consumption` and `launch-reconciliation`.
- Out of scope:
  - the 24c scenario test and its B3 todo;
  - the worker's local end of an assignment on `assignment-not-active`;
  - stale-epoch and quarantine evidence;
  - launch authorization section 9, which stays correct (design D4).

## Evidence

- Revision: `7852684` for the author check (the contract, code, and tests). This file was written after the run.
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1, Docker 29.5.2 with the Compose services of `make verify`.
- Dependencies: no package added.
- Published package: unchanged. Every changed package is a private workspace package, so the commits are `chore`, `test`, and `docs` ([releases](../../../docs/releases.md)).

## Author self-check

- **Contract.** Section 8 "Refusal" now ends the ineligibility at the next capacity declaration or at an observation that frees a slot: an exit, a `not-started`, or a launch rejection. Such an observation clears the refusal even at a stale ownership generation, as evidence that changes no task, attempt, or assignment. After review pass 1 the clear is limited to the worker's own assignment, and an observation that launch authorization section 7 keeps as evidence leaves the refusal in place, as does one older than the refusal by its journal sequence. The rest of the section is untouched.
- **Control plane.**
  - `clearRefusal` clears the producer's refusal under its fence. `recordTerminalFact` and `launchRejection` call it; `launchRejection` calls it after the reporter's assignment is confirmed.
  - `rejectedEffect` returns the evidence effect of a stale `execution.launch.rejected`, `execution.not-started`, or `execution.exited`, and nothing else. That effect clears only when the producer holds the named assignment (a launch rejection) or an assignment of the observed attempt (an exit or `not-started`). For an exit or `not-started` it also runs under `atCurrentEpoch` in the recording transaction.
  - `ObservationService.apply` passes it to the transaction that records the rejected observation. The outcome stays `rejected`, and the rejection is still logged.
- **Tests:**
  - `apps/control-plane/test/observation.integration.test.ts`, "capacity refusal after a slot-freeing observation":
    - "a stale launch rejection clears the refusal and changes nothing else". The task is unchanged, confirmations run 1 to 5, and the next pass places the attempt.
    - "a stale launch rejection older than the refusal keeps it".
    - "a stale not-started clears the refusal too".
    - "a stale acceptance keeps the refusal".
    - "a launch rejection at the current generation clears the refusal".
    - After review pass 1: "a stale fact about another worker's assignment keeps the producer's refusal", and "a stale not-started keeps the refusal after `UPDATE installation SET recovery_epoch = 2` (and `... quarantined = true`) between its transactions". A store wrapper changes the installation after the refused first transaction.
  - `apps/control-plane/test/observation-service.test.ts`: "a rejected ... clears/keeps the capacity refusal", on a placed attempt. A stale launch rejection and a stale exit of the producer's assignment clear it. The same two facts about another worker's assignment, a stale acceptance, and a launch rejection refused for another reason keep it. The first transaction is refused, as a rolled-back store would refuse it, and the recording transaction runs in memory.
- **Fail on the base code:** `observation-effects.ts` and `observation-service.ts` were replaced by their `26ff102` versions and rebuilt. The two test files were then run against the integration services: 75 tests, 70 passed, 5 failed. The failures:
  - the two unit cases that expect a clear;
  - "a stale launch rejection clears the refusal and changes nothing else";
  - "a stale not-started clears the refusal too";
  - "a launch rejection at the current generation clears the refusal".

  The fence and keep cases pass on both revisions. With the change: 75 of 75.
- **Fail on `f3fcc45` (review pass 1 tests):** `observation-effects.ts` was restored to its `f3fcc45` version and rebuilt. The same two files: 80 tests, 75 passed, 5 failed. The failures:
  - the two unit cases with another worker's assignment;
  - "a stale fact about another worker's assignment keeps the producer's refusal";
  - both "a stale not-started keeps the refusal after ... between its transactions".

  With the fix: 80 of 80.
- **Fail on `267ff6f` (review pass 2 test):** `observation-effects.ts` was restored to its `267ff6f` version and rebuilt. The same two files: 81 tests, 80 passed, 1 failed. The failure is "a failed lookup while a stale launch rejection is recorded leaves it unconfirmed, and its redelivery clears the refusal": the observation was confirmed instead of failing. With the fix: 81 of 81.
- **Comment rule:** `npm run verify:comments` passes within `make verify`.
- **Evidence check:** the change adds only repository-relative links, and each resolves.
- **OpenSpec:** `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict` passes. The modified requirement bodies are 458, 453, 438, and 411 characters.

## Checks and results

- `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict`: `Change 'clear-capacity-refusal-on-stale-launch-rejection' is valid`.
- `make verify` at `7852684`: passed (exit 0). 1913 tests, 1911 passed, 0 failed, and 2 Linux-only tests skipped on macOS. Coverage: 99.29% lines, 92.08% branches, 99.04% functions. The other checks also passed:
  - `Contract documents have no undeclared breaking change.`
  - OpenSpec `Totals: 70 passed, 0 failed`
  - `Every active OpenSpec change archives into strictly valid specs.`
  - `Packed file allowlist and installed CLI verification passed.`
- Merge of `origin/dev` at `f607d71` into the branch (a merge commit, no conflicts). It brought in 25 commits, including `fix-launch-recovery-reauthorization` and the native acceptance changes. It touched none of this change's requirements, contracts, implementation, or tests, and the dependency inventory stayed current.
- `make verify` at `7e00b32` (after the merge and the review pass 2 fix): passed (exit 0). 1932 tests, 1930 passed, 0 failed, and 2 Linux-only tests skipped. Coverage: 99.29% lines, 92.09% branches, 99.04% functions. Contract compatibility, OpenSpec (70 passed), the archive check, and the package check passed.
- `make verify` at `32aac2b` (after the review pass 1 fixes): passed (exit 0). 1918 tests, 1916 passed, 0 failed, and 2 Linux-only tests skipped. Coverage: 99.29% lines, 92.07% branches, 99.04% functions. Contract compatibility, OpenSpec (70 passed), the archive check, and the package check passed.

## Review pass 1

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox. The coordinator confirmed all three from the output header.
- Session: `01a179f9-5997-7993-ac64-c5f789ef0b79`.
- Invocation: run by the worker session from the worktree with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` ([agent task protocol](../../../docs/agent-task-protocol.md#reviewer-invocations)).
- Revision reviewed: `f3fcc45`. The snapshots before and after the pass matched (`1aa9593cf5ca9ec72f079e7a2d66a4cf066fd5bb0dcdc3b699efc4a375f378bd`).
- Findings: 0 Critical, 0 High, 2 Medium, 0 Low.

**Medium F1 (fixed), `observation-effects.ts:419`.**
- Finding: `reportersAssignment` checks the generation, through `currentAssignment`, before ownership. A worker reporting another worker's assignment at another generation was therefore refused as stale, and `rejectedEffect` cleared the reporter's refusal, contrary to design D2.
- Resolution: the evidence effect checks ownership itself, so the refusal reasons and their order are unchanged (design D3):
  - a launch rejection's named assignment must be of the observed attempt and held by the producer;
  - an exit or `not-started` needs an assignment of the observed attempt held by the producer.
- The launch-reconciliation delta now reads "of the producer's own assignment, at the current or a stale generation". Section 8 and the observation-consumption delta name the own assignment.
- Regression tests: the integration test and the two unit cases with another worker's assignment.

**Medium F2 (fixed), `observation-effects.ts:420`.**
- Finding: the refused first transaction checked the epoch and quarantine gate, but the recording transaction cleared the refusal without checking it again. An epoch change or a quarantine between the two transactions still cleared it, contrary to Q2 and "Epoch gate before effects".
- Resolution: the evidence effect of an exit or `not-started` is wrapped in `atCurrentEpoch`, so the recording transaction checks the gate again (design D5). A launch rejection has no recovery epoch and its applied effect no gate, so it stays ungated.
- Regression tests: the two "between its transactions" integration tests.

Two Medium findings were fixed, so review pass 2 is required.

## Review pass 2

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, all confirmed in the output header.
- Session: `01a17a09-9a88-7620-b807-8508f9b6b325`.
- Invocation: the same as in pass 1.
- Revision reviewed: `267ff6f`. The snapshots before and after the pass matched (`34e4c62a7b9f82b234d7ab8c6997af30f7740eb92d445fa93b5002a4a47a259a`).
- Pass 1 F1 and F2: confirmed resolved.
- New findings: 0 Critical, 0 High, 1 Medium, 0 Low.

**Medium F3 (fixed), `observation-effects.ts:425`.**
- Finding: `namedAssignmentHeld` turned every failed `assignments.get` into "not held", `unavailable` included. The recording transaction then confirmed the observation without the clear. Its redelivery would be a duplicate, so the missed clear was never repaired, and B5's block returned.
- Resolution: `Holding` returns `Result<boolean>`, and `clearOwnRefusal` returns a failed lookup. Only `not-found` counts as not held. Any other failure rolls back the recording transaction, and the observation is delivered again (design D3).
- `attemptAssignmentHeld` uses `listByAttempt`, whose port returns no `Result`, so a store failure there already fails the transaction.
- The neighbouring effects in `observation-effects.ts`, `observation-service.ts`, and `assignment-freeing.ts` were checked for the same pattern, and each returns its failure.
- Regression test: "a failed lookup while a stale launch rejection is recorded leaves it unconfirmed, and its redelivery clears the refusal". The lookup fails only in the recording transaction; the observation is unconfirmed (confirmations 1 to 4) and the refusal stays. The same observation delivered again is `rejected`, clears the refusal, and is confirmed.

One Medium finding was fixed, so review pass 3, the last allowed, is required.

## Review pass 3

- Reviewer: Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, all confirmed in the output header.
- Session: `01a17a14-01e0-7750-aa8b-eb813af9f886`.
- Invocation: the same as in pass 1.
- Revision reviewed: `b7f737d`, after the session merged `origin/dev` into the branch (a merge commit, no conflicts). That merge brought in the `streamline-task-integration` process change, including worker step 7 "Archive" of the [agent task protocol](../../../docs/agent-task-protocol.md). It touched none of this change's requirements, contracts, implementation, or tests.
- The snapshots before and after the pass matched (`4d033361a01a627e60ee40fcc70d80fe4b55e5f68c8a7072b0e9466d39663824`).
- Pass 2 F3: confirmed resolved; F1 and F2 stay resolved; no new functional defect.
- New findings: 0 Critical, 0 High, 0 Medium, 1 Low.

**Low F4 (fixed, unreviewed), `proposal.md:18`.**
- Finding: the proposal said the "Stale ownership generation" delta adds two scenarios, but it adds four.
- Resolution: the proposal now says four scenarios. A Low-only pass is fixed without another review ([review process](../../../docs/governance.md#independent-review-process)), so this fix is unreviewed.

## Limitations and remaining gates

- A clear can cost one refused offer when the worker has not yet processed the assignment's end or is still full (design D3).
- The worker does not end an assignment locally on `assignment-not-active`, although section 8 says it does. This is backlog item `end-assignment-on-not-active`, out of scope.
- The 24c B3 todo is not part of this change; it becomes a regular test once this lands.
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
