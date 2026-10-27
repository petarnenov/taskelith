# Verification

Date: 2026-10-26, updated 2026-10-27. Author verification and review passes 1 and 2 are recorded below, review pass 3 is pending; the fixes of pass 1 (Low only) are UNREVIEWED.

## Scope and source

Follow-up of defect D1 (`fix-launch-recovery-reauthorization`, archived), whose design "Risks" named the gap: the worker reported only the intent's last sealed execution, so one crash after a runtime seal, or a double fault on start, still ended the launch with the final `execution-conflict`. The coordinator's brief: report every unconfirmed sealed execution in a single list field, applied in order in the same transaction with D1's per-item rules, at most 8 entries (9 is `invalid`), the unconfirmed set derived from the journal in journal recovery, contract-first.

- Base revision: `a38aefc` on `dev`; branch `report-all-unconfirmed-sealed-executions`, not pushed.
- Scope: [launch authorization contract](../../../docs/contracts/launch-authorization.md) sections 4, 10, and 11; [worker journal contract](../../../docs/contracts/worker-journal.md) section 5; [execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) version table; `execution.openapi.json` 0.4.0; the domain, the control plane's wire mapping, the worker's `Launch`; tests and the crash-window harness.
- Out of scope: a journal format change (none needed, design D4); the late request of a sealed execution after a later grant (unchanged from D1).

## Evidence

- Revisions: `25080ec` (crash-window tests and harness only, on the base code), `94b2db2` (contracts), `e33a7bb` (implementation and unit tests), `29737c5` (OpenSpec artifacts and `results.jsonl`), `5f809b1` (this record), `421ae58` (merge of `origin/dev` at `843e293`, by the coordinator), `96cdc4a` (review pass 1 fixes).
- Evidence freshness: the merge of `843e293` (`itg-streamline-task-integration`) changed the agent task protocol, governance and release documents, the pre-push hook and its scripts and tests, and the `agent-task-protocol`, `dependency-inventory`, and `integration-flow` specs. It touches no file of this change, no contract, and none of its requirements; the checks were repeated on the merged tree (below).
- Environment: macOS Darwin 25.6.0 x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of `make verify`.
- Dependencies: none added. Journal format: unchanged.
- Contracts: `execution.openapi.json` 0.3.1 to 0.4.0, a declared breaking change (design D1). With the version left at 0.3.1, `scripts/check-contract-compatibility.ts` failed with three undeclared changes: `request-property-type-changed`, `request-property-min-items-set`, and `request-property-max-items-set` (`authorizeLaunch`). With 0.4.0 it reports `3 breaking change(s) against a38aefce00f7` and `Contract documents have no undeclared breaking change.`

## Author self-check

- **Domain** (`packages/modules/execution/src/domain/launch-authorization.ts`): `REPORTED_SEALS_LIMIT` (:55); `authorizeLaunch` calls `recordReportedSeals` (:121), which folds the entries in order (:266) over D1's `recordReportedSeal` (:278); `locateReported` (:291) reads an entry from the attempt as earlier entries left it. The first conflict returns `execution-conflict` and no task, so nothing is recorded.
- **Wire** (`apps/control-plane/src/api/launch-wire.ts:39`): `parseSealedExecutions` refuses an empty list or one over the limit, and any invalid entry, with `invalid`; the schema bounds the list as well.
- **Journal recovery** (`packages/modules/execution/src/domain/journal-recovery.ts:32`): `unconfirmedSealedExecutions` keeps the intent's `not-started` executions from the last one with a journaled grant on, oldest first, at most 8, each with its last granted, else last, operation (design D4, D5). `lastSealedExecution` is removed.
- **Worker** (`apps/worker/src/launch-orchestrator.ts:473`): `Launch.#nextExecution` reports that list for every new or resumed execution, so continue-launch, retry-authorization, and the runtime relaunch share one rule.
- **Definition of "confirmed"** (design D4, worker journal section 5): a sealed execution is confirmed once a later execution of the intent has a journaled grant (W3), because the authority grants only while no other execution owns the attempt. The journal reads executions in `rowid` order, their first W2, and never deletes one.

## Tests

