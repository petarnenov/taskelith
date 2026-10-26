## 1. Evidence first

- [x] 1.1 Crash-window harness: an armed point with an occurrence (`W2.after@2`) and a failed first preparation (`TASKELITH_FAIL_FIRST_PREPARE`); a final launch rejection fails the wait for the outcome at once
- [x] 1.2 Crash windows "W2.after@2 after a runtime seal" and "W3.after then W2.after", with the not-started hold and two sealed executions
- [x] 1.3 Show that both fail on the base code with `execution-conflict`

## 2. Contract

- [x] 2.1 `execution.openapi.json` 0.4.0: `reportsNotStartedFor` is a list of 1 to 8 `SealedExecution` entries
- [x] 2.2 Launch authorization contract sections 4, 10, and 11; execution wire contracts version table
- [x] 2.3 Worker journal contract section 5: unconfirmed sealed executions, reported by the continue-launch and resume rows

## 3. Implementation

- [x] 3.1 `authorizeLaunch` applies every entry in order (`recordReportedSeals`); `REPORTED_SEALS_LIMIT`
- [x] 3.2 `launch-wire.ts` parses the list and refuses an empty or longer one as `invalid`
- [x] 3.3 `unconfirmedSealedExecutions` in journal recovery replaces `lastSealedExecution`; `Launch.#nextExecution` reports it

## 4. Tests and records

- [x] 4.1 Domain tests: order with unknown, already not-started, owner, and a repeated entry; a conflicting entry anywhere; a list without the owner
- [x] 4.2 Journal recovery tests: operation choice, confirmation by a later grant, the cap of 8
- [x] 4.3 Worker tests (`launch-orchestrator.test.ts`, `start-reconciliation.test.ts`) and control-plane tests (`api-server.test.ts` cap 8 and 9, `launch-authority.integration.test.ts`)
- [x] 4.4 All crash windows with seed `2776760789` into this change's `results.jsonl`
- [x] 4.5 proposal.md, design.md, spec deltas, `validate --strict`, and an archive in a scratch copy
- [x] 4.6 `make verify`
- [ ] 4.7 Independent review (OpenCode, `opencode-go/kimi-k2.7-code`)
- [ ] 4.8 Archive on the branch (protocol step 7) and integration into `dev` by the coordinator
