## 1. Contract and domain

- [x] 1.1 Launch authorization contract sections 4, 9, 10, and 11; worker journal contract section 5 recovery row
- [x] 1.2 `execution.openapi.json`: optional `reportsNotStartedFor` (`SealedExecution`), additive
- [x] 1.3 `authorizeLaunch`: `recordReportedSeal` before the ownership rule, with the rules of design D2
- [x] 1.4 `lastSealedExecution` for the worker

## 2. Control plane and worker

- [x] 2.1 `launch-wire.ts` maps the optional field; one task write in the deciding transaction
- [x] 2.2 `Launch` reports the last sealed execution for every new execution (continue-launch and relaunch)

## 3. Tests and records

- [x] 3.1 Domain tests (`launch-authorization.test.ts`, `journal-recovery.test.ts`)
- [x] 3.2 Worker tests (`start-reconciliation.test.ts`, `launch-orchestrator.test.ts`)
- [x] 3.3 Control-plane tests (`api-server.test.ts`; PostgreSQL integration in `launch-authority.integration.test.ts`)
- [x] 3.4 Show that the new tests fail on the base revision's code
- [x] 3.5 proposal.md, design.md, spec deltas, `validate --strict`
- [ ] 3.6 `make verify`
- [ ] 3.7 Independent review
- [ ] 3.8 Handoff to the coordinator

## 4. After G2 24b is in dev (branch `run-g2-crash-windows`)

- [ ] 4.1 Merge `origin/dev`
- [ ] 4.2 Flip the 11 D1 expected-failure windows of `apps/control-plane/test/crash-windows.integration.test.ts` back to passing
- [ ] 4.3 Remove the D1 order barrier if it is no longer needed
- [ ] 4.4 Rerun the evidence with seed `2776760789` into this change's own `results.jsonl`, and record it in verification.md