- **Crash windows** (`apps/control-plane/test/crash-windows.integration.test.ts:92-93`): "W2.after@2 after a runtime seal" (the first preparation fails, so E1 is granted and sealed at runtime; the crash follows E2's W2) and "W3.after then W2.after" (the startup double fault). Both hold E1's `not-started` until another execution is answered and assert two sealed executions, E1 granted, then the relaunch granted, then E1's `not-started` published, and the control plane holding E1 `not-started`. Harness additions: an armed occurrence (`W2.after@2`), a failed first preparation, and a wait for the outcome that fails at once on a final launch rejection.
- **Failing before the fix**, at `25080ec` (base code with the new tests): `TASKELITH_TEST_SEED=2776760789 bash scripts/services.sh run taskelith-rause node --experimental-strip-types --test --test-name-pattern='runtime seal|then W2.after' apps/control-plane/test/crash-windows.integration.test.ts`: tests 2, pass 0, fail 2:
  - `✖ a crash at W2.after@2 after a runtime seal ends exited-code-0 with 1 spawn(s), relaunched before the not-started went out`: `Error: a launch was rejected: [{"executionId":"bfed219a-…","assignmentId":"s0349…","reason":"execution-conflict"}]`
  - `✖ a crash at W3.after then W2.after ends exited-code-0 with 1 spawn(s), relaunched before the not-started went out`: `Error: a launch was rejected: [{"executionId":"7d32be37-…","assignmentId":"s0349…","reason":"execution-conflict"}]`
  - An earlier run of the same tests, before the fail-fast wait was added, timed out waiting for the outcome with only E1, `not-started`, at the control plane.
- **After the fix**, the same command: tests 2, pass 2.
- **All crash windows**, at `e33a7bb`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/report-all-unconfirmed-sealed-executions/results.jsonl bash scripts/services.sh run taskelith-rause node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts`: 29 tests, 29 passed. `results.jsonl` holds 29 rows, all `passed`, 29 distinct scenarios, commit `e33a7bb`, seed `2776760789`; the 27 existing windows keep their expectations. The two new records show `answered <E1> granted`, (`prepare failed`,) `answered <E3> granted`, then `published not-started <E1>` and `<E2>`.
- **Domain** (`launch-authorization.test.ts:239`, `:249`, `:261`): an unknown, an already `not-started`, the `authorized` owner, and a repeated owner entry, applied in order, grant E3 with E1 and E2 `not-started`; a conflicting entry first, last, or by another execution's operation rejects the request; a list without the owner conflicts by the ownership rule. D1's tests use one-entry lists.
- **Journal recovery** (`journal-recovery.test.ts:124`, `:136`, `:145`): operation choice and other intents; confirmation by a later grant; the oldest 8 of 10.
- **Cap**: `api-server.test.ts` "authorizeLaunch passes the reported sealed executions to the authority and refuses an invalid list": 8 entries pass the schema and reach the authority; 9 fail the schema; an empty list, 9 entries, and an invalid entry are `invalid` and never reach the authority.
- **Worker**: `launch-orchestrator.test.ts` "a later grant confirms the sealed executions before it, so the next request reports only the newer one"; `start-reconciliation.test.ts` "a granted execution sealed at runtime and a pending W2 after it are both reported with the next one".
- **PostgreSQL**: `launch-authority.integration.test.ts` reports a one-entry list, unchanged otherwise.

## Checks and results

- `npm run openspec -- validate report-all-unconfirmed-sealed-executions --strict`: `Change 'report-all-unconfirmed-sealed-executions' is valid`. Modified requirement bodies: 419 ("Execution ownership"), 490 ("Journaled launch authorization"), and 472 ("Start reconciliation", text unchanged) characters.
- Archive in a scratch copy of `openspec/` (outside the worktree): `openspec archive report-all-unconfirmed-sealed-executions --yes` applied 1 modified requirement to `launch-authorization` and 2 to `worker-runtime`; then `openspec validate --all --strict --no-interactive`: `Totals: 69 passed, 0 failed`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make verify` at `29737c5` (history, before the merge): passed (exit 0) on the first run; 1926 tests, 1924 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.30% lines, 92.13% branches, 99.04% functions (`launch-authorization.js` 100%, 98.71%, 100%; `journal-recovery.js` 100%; `launch-wire.js` 100%, 96.97%, 100%; `launch-orchestrator.js` 98.81%, 91.78%, 95.54%); contract compatibility as under Evidence; OpenSpec `70 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.` The known intermittent test did not fail.

- After review pass 1, on the tree of `96cdc4a` (the merge plus the pass 1 fixes), 2026-10-26 21:53 UTC, before the archive:
  - `npm run openspec -- validate --all --strict --no-interactive`: `Totals: 70 passed, 0 failed (70 items)`.
  - `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` (merge base `843e293`): empty, as expected before the archive.
  - `make verify`: passed (exit 0) on the first run; 1934 tests, 1932 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.28% lines, 92.09% branches, 99.04% functions (`launch-authorization.js` 100%, 98.71%, 100%; `journal-recovery.js` 100%; `launch-wire.js` 100%, 96.97%, 100%; `launch-orchestrator.js` 98.81%, 91.81%, 95.54%); `execution.openapi.json: 3 breaking change(s) against 843e293d72bf`, declared, 0 for the other documents; OpenSpec `70 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.` The known intermittent test did not fail.
  - The crash windows (`results.jsonl`, commit `e33a7bb`) were not rerun separately: the merge and the pass 1 fixes change no input of the harness or the launch path, and `make verify` ran every crash window again on this tree.

## Review

### Review pass 1

OpenCode, model `opencode-go/kimi-k2.7-code`, run by the coordinator under the [review process](../../../docs/governance.md#independent-review-process). Session `ses_e85dbb9d5ffeIdmD4uBDZ38OXW`. Revision reviewed: `421ae58` (the merge of `origin/dev` at `843e293` into the branch). Findings: 0 Critical, 0 High, 0 Medium, 3 Low. The fixes below are **UNREVIEWED** (Low-only pass, governance); no further review follows.

- **L1 (UNREVIEWED fix):** this record named `make verify` at `29737c5` while the head was the merge `421ae58`. Resolution: the checks were rerun on the merged tree with the fixes (`96cdc4a`), recorded under Checks and results with revision and date; the earlier run stays as history.
- **L2 (UNREVIEWED fix, `96cdc4a`):** the PostgreSQL test covered only a one-entry list. Resolution: `apps/control-plane/test/launch-authority.integration.test.ts:215` "a relaunch that reports two sealed executions ends both not-started and is granted in one commit": E3 reports [E1 already `not-started`, E2 the `authorized` owner]; a conflict in the second entry (E3 itself) leaves the grant rows unchanged; a crash before the commit leaves neither change; then E1 and E2 are `not-started` and E3 `authorized` in one task write. The file passes 18 of 18.
- **L3 (UNREVIEWED fix, `96cdc4a`):** no worker test exercised the cap. Resolution: `apps/worker/test/start-reconciliation.test.ts:266` "after recovery, the first request reports exactly the oldest 8 of 10 unconfirmed sealed executions, in order". The file passes 41 of 41.

### Review pass 2

OpenCode, model `opencode-go/kimi-k2.7-code` (default variant, none passed), run by the worker (Pepi) from the worktree as `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json --title report-all-unconfirmed-sealed-executions "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and log outside the worktree. Session `ses_e8458010bffet2OY8uVNIDFp33`. Revision reviewed: `ae13b7a` (the merge of `dev` at `1847570` as `4289b8f` and its record). Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

- Scope: the integration return only (Return 1 below): the restore commit `53a7b4e`, the conflict resolution in the merge `7416c02` (`journal-recovery.test.ts`), the clean merge `4289b8f`, the delta reconciliation against the living `launch-authorization` and `worker-runtime` specs, and the Return 1 record.
- Read-only: `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` before and after the run gave `48f3951f2082434a3f4f292c1f3fd5ce0b125d62ec82be5564a8254ffb77553e` both times.
- The reviewer confirmed (its answer was in Bulgarian; paraphrased here): the restore is an exact revert; the resolution keeps both sides' tests, drops the `lastSealedExecution` test correctly, and merges the imports correctly; #314's `recoverIntent` change does not affect the report of `unconfirmedSealedExecutions` through `Launch.#nextExecution`; `4289b8f` touches no input of this change; the deltas keep every scenario and edit of `dev`'s current text and touch neither "Cancellation forwarding" nor "Assignment ended by a launch rejection"; the record is accurate.
- Limitation: a standalone OpenCode session stores no model field in its JSON events, so the model is confirmed by the `-m` argument only.

## Return 1 (integration conflict)

Reviewed in review pass 2 above.

- **Return:** the coordinator's merge of `origin/dev` at `cc7f998` into the archived head `ceea886` conflicted in `packages/modules/execution/test/journal-recovery.test.ts`, against `scope-execution-cancellation-recovery` (#314). The coordinator aborted the merge; the branch was unchanged.
- **Restore (worker step 10.1):** `git revert --no-commit ceea886`, committed as `53a7b4e` "docs: restore the active unconfirmed sealed executions report change to merge dev"; the change is active again and the living specs are `dev`'s of `843e293`.
- **Merge (step 10.2):** base `843e293` (`git merge-base ceea886 origin/dev`); `git merge origin/dev` as `7416c02`. One conflict, at the end of `journal-recovery.test.ts`: #314 added three tests of execution-targeted cancellations ("a cancellation of a superseded execution leaves the last one to be retried or relaunched", "a cancelled last execution sealed before its start ends the intent", "an attempt cancellation still stops every execution of its intent") beside D1's `lastSealedExecution` test, where this change has its three `unconfirmedSealedExecutions` tests. Resolution: both sides' new tests are kept; D1's `lastSealedExecution` test is dropped, as this change already replaced it together with the function. The import list merged without a conflict (#314's `ExecutionId` beside this change's names).
- **What #314 and the other merged work change for this change:** `recoverIntent` now stops an intent only when its last execution is cancelled, so a superseded execution's cancellation leaves the intent to a retry or relaunch. Such a relaunch goes through `Launch.#nextExecution`, which reports `unconfirmedSealedExecutions` as before; the superseded execution is sealed `not-started`, so reporting it is correct and the authority's per-item rules apply unchanged. `unconfirmedSealedExecutions`, the launch orchestrator, worker journal section 5, the launch authorization contract, and the crash-window harness are not touched by the merge; `journal-records.ts`, `launch-rejection.ts`, and `inventory.ts` changed for the assignment end and capacity work (#315, #316) and do not touch the report. No code change was needed.
- **Delta reconciliation (step 10.3):** `git diff 843e293 origin/dev -- openspec/specs` changes `worker-runtime` ("Cancellation forwarding", with two new scenarios, and the new "Assignment ended by a launch rejection") and other capabilities, but none of the three requirements this change modifies. A script compared each delta requirement with `dev`'s current text: "Execution ownership" (`launch-authorization`), "Journaled launch authorization" and "Start reconciliation" (`worker-runtime`) are unchanged since `843e293`, and every scenario `dev` has is in the delta. The deltas therefore stay as reviewed; neither touches "Cancellation forwarding" or "Assignment ended by a launch rejection", which the archive keeps verbatim. Requirement bodies: 419, 490, and 472 characters.
- **Checks on `7416c02`** (2026-10-26 23:32 UTC):
  - `npm run openspec -- validate report-all-unconfirmed-sealed-executions --strict`: valid.
  - Archive in a scratch copy of `openspec/`: `Totals: + 0, ~ 3, - 0, → 0`; then `validate --all --strict --no-interactive`: `69 passed, 0 failed`; the archived `worker-runtime` spec differs from `dev`'s by the 14 changed lines of this delta only.
  - Crash windows: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/report-all-unconfirmed-sealed-executions/results.jsonl bash scripts/services.sh run taskelith-rause node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts`: 29 tests, 29 passed; `results.jsonl` regenerated: 29 rows, all `passed`, 29 distinct scenarios, commit `7416c02`, seed `2776760789`, arch `x64`.
  - `make verify`: passed (exit 0) on the first run; 1965 tests, 1963 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.29% lines, 92.13% branches, 99.05% functions; `execution.openapi.json: 3 breaking change(s) against cc7f9986d7a5`, declared, 0 for the other documents; OpenSpec `70 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`
- **Second merge:** `dev` moved on to `1847570` (#321, `add-fleet-skills`); `git merge origin/dev` as `4289b8f`, without a conflict. #321 changes only the fleet skills (`.claude/skills/taskelith-*/SKILL.md`), `docs/agent-task-protocol.md`, `docs/fleet.md`, its archived change, and the `agent-task-protocol` spec, where it adds "Named fleet roles". `git diff cc7f998 1847570` touches no code, test, contract, or crash-window harness file of this change, and `-- openspec/specs` none of its three modified requirements, so no evidence above is invalidated and the deltas need no rewrite.
- **Checks on `4289b8f`** (2026-10-27 04:38 UTC):
  - `npm run openspec -- validate report-all-unconfirmed-sealed-executions --strict`: valid.
  - Archive in a scratch copy of `openspec/`: `Totals: + 0, ~ 3, - 0, → 0`; then `validate --all --strict --no-interactive`: `69 passed, 0 failed`.
- **Checks on `ae13b7a`** (the tree of the `4289b8f` merge plus its record commit), 2026-10-27:
  - `make verify`: passed (exit 0); 1965 tests, 1963 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.29% lines, 92.13% branches, 99.05% functions; `execution.openapi.json: 3 breaking change(s) against 1847570fcee3`, declared, 0 for the other three documents; `Contract documents have no undeclared breaking change.`; OpenSpec `Totals: 70 passed, 0 failed (70 items)`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Return 1, second round

Awaiting review pass 3, which reviews this round's merge and reconciliation.

- **Archive undone:** an archive run on the working tree after review pass 2 was never committed; the change was moved back to the active directory and the living specs restored before this round. Its record edits were committed as `9dfed68` without the archive checks.
- **Merge:** `dev` moved on to `656a34d` (#322, `report-control-plane-failure-cause`); `git merge origin/dev` as `eda2e56`. One conflict, in `docs/contracts/launch-authorization.md`, section 11: this change rewrote the "Reported seal" bullet (a list of at most 8), and #322 extended the "Worker client" bullet (the failure `cause` and `causeCode`, and the `worker.launch.authorization-failed` log). Resolution: this change's "Reported seal" bullet and #322's "Worker client" bullet, each verbatim. `package-lock.json` and `docs/dependencies/` equal `dev`'s; the post-merge inventory check reported nothing stale.
- **What #322 changes for this change:** `Launch` logs each failed authorization with `#authorizationFailed` (`apps/worker/src/launch-orchestrator.ts:526`, `:549`), naming the execution, the operation, and the failure's code, message, and details; it reads neither the request nor its `reportsNotStartedFor`, which `#nextExecution` (`:470`) still builds from `unconfirmedSealedExecutions`. #322's test (`apps/worker/test/launch-orchestrator.test.ts:180`) checks only the log record, and none of its test changes reads `reportsNotStartedFor`. No code change was needed.
- **Delta reconciliation (step 10.3, base `1847570`):** `git diff 1847570 origin/dev -- openspec/specs` changes `worker-runtime` only: "Journaled launch authorization" gains the sentence "Each failed request SHALL be logged with its failure." and the scenario "Logged authorization failure", and "Control-plane failure cause" is new. "Execution ownership" and "Start reconciliation" are unchanged. The `worker-runtime` delta (`2297222`) now keeps both sides: the scenario "Logged authorization failure" is copied verbatim after "Relaunch after a seal", and the body, which would have grown to 544 characters, is tightened to 491 (`dev`'s current body has 489) without losing a rule of either side: "A worker SHALL commit W2 before an operation's first request and W3 with each decision, SHALL log each request failure, and SHALL repeat an undecided request under the same `operationId`, after a jittered delay of 5 s doubling to 60 s, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation. A new or resumed execution SHALL report the intent's sealed ones no later grant confirms, oldest first, at most 8." Requirement bodies: 419 ("Execution ownership"), 491 ("Journaled launch authorization"), 472 ("Start reconciliation").
- **Checks on `2297222`** (2026-10-27 04:55 UTC):
  - `npm run openspec -- validate report-all-unconfirmed-sealed-executions --strict`: `Change 'report-all-unconfirmed-sealed-executions' is valid`.
  - Archive in a scratch copy of `openspec/` (outside the worktree): `Totals: + 0, ~ 3, - 0, → 0`; then `validate --all --strict --no-interactive`: `Totals: 69 passed, 0 failed (69 items)`. The archived `worker-runtime` spec differs from `dev`'s only by the "Journaled launch authorization" body and the "Confirmed seal", "Crash after a runtime seal", and "Double fault on start" scenarios; it keeps "Logged authorization failure" and "Control-plane failure cause". The archived `launch-authorization` spec differs only in "Execution ownership".
  - `make setup` and `npm run build`: passed.
  - `node --experimental-strip-types --test` on `packages/modules/execution/test/journal-recovery.test.ts`, `apps/worker/test/launch-orchestrator.test.ts`, and `apps/worker/test/start-reconciliation.test.ts`: 105 tests, 105 passed.
  - `npm run verify:comments`: `Every comment is within the comment length rule.`
  - Crash windows were not rerun: this round changes no code, and `make verify` runs them.
- **Not done yet:** `make verify` on this round's head; review pass 3 of this round; the archive again (step 7) as the last commit.

## Limitations

- More than 8 unconfirmed sealed executions: the worker reports the oldest 8, and an owner among the newer ones still ends the launch (design D5).
- The rule relies on the journal's `rowid` order of executions, now stated in worker journal section 5.
- The OpenAPI change is breaking against `dev` (declared as 0.4.0); no release contains the earlier object form.

## Remaining gates

- `make verify` on the head of Return 1, second round: pending.
- Review pass 3 of Return 1, second round: pending.
- Archive on the branch again (protocol step 7): pending.
- Integration into `dev` by the coordinator (single pull request).
