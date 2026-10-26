# Verification

Date: 2026-10-26. Author verification is recorded below; no independent review has run yet.

## Scope and source

Defect D1, found by the crash-window scenarios of G2 item 24b: after a crash past W2 or W3, startup recovery seals execution E1 and continues the launch with E2, but E1's `not-started` has not reached the authority, so E2 is rejected with the final `execution-conflict` and the launch never resumes. The runtime relaunch after a seal has the same race. The owner's delegate decided option (b) in away run `20261026T161148Z-opencode-90873`: an optional `reportsNotStartedFor { executionId, operationId }` that the authority applies first, then the ownership rule, in one transaction. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `62d324e` on `dev`.
- Scope: the [launch authorization contract](../../../docs/contracts/launch-authorization.md) sections 4, 9, 10, and 11, the [worker journal contract](../../../docs/contracts/worker-journal.md) section 5 recovery row, `execution.openapi.json`, the domain (`authorizeLaunch`, `lastSealedExecution`), the control plane's wire mapping, the worker's `Launch`, their tests, and the `launch-authorization` and `worker-runtime` requirements.
- Tasks group 4, once G2 24b was in `dev`: the crash-window windows that failed on D1, the D1 order barrier, and the evidence rerun.
- Out of scope: the 24c cancellation path of `launch-orchestrator.ts`.

## Evidence

