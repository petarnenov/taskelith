## 1. Domain and ports

- [x] 1.1 `revokeLaunch` takes the attempt's cancellation reason; item 18 passes `assignment-ended` (D6)
- [x] 1.2 `cancellationPayload` takes an optional `executionId` (D1)
- [x] 1.3 Scheduling: supersede an assignment without a grant outside the supersession bounds (D2, D4)
- [x] 1.4 Execution ports `UnrecordedProcesses` and `ReconciliationQueue` (D5)

## 2. PostgreSQL

- [x] 2.1 Migration `unrecorded_processes` and repositories for both ports, with conformance tests

## 3. Control plane

- [x] 3.1 Consume `execution.started` through `recordStartObservation` and `tx.launches.byLaunchAuthId` (D1)
- [x] 3.2 Consume `execution.launch.rejected` by reason (D2)
- [x] 3.3 Authenticate a revoked worker's observations under the D3 conditions, with its structured log
- [x] 3.4 Revocation supersedes assignments without a runnable execution (D4)
- [x] 3.5 Record unrecorded processes (D5)
- [x] 3.6 `LaunchAuthority` refuses a worker whose enrolled journal is retired (decision 7)
- [x] 3.7 Control-plane tests issue grants through `LaunchAuthority.authorize` (decision 8)

## 4. Verification

- [x] 4.1 Tests for every scenario of the spec deltas, including the D3 tests
- [x] 4.2 `make verify` passes
- [ ] 4.3 Independent review (OpenCode, `opencode-go/kimi-k3.1-pro#high`) and `verification.md`
