# launch-authorization Specification

## Purpose
Defines how a worker obtains online, transactional, single-execution launch authorization, how invalidation is ordered against it, and how expiry stays safe without trusting the worker clock.

## Requirements

### Requirement: Online launch authorization
A worker SHALL start a new execution only under a launch authorization that the control plane issued in one serializable transaction over HTTPS, after comparing the worker's immutable expected values (recovery epoch, assignment, ownership generation, execution, admission) and the admission's gates, artifact and policy revisions, and capacity reservation with the current state.

#### Scenario: Changed value after queueing
- **WHEN** any compared value changed after the assignment was queued
- **THEN** the launch is rejected with the reason assigned to that check and nothing starts

#### Scenario: Prerequisite stage without gates
- **WHEN** the last gate of an implementation admission's prerequisite stage is removed before authorization
- **THEN** the launch is rejected with `gate-not-passed`

#### Scenario: Control plane unreachable
- **WHEN** the worker cannot reach the launch authority
- **THEN** it starts no queued work and retries with backoff

### Requirement: Invalidation ordering
Every transaction that changes a compared value SHALL run serializably and SHALL, in the same transaction and even when the result is empty, read the non-terminal owning executions it affects and their grants, whatever the grants' expiry, revoke those grants, and write a cancellation command for each affected attempt. Aborted writers SHALL be retried as a whole.

#### Scenario: Gate added to a prerequisite stage
- **WHEN** a pending gate is added to a prerequisite stage after a grant
- **THEN** the grant is revoked and a cancellation command is written

#### Scenario: Invalidation races authorization
- **WHEN** an invalidation and an authorization run concurrently, including a writer that affects many attempts
- **THEN** the result is either a rejection or a revocation with a cancellation command, never an unrevoked stale authorization

### Requirement: Execution ownership
An attempt SHALL have at most one owning execution, spawned at most once across all its grants. Expiry SHALL end the permission to spawn but not ownership; another execution identity SHALL be authorized only after the owning execution has a recorded exit or a `not-started` fact recorded after its launch record was irreversibly sealed.

#### Scenario: Expired grant without a recorded start
- **WHEN** an authorization expired and no start or terminal fact is recorded
- **THEN** an authorization for another execution identity is rejected with `execution-conflict`

#### Scenario: Two grants for one execution
- **WHEN** an execution is authorized again after its first grant expired unused
- **THEN** the supervisor spawns it at most once across both grants

#### Scenario: Sealed execution
- **WHEN** `not-started` is recorded after the worker sealed the launch record
- **THEN** a supervisor resumed later does not spawn under any grant of that execution

### Requirement: Idempotent replay without reuse of stale grants
A repeated request with the same operation ID from the same worker SHALL return the recorded grant only while it is granted, unexpired, its execution not terminal, and the quarantine state, epoch, and worker credential are current; a reused operation ID with different values SHALL be rejected.

#### Scenario: Lost first response
- **WHEN** the first response is lost and the worker retries with the same operation ID
- **THEN** it receives the same grant, no second one is recorded, and its deadline is not extended

#### Scenario: Retry after expiry
- **WHEN** the worker retries after the grant expired or its execution became terminal
- **THEN** no grant is returned

#### Scenario: Retry after revocation
- **WHEN** the worker retries after the grant was revoked, the worker credential revoked, or quarantine entered
- **THEN** no grant is returned

### Requirement: Expiry independent of the worker wall clock
The worker SHALL hand an authorization to the supervisor, and the supervisor SHALL begin the spawn, only before the suspend-inclusive monotonic reading taken before the first request of that operation ID plus the TTL minus the skew; no spawn SHALL use a journaled authorization after a restart.

#### Scenario: Wrong wall clock
- **WHEN** the worker's wall clock is wrong by more than the skew
- **THEN** the monotonic deadline still ends the authorization in time

#### Scenario: Suspend and resume
- **WHEN** the machine is suspended longer than the TTL after a grant and resumes without a restart
- **THEN** the supervisor does not spawn under that grant

#### Scenario: Supervisor delayed after handoff
- **WHEN** the supervisor receives the authorization but reaches the spawn after the deadline
- **THEN** it does not spawn

#### Scenario: Restart after authorization
- **WHEN** the worker restarts after authorization and before a recorded start
- **THEN** it reconciles by execution identity and re-authorizes with a new operation ID before any spawn

### Requirement: Start observations
A start for a grant bound to its execution SHALL be recorded once, independently of arrival time; a duplicate SHALL return the recorded fact. One from another worker SHALL change nothing; one at another epoch or received in quarantine SHALL only be kept as evidence; one of an `exited` execution SHALL be history without a transition; any other failing start SHALL be an unauthorized start, cancelled for that execution only.

#### Scenario: Timely start reported late
- **WHEN** a start under a granted authorization is reported after an outage longer than the TTL
- **THEN** it is recorded as a start, and a duplicate report returns the recorded fact

#### Scenario: First start after exit
- **WHEN** the first start observation of an execution arrives after its exit was recorded
- **THEN** the start is recorded as history and the execution stays `exited`

#### Scenario: Start in quarantine
- **WHEN** a current-epoch start observation arrives during restore quarantine
- **THEN** it is kept as evidence, no state changes, and no cancellation is written

#### Scenario: Duplicate after a later execution
- **WHEN** a recorded start of execution A is reported again after A exited and execution B was authorized
- **THEN** the recorded fact is returned and nothing is cancelled

#### Scenario: Start after seal
- **WHEN** a start is reported for an execution recorded `not-started`
- **THEN** it is recorded as an unauthorized start of that execution

#### Scenario: Unknown or mismatched authorization
- **WHEN** a start at the current epoch outside quarantine is reported for an unknown grant or for a grant bound to another execution
- **THEN** it is recorded as an unauthorized start and a cancellation command is written for that execution only

#### Scenario: Another worker's grant
- **WHEN** worker B replays worker A's operation ID or reports a start of A's execution
- **THEN** B receives no grant and nothing of A's changes

#### Scenario: Epoch mismatch
- **WHEN** a start observation carries an epoch other than the current one
- **THEN** it is kept as evidence and no state changes

### Requirement: Quarantine fails closed
In restore quarantine the launch authority SHALL grant nothing and return no recorded grant, and requests from an older recovery epoch SHALL fail closed.

#### Scenario: Old epoch
- **WHEN** a worker requests authorization with an older recovery epoch
- **THEN** the request is rejected with `stale-recovery-epoch`
