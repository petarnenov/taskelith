# Verification

Date: 2026-10-26. Author verification is recorded below; no independent review has run yet.

## Scope and source

Defect D1, found by the crash-window scenarios of G2 item 24b: after a crash past W2 or W3, startup recovery seals execution E1 and continues the launch with E2, but E1's `not-started` has not reached the authority, so E2 is rejected with the final `execution-conflict` and the launch never resumes. The runtime relaunch after a seal has the same race. The owner's delegate decided option (b) in away run `20261026T161148Z-opencode-90873`: an optional `reportsNotStartedFor { executionId, operationId }` that the authority applies first, then the ownership rule, in one transaction. It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `62d324e` on `dev`.
- Scope: the [launch authorization contract](../../../docs/contracts/launch-authorization.md) sections 4, 9, 10, and 11, the [worker journal contract](../../../docs/contracts/worker-journal.md) section 5 recovery row, `execution.openapi.json`, the domain (`authorizeLaunch`, `lastSealedExecution`), the control plane's wire mapping, the worker's `Launch`, their tests, and the `launch-authorization` and `worker-runtime` requirements.
- Out of scope: the G2 24b harness on `run-g2-crash-windows` (head `15467da`), its D1 expected failures, order barrier, and evidence rerun (tasks group 4); the 24c cancellation path of `launch-orchestrator.ts`.

## Evidence

- Revision: `a9d386f` for the author check (code `ef1a0d3`; verification.md updated after the run).
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

## Checks and results

- `npm run openspec -- validate fix-launch-recovery-reauthorization --strict`: `Change 'fix-launch-recovery-reauthorization' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `make contract-compatibility` (in `make verify`): `execution.openapi.json: 0 breaking change(s) against 62d324e2a8fa`, and 0 for the other three documents.
- `make verify` at `a9d386f`: passed (exit 0); 1800 tests, 1798 passed, 0 failed, 2 Linux-only tests skipped on macOS; coverage 99.27% lines, 91.93% branches, 98.89% functions (`launch-authorization.js` 100%, 98.60%, 100%; `journal-recovery.js` 100%; `launch-wire.js` 100%, 95.65%, 100%; `launch-orchestrator.js` 98.74%, 91.54%, 95.19%); OpenSpec `69 passed, 0 failed`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`

## Review

Claude Code claude-opus-5-5 pending.

## Limitations and remaining gates

- The double fault of design "Risks" (a crash after a relaunch's W2 whose request never arrived, while the predecessor's observation is also undelivered) still ends the launch. Follow-up candidate: "reportsNotStartedFor for every unconfirmed sealed execution of the intent". The owner's delegate decided the single-reference shape, and the coordinator keeps the follow-up out of this change.
- The reported `operationId` is not a match condition (design D2, deviation from the brief, accepted by the coordinator).
- The fix is shown with fake supervisions and a fake authority in the worker, and with the real authority on PostgreSQL in the control plane; the end-to-end 24b crash windows wait for tasks group 4.
- Remaining gates: tasks group 4 once G2 24b is in `dev`, the independent review, the coordinator's integration into `dev`, and the archive of this change.
