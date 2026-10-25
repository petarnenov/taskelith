## 1. Modules and persistence

- [ ] 1.1 Add `placementNeed` to the execution domain.
- [ ] 1.2 Add `PlacementWorkers.candidates`, `PlacementQueue`, `AssignmentRepository.listByAttempt`, `DelegationRequests`, and the default attempt request to Scheduling, with in-memory adapters and conformance tests.
- [ ] 1.3 Add the migration and the PostgreSQL adapters.

## 2. Control plane

- [ ] 2.1 Add `PlacementService` and run it in the composition root.
- [ ] 2.2 Add `DelegationService` and the `requestDelegation` route, sharing task creation with `TaskService`.
- [ ] 2.3 Record the provisional placement interval.

## 3. Verification and review

- [ ] 3.1 Add unit, conformance, and PostgreSQL integration tests.
- [ ] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
