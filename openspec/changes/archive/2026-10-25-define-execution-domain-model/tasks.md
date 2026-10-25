## 1. Admission

- [x] 1.1 Add `OwnershipGeneration` to `@taskelith/sdlc` and bind it into a used admission, keeping the G1 API and tests compatible.

## 2. Execution domain

- [x] 2.1 Define tasks, attempts, executions, and their transition tables with ownership and record generations.
- [x] 2.2 Define launch grants, the launch authorization checks and reasons, the ownership rule, transport retries, and revocation.
- [x] 2.3 Define start, exit, not-started, and evidence facts, cancellation, outcomes, task outcome facts, and the producer sequence.

## 3. Scheduling domain

- [x] 3.1 Define assignments, capacity reservations and their justified release, and worker reachability.

## 4. Verification and review

- [ ] 4.1 Run `make verify` and record the results.
- [ ] 4.2 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
