## 1. Change and design

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, and keep the brief's checklist as `checklist.json`
- [x] 1.2 Write `proposal.md`, `design.md` with its decisions, sources, and open questions, and a draft `session-turn-model` spec delta
- [x] 1.3 Record the away delegate's decisions on the open questions (decisions 20 to 25), and align the design, the spec delta, the proposal, and these tasks with them

## 2. Contract

- [ ] 2.1 Write `docs/contracts/session-timeline.md`: one task's sessions and their attempts, generations, queued turns, native requests and responses, reconciliation, the output stream and cursor, the limit handoff, failure codes, required tests, and what is not in it; link it from the operational targets row of the live session stream buffer
- [ ] 2.2 Check the spec delta, the contract, and the design against each other

## 3. Domain module

- [ ] 3.1 Add `SessionId`, `TurnId`, `NativeSessionId`, and `SessionGeneration` to the Execution identifiers, and export stubs of the session timeline functions
- [ ] 3.2 Write the unit tests of every requirement against the stubs and record their failing run in `verification.md`
- [ ] 3.3 Implement the pure domain in `packages/modules/execution/src/domain/`, reusing the harness port's identifiers and types, and export it from `@taskelith/execution`
- [ ] 3.4 Check that no type, value, or test names a harness, vendor, model, or native field
- [ ] 3.5 Measure the coverage of the new files

## 4. Verification and review

- [ ] 4.1 Run `make verify`
- [ ] 4.2 Independent review by the assigned reviewers A and B
- [ ] 4.3 Record the evidence in `verification.md`, `passes.jsonl`, and `findings.jsonl`
- [ ] 4.4 Record in `verification.md` the coordinator's follow-up outside this change: add item 4 to the handoff owners of the [agent harness port contract](/docs/contracts/agent-harness-port.md) section 4.1 ("Selection, cooldown, and handoff are items 5, 12, and 18"), which this change does not edit
