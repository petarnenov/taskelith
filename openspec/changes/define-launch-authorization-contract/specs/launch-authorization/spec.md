## Purpose
Defines how a worker obtains online, transactional, single-execution launch authorization, how invalidation is ordered against it, and how expiry stays safe without trusting the worker clock.

## ADDED Requirements

### Requirement: Online launch authorization
A worker SHALL start a new execution only under a launch authorization that the control plane issued in one serializable transaction over HTTPS, after comparing the worker's immutable expected values (recovery epoch, assignment, ownership generation, execution, admission) and the admission's gates, artifact and policy revisions, and capacity reservation with the current state.

#### Scenario: Changed value after queueing
- **WHEN** any compared value changed after the assignment was queued
- **THEN** the launch is rejected with the reason assigned to that check and nothing starts

#### Scenario: Control plane unreachable
- **WHEN** the worker cannot reach the launch authority
- **THEN** it starts no queued work and retries with backoff

### Requirement: Invalidation ordering
Every transaction that changes a compared value SHALL run serializably and SHALL, in the same transaction and even when the result is empty, read the granted authorizations and started executions it affects, revoke those authorizations, and write a cancellation command for each affected attempt. Aborted writers SHALL be retried as a whole.

#### Scenario: Invalidation races authorization
- **WHEN** an invalidation and an authorization run concurrently, including a writer that affects many attempts
- **THEN** the result is either a rejection or a revocation with a cancellation command, never an unrevoked stale authorization

### Requirement: Execution ownership
An attempt SHALL have at most one owning execution. Expiry SHALL end the permission to spawn but not ownership; another execution identity SHALL be authorized only after the owning execution has a recorded exit or a reconciled `not-started` fact.

#### Scenario: Expired grant without a recorded start
- **WHEN** an authorization expired and no start or terminal fact is recorded
- **THEN** an authorization for another execution identity is rejected with `execution-conflict`

### Requirement: Idempotent replay without reuse of stale grants
A repeated request with the same operation ID SHALL return the recorded grant only while it is still granted and the quarantine state, recovery epoch, and worker credential are current; a reused operation ID with different values SHALL be rejected.

#### Scenario: Lost first response
- **WHEN** the first response is lost and the worker retries with the same operation ID
- **THEN** it receives the same grant, no second one is recorded, and its deadline is not extended

#### Scenario: Retry after revocation
- **WHEN** the worker retries after the grant was revoked, the worker credential revoked, or quarantine entered
- **THEN** no grant is returned

### Requirement: Expiry independent of the worker wall clock
The worker SHALL hand an authorization to the supervisor only before its monotonic reading taken before the first request of that operation ID plus the TTL minus the skew, and SHALL never spawn under a journaled authorization after a restart.

#### Scenario: Wrong wall clock
- **WHEN** the worker's wall clock is wrong by more than the skew
- **THEN** the monotonic deadline still ends the authorization in time

#### Scenario: Restart after authorization
- **WHEN** the worker restarts after authorization and before a recorded start
- **THEN** it reconciles by execution identity and re-authorizes with a new operation ID before any spawn

### Requirement: Start observations
A start observation SHALL be accepted once per execution, independently of its arrival time, for an authorization of that execution; a start for an unknown authorization or a non-owning execution SHALL be recorded as an unauthorized start, cancelled, and reconciled.

#### Scenario: Timely start reported late
- **WHEN** a start under a granted authorization is reported after an outage longer than the TTL
- **THEN** it is recorded as a start, and a duplicate report returns the recorded fact

#### Scenario: Unknown authorization
- **WHEN** a start is reported for an unknown authorization
- **THEN** it is recorded as an unauthorized start and a cancellation command is written

### Requirement: Quarantine fails closed
In restore quarantine the launch authority SHALL grant nothing and return no recorded grant, and requests from an older recovery epoch SHALL fail closed.

#### Scenario: Old epoch
- **WHEN** a worker requests authorization with an older recovery epoch
- **THEN** the request is rejected with `stale-recovery-epoch`
