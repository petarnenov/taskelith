## 1. Prompt broker stop

- [x] 1.1 Prove that a stop during an idle publication round waits for the pause (test fails before the fix)
- [x] 1.2 `abortableDelay` resolves at once on an already aborted signal
- [x] 1.3 Unit test with mocked timers for `runPublicationLoop`

## 2. Records

- [x] 2.1 Proposal, design, tasks, `verification.md`, `make verify`
- [x] 2.2 Review pass 1: `nats-transport` delta instead of `skip_specs` (M1), evidence check recorded (L1)
- [x] 2.3 Review pass 2: no findings
