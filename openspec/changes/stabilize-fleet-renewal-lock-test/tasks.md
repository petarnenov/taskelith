## 1. Change

- [x] 1.1 Create the change `stabilize-fleet-renewal-lock-test` and save the checklist

## 2. Diagnosis

- [x] 2.1 Test the stale-snapshot hypothesis with two reads in one open transaction
- [x] 2.2 Run an instrumented copy of the whole file under load and time the barrier
- [x] 2.3 Find the old barrier's limit with a delay before the renewal requests the lock

## 3. Implementation

- [x] 3.1 Use the observer barrier `waitForWaitingStatement` in the renewal test, with cleanup
- [x] 3.2 Poll `waitForWaitingLock` from an observer in the publisher test, with cleanup
- [x] 3.3 Add the `deterministic-test-harness` requirement "Lock-wait barriers"

## 4. Verification

- [x] 4.1 Fail-before runs of both barriers and their cleanup
- [x] 4.2 Twenty runs of the whole file, ten under 8 busy-loop processes
- [x] 4.3 `make verify`, `make record`, and `make record-check`

## 5. Review and archive

- [x] 5.1 Independent review pass 1
- [x] 5.2 Pass 1 fix round: the snapshot record, `connectedPair`, early failures in `waitUntilWaiting`, `waitForLockWaiters` by the awaited lock, the full advisory key, and the scoped requirement, each with a fail-before run
- [ ] 5.3 Independent review pass 2, and pass 3 if routed
- [ ] 5.4 Archive the change
