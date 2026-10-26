## 1. Contract

- [x] 1.1 Write `docs/contracts/account-pool.md`
- [x] 1.2 Add the `account-pool-port` spec delta

## 2. Port types

- [x] 2.1 Add `AccountSlot`, `SlotRequest`, `SlotSelection`, `SlotSecret`, and their constants to Scheduling, and export them
- [x] 2.2 Add the `AccountSlots` and `SlotCredentials` ports and their conformance suites
- [x] 2.3 Add tests that pin the contract values and run the suites against an in-memory test double

## 3. Verification and review

- [x] 3.1 Run `make verify`
- [x] 3.2 Independent review by the assigned reviewer (Claude Code, `claude-fable-5-1`, medium effort)
- [x] 3.3 Record the evidence in `verification.md`
