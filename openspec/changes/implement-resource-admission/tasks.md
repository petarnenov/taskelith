## 1. Scheduling

- [x] 1.1 Add the placement and delegation decisions, the fair order, the backoff, and the named limits.
- [x] 1.2 Add the capacity ports with in-memory adapters and conformance suites.
- [x] 1.3 Add `ResourceAdmissionService` and `admitDelegation`.

## 2. PostgreSQL

- [x] 2.1 Add the resource admission migration and the repositories for the capacity ports.
- [x] 2.2 Add integration tests: conformance, replica races, quota exhaustion, release, supersession, crash, and delegation.

## 3. Records and verification

- [x] 3.1 Record the provisional values in the operational targets and the capacity contract.
- [x] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Claude Code, `claude-fable-5-1`, medium) and record results.
