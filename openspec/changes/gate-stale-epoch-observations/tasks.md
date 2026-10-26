## 1. Contracts

- [x] 1.1 `docs/contracts/launch-authorization.md` section 7: the evidence-only gate for every execution observation
- [x] 1.2 `docs/contracts/execution-wire-contracts.md`: every execution observation carries `recoveryEpoch`; document version 0.6.0
- [x] 1.3 `execution.asyncapi.json`: required `recoveryEpoch` on the exit, `not-started`, `uncertain`, `termination-unproven`, unrecorded-process, and unapplied-cancellation payloads; `make contract-compatibility` decides 0.6.0
- [x] 1.4 `docs/contracts/worker-journal.md` section 10: format 4

## 2. Worker

- [x] 2.1 `ExecutionSubject.recoveryEpoch` from the launch intent; an unrecorded process with the journal's epoch
- [x] 2.2 Journal format 4 migration of stored facts
- [x] 2.3 `observation-messages.ts` publishes the epoch

## 3. Domain and control plane

- [x] 3.1 `isQuarantineEvidence`, shared by `decideStartObservation`
- [x] 3.2 `atCurrentEpoch` in `observation-effects.ts` for exit, `not-started`, `uncertain`, `termination-unproven`, and `cancellation.not-applied`; the unrecorded-process warning names its epoch

## 4. Tests

- [x] 4.1 Domain unit tests of `isQuarantineEvidence`
- [x] 4.2 Contract tests: every execution observation requires its epoch
- [x] 4.3 Journal tests: facts carry the intent's epoch; format 3 migration
- [x] 4.4 Worker tests: published payloads carry the intent's epoch, not the journal's
- [x] 4.5 Control-plane integration tests: old-epoch, newer-epoch, and quarantine observations change nothing; a current-epoch exit still ends the attempt
- [x] 4.6 Show that the key tests fail on the base revision's code

## 5. Records and checks

- [x] 5.1 proposal.md, design.md, spec deltas, verification.md
- [x] 5.2 `npm run openspec -- validate gate-stale-epoch-observations --strict`
- [x] 5.3 `make verify`
- [x] 5.4 Independent review (Codex CLI, gpt-6-astra): pass 1 (2 High accepted as G2 limitations, 1 Medium and 1 Low fixed), pass 2 clean
- [ ] 5.5 Handoff to the coordinator
