## 1. Contract

- [x] 1.1 `docs/contracts/capacity-reservation.md` section 8, "Refusal": an observation that frees a slot clears the refusal, at a stale generation too, under its fence

## 2. Control plane

- [x] 2.1 `clearRefusal` and `rejectedEffect` in `observation-effects.ts`; every consumed launch rejection clears the producer's refusal
- [x] 2.2 `ObservationService.apply` records a rejected observation with its evidence effect

## 3. Tests

- [x] 3.1 Integration tests: a stale launch rejection and a stale `not-started` clear the refusal and change nothing else; an older one keeps it; a stale acceptance keeps it; a current-generation launch rejection clears it
- [x] 3.2 Unit tests of the rejected-observation evidence through `ObservationService`
- [x] 3.3 Show that the key tests fail on the base revision's code

## 4. Records and checks

- [x] 4.1 proposal.md, design.md, spec deltas, verification.md
- [x] 4.2 `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict`
- [x] 4.3 `make verify`
- [ ] 4.4 Independent review (Codex CLI, gpt-6.1-sol, medium, read-only)
- [ ] 4.5 Handoff to the coordinator