- Revision: `a9d386f` for the first author check (code `ef1a0d3`); `8e6145e` for the evidence run and the final `make verify` (the final test code, after the merge of `origin/dev`).
- Evidence freshness: `origin/dev` at `4f1d733` (24b merged in #298 and archived in #299, with the 25a seccomp change) was merged as `83a6e94`, a merge commit. It changed no file this change touches outside the 24b harness: it added the 24b test harness (`apps/control-plane/test/crash-windows.integration.test.ts`, `harness-composition.ts`, `fixtures/`), the seccomp profiles and scripts under `infra/installation` and `scripts`, one lockfile entry, and the 24b archive. Because the harness is an evidence input, the checks and `make verify` were repeated after the merge. `npm ci --ignore-scripts` reinstalled; no stale dependency inventory was reported. `npm run openspec -- list` shows only this change; no archived change came back.
- Second merge: `origin/dev` at `9cec6bb` (PR #300, `fix-rejected-launch-slot-release`, not yet archived) was merged as `3a82a27`, a merge commit. It changes `apps/worker/src/assignment-admission.ts` (slot counting of offers, `countedAttempts` and `holdsSlot`) and `apps/worker/test/command-intake.test.ts`, and adds that active change. It does not touch the worker launch path (`launch-orchestrator.ts`, `journal-recovery.ts`), the authority, the contracts, or the 24b harness. Each crash-window scenario has one intent that has not ended, so the changed counting admits its offer as before. The crash-window evidence of `8e6145e` was therefore not rerun; `make verify` was. `npm run openspec -- list` shows this change and `fix-rejected-launch-slot-release`.
- Spec interaction with `fix-rejected-launch-slot-release`: its `worker-runtime` delta modifies "Worker-side admission limits" only, not this change's "Journaled launch authorization" or "Start reconciliation". In two scratch copies of `openspec/`, archiving theirs then ours and ours then theirs both succeeded and left strictly valid specs (`68 passed, 0 failed`). Each order kept both changes' modifications: this change's requirement sentence, the "Relaunch after a seal" and "Pending W2 on start" texts, and the launch-authorization scenarios, and their two new scenarios. The resulting `worker-runtime/spec.md` was identical in both orders. `verify:archive` passes.
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: `execution.openapi.json` adds the optional `reportsNotStartedFor` property and the `SealedExecution` schema; `make contract-compatibility` checks it is not breaking. No AsyncAPI, journal format, or operational-target change.

## Author self-check

- **Domain** (`packages/modules/execution/src/domain/launch-authorization.ts`): `LaunchRequest.reportsNotStartedFor?: SealedExecution` (:44); `authorizeLaunch` calls `recordReportedSeal` (:117) after every section 2 check and before `applyOwnershipRule`. `recordReportedSeal` (:262) and `sealConflict` (:279) apply the rules of design D2 with the existing `execution-conflict`; no new reason.
- **Transaction:** the sealed execution and the new grant are one task value, stored by the single `tx.tasks.replace` of `LaunchAuthority.#decide`; `indexLaunchGrants` updates both executions' `live` flags in that write. Unchanged code in `launch-authority.ts`.
- **Wire** (`apps/control-plane/src/api/launch-wire.ts:26-40`): the optional field is parsed into identifiers; an invalid one is `invalid`. The replay comparison `isSameOperation` does not compare it, like `reportsNotStarted` (design D3).
- **Worker** (`apps/worker/src/launch-orchestrator.ts:373-440`, `:629-632`): `Launch.#newExecution` reads the journal snapshot and reports `lastSealedExecution` (`journal-recovery.ts:32`) for every new execution; a resumed execution reports nothing. The cancellation path (`#forward`, `:299-316` before the change) is untouched.
- **Tests:**
  - Domain: "a new execution reporting the sealed owner ends it not-started and is authorized in one decision"; "a reported seal whose not-started arrived first, or of an execution never granted, is accepted"; "a reported seal of a started execution, of another execution's operation, or of the new one conflicts"; "a reported seal of another worker's execution conflicts and changes nothing"; "a transport retry of a relaunch replays its grant without a second seal"; `journal-recovery.test.ts` "a new execution reports the intent's last sealed one with its last granted, else last, operation".
  - Worker: `start-reconciliation.test.ts` "a pending/granted W2 sealed on start is reported with the new execution, which runs to its exit", against a fake authority that applies the ownership rule (`grantedToOwner`); `launch-orchestrator.test.ts` "a grant that arrives after the deadline is journaled and never used" (the second request reports the first execution and its operation) and "a supervisor that seals reports not-started, and the intent is launched again" (with `grantedToOwner`).
  - Control plane: `api-server.test.ts` "authorizeLaunch passes a reported sealed execution to the authority and refuses an invalid one"; `launch-authority.integration.test.ts` (PostgreSQL) "a new execution that reports the sealed owner is granted, and the owner ends not-started in the same commit", with a crash before the commit that leaves neither change, then the grant, the owner's grant no longer live, and a replay.
- **Fail on the base code:** the source files (`packages/modules/execution/src`, `apps/worker/src`, `apps/control-plane/src`, `packages/contracts/documents`) stashed back to `62d324e`, rebuilt, and the new tests run:
  - `launch-authorization.test.ts`: 22 passed, 3 failed (the seal, accepted-report, and replay tests).
  - `journal-recovery.test.ts`: fails to load (`lastSealedExecution` is not exported).
  - `start-reconciliation.test.ts`: 36 passed, 2 failed (both new tests: E2 `rejected-final`).
  - `launch-orchestrator.test.ts`: 40 passed, 2 failed (the two relaunch tests).
  - `launch-authority.integration.test.ts`: 16 passed, 1 failed (the new test).
  - With the change: all pass.
- **Comment rule:** `npm run verify:comments` passes.
- **Evidence check:** the change adds only repository-relative links to `docs/contracts/launch-authorization.md` and `docs/contracts/worker-journal.md`, and no external link; each resolves.
- **OpenSpec:** `validate --strict` passes; the modified requirement bodies are 362 ("Execution ownership"), 424 ("Journaled launch authorization"), and 472 ("Start reconciliation", text unchanged) characters.

## Crash windows (tasks group 4)

- **Flip:** the 11 windows that failed on D1 (W3.before, W3.after, W4.before, W4.after, W6.before, W6.after, CP1, CP2, CP3, CP5, CP6) are ordinary scenarios again, asserting the normal recovery: exit code 0 with one spawn, the control plane agreeing with the journal. `failsOnD1`, `D1_SIGNATURE`, `settledUnlessD1`, `d1Failure`, and `assertD1Order` are removed (`8e6145e`).
- **Barrier decision:** the hold on the sealed execution's `not-started` (`NotStartedHold` in `fixtures/worker-composition.ts`) is kept for those 11 windows (`holdsNotStarted`). It holds the publication of E1's `not-started` until another execution is answered, which is exactly the race D1 lost. Each of these windows now also asserts, in `assertRelaunchBeforeNotStarted`, that there is no launch rejection, that one execution is sealed, and that `answered <E2> granted` comes before `published not-started <E1>` in the established order. The evidence therefore proves that E2 is granted while E1's `not-started` is still unpublished, so only the report can have ended E1 at the authority. Removing the hold would let the observation usually arrive first, and the windows would pass without exercising the fix.
- **CP5:** passed; its fix of O1 was already in `dev`. No window failed, so nothing was investigated or masked.
- **Evidence run of `8e6145e`:** `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/fix-launch-recovery-reauthorization/results.jsonl node --experimental-strip-types --test apps/control-plane/test/crash-windows.integration.test.ts` through `scripts/services.sh run` (this worktree's own Compose project, stopped after the run): 27 tests passed, 0 failed. `results.jsonl` holds 27 rows, all `passed`, no N/A, 27 distinct scenarios, target `harness-composition`, arch `x64`, commit `8e6145e`, seed `2776760789`. Each of the 11 records names E2's `granted` answer before E1's published `not-started`; the CP4 record names "CP4 after the claim" and the CP9 record the adopter's `supervisor.2`.

## Checks and results

- `npm run openspec -- validate fix-launch-recovery-reauthorization --strict`: `Change 'fix-launch-recovery-reauthorization' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make contract-compatibility` (in `make verify`): `execution.openapi.json: 0 breaking change(s) against 62d324e2a8fa`, and 0 for the other three documents.
- `make verify` at `a9d386f`: passed (exit 0); 1800 tests, 1798 passed, 0 failed, 2 Linux-only tests skipped on macOS; coverage 99.27% lines, 91.93% branches, 98.89% functions (`launch-authorization.js` 100%, 98.60%, 100%; `journal-recovery.js` 100%; `launch-wire.js` 100%, 95.65%, 100%; `launch-orchestrator.js` 98.74%, 91.54%, 95.19%); OpenSpec `69 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

- `make verify` at `8e6145e` (after the merge), first run: failed (exit 2) on one control-plane integration test outside the change, "a worker journals its commands before it acknowledges them and publishes its observations" (`the control plane did not answer`, cause `TypeError`), the same intermittent failure `fix-unclaimed-launch-liveness` recorded; 1860 tests, 1857 passed. Second run: passed (exit 0); 1860 tests, 1858 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.28% lines, 92.08% branches, 99.03% functions; `execution.openapi.json: 0 breaking change(s) against 4f1d733b94a3`; OpenSpec `69 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

- `make verify` at `3a82a27` (after the second merge), first run: failed (exit 2) on the same intermittent test, "a worker journals its commands before it acknowledges them and publishes its observations" (`the control plane did not answer`, cause `TypeError`, `control-plane-api.integration.test.ts:433`); 1870 tests, 1867 passed. Second run: passed (exit 0); 1870 tests, 1868 passed, 0 failed, 2 Linux-only tests skipped; coverage 99.28% lines, 92.08% branches, 99.03% functions; `execution.openapi.json: 0 breaking change(s) against 9cec6bb82c80`; OpenSpec `70 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review

Claude Code claude-opus-5-5 pending.

## Limitations and remaining gates

- The double fault of design "Risks" (a crash after a relaunch's W2 whose request never arrived, while the predecessor's observation is also undelivered) still ends the launch. Follow-up candidate: "reportsNotStartedFor for every unconfirmed sealed execution of the intent". The owner's delegate decided the single-reference shape, and the coordinator keeps the follow-up out of this change.
- The reported `operationId` is not a match condition (design D2, deviation from the brief, accepted by the coordinator).
- The intermittent control-plane integration failure of the first `make verify` run after each merge was not investigated; it passed on each rerun.
- Remaining gates: the independent review, the coordinator's integration into `dev`, and the archive of this change.
