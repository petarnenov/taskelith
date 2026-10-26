# Verification

Date: 2026-10-26. Author verification and review pass 1 are recorded below; the fixes of pass 1 (Low only) are UNREVIEWED.

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

## Limitations

- More than 8 unconfirmed sealed executions: the worker reports the oldest 8, and an owner among the newer ones still ends the launch (design D5).
- The rule relies on the journal's `rowid` order of executions, now stated in worker journal section 5.
- The OpenAPI change is breaking against `dev` (declared as 0.4.0); no release contains the earlier object form.

## Remaining gates

- Independent review: done, pass 1 above; its Low fixes are unreviewed.
- Archive on the branch (protocol step 7): see "Archive" below.
- Integration into `dev` by the coordinator.
