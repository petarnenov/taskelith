## 1. Home cgroup exclusion

- [x] 1.1 Read the containment, self-check, and fact sections of `docs/contracts/supervisor-identity.md` and the Linux self-check
- [x] 1.2 Stop gate: the contract states no rule; no code, gap and options reported to the owner (design D1)

## 2. Prompt broker stop

- [x] 2.1 Prove that a stop during an idle publication round waits for the pause (test fails before the fix)
- [x] 2.2 `abortableDelay` resolves at once on an already aborted signal
- [x] 2.3 Unit test with mocked timers for `runPublicationLoop`

## 3. Records

- [x] 3.1 Proposal, design, tasks, `verification.md`, `make verify`
