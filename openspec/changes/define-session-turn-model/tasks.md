## 1. Change and design (phase 1)

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, and keep the brief's checklist as `checklist.json`
- [x] 1.2 Write `proposal.md`, `design.md` with its decisions, sources, and open questions, and a draft `session-turn-model` spec delta
- [ ] 1.3 Record the decisions on the open questions of `design.md`, and update the design and the spec delta to them

## 2. Contract

- [ ] 2.1 Write `docs/contracts/session-timeline.md`: sessions and their attempts, generations, turns, native requests and responses, reconciliation, the output stream and cursor, the limit handoff, failure codes, required tests, and what is not in it
- [ ] 2.2 Check the spec delta, the contract, and the design against each other

## 3. Domain module

- [ ] 3.1 Add `SessionId`, `TurnId`, `NativeSessionId`, and `SessionGeneration` to the Execution identifiers, and export stubs of the session timeline functions
- [ ] 3.2 Write the unit tests of every requirement against the stubs and record their failing run in `verification.md`
- [ ] 3.3 Implement the pure domain in `packages/modules/execution/src/domain/`, reusing the harness port's identifiers and types, and export it from `@taskelith/execution`
- [ ] 3.4 Check that no type, value, or test names a harness, vendor, model, or native field

## 4. Verification and review

- [ ] 4.1 Run `make verify`
- [ ] 4.2 Independent review by the assigned reviewers A and B
- [ ] 4.3 Record the evidence in `verification.md`, `passes.jsonl`, and `findings.jsonl`
