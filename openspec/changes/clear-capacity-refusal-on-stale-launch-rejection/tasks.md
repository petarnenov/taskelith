## 1. Contract

- [x] 1.1 `docs/contracts/capacity-reservation.md` section 8, "Refusal": an observation that frees a slot clears the refusal, at a stale generation too, under its fence

## 2. Control plane

- [x] 2.1 `clearRefusal` and `rejectedEffect` in `observation-effects.ts`; every consumed launch rejection clears the producer's refusal
- [x] 2.2 `ObservationService.apply` records a rejected observation with its evidence effect
- [x] 2.3 Review pass 1: the evidence effect clears only for the producer's own assignment (F1) and rechecks the epoch gate (F2)
- [x] 2.4 Review pass 2: a failed assignment lookup fails the evidence effect instead of counting as not held (F3)

## 3. Tests

- [x] 3.1 Integration tests: a stale launch rejection and a stale `not-started` clear the refusal and change nothing else; an older one keeps it; a stale acceptance keeps it; a current-generation launch rejection clears it
- [x] 3.2 Unit tests of the rejected-observation evidence through `ObservationService`
- [x] 3.3 Show that the key tests fail on the base revision's code
- [x] 3.4 Review pass 1 regression tests: a stale fact about another worker's assignment, and an epoch change or quarantine between the two transactions, keep the refusal; shown to fail on `f3fcc45`
- [x] 3.5 Review pass 2 regression test: a failed lookup in the recording transaction leaves the observation unconfirmed, and its redelivery clears the refusal; shown to fail on `267ff6f`

## 4. Records and checks

- [x] 4.1 proposal.md, design.md, spec deltas, verification.md
- [x] 4.2 `npm run openspec -- validate clear-capacity-refusal-on-stale-launch-rejection --strict`
- [x] 4.3 `make verify`
- [ ] 4.4 Independent review (Codex CLI, gpt-6.1-sol, medium, read-only): pass 1 (2 Medium fixed), pass 2 (1 Medium fixed); pass 3 pending
- [ ] 4.5 Handoff to the coordinator
