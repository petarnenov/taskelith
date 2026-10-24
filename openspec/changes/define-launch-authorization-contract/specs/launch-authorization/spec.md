## Purpose
Defines how a worker obtains online, transactional, single-execution launch authorization, how invalidation is ordered against it, and how expiry stays safe without trusting the worker clock.

## ADDED Requirements

### Requirement: Online launch authorization
A worker SHALL start a new execution only under a launch authorization that the control plane issued in one transaction over HTTPS after comparing the current recovery epoch, worker principal, assignment, ownership generation, attempt, admission gates, artifact and policy revisions, and capacity reservation with the worker's expected values.

#### Scenario: Changed value after queueing
- **WHEN** any compared value changed after the assignment was queued
- **THEN** the launch is rejected with the matching reason and nothing starts

#### Scenario: Control plane unreachable
- **WHEN** the worker cannot reach the launch authority
- **THEN** it starts no queued work and retries with backoff

### Requirement: Invalidation ordering
Every transaction that changes a compared value SHALL be serialized with the authorization transaction, so that it either precedes it and the launch is rejected, or follows it and, in the same transaction, revokes the affected authorizations and writes a cancellation command.

#### Scenario: Invalidation races authorization
- **WHEN** an invalidation and an authorization run concurrently
- **THEN** the result is either a rejection or a revocation with a cancellation command, never an unrevoked stale authorization

### Requirement: Single-execution idempotent grant
An authorization SHALL cover one execution identity and one start. A repeated request with the same operation ID SHALL return the recorded result until expiry, and a reused operation ID with different values SHALL be rejected.

#### Scenario: Transport retry
- **WHEN** the worker repeats a request with the same operation ID before expiry
- **THEN** it receives the same authorization and no second one is recorded

#### Scenario: Second execution
- **WHEN** an attempt already has an authorized or started execution
- **THEN** an authorization for another execution identity is rejected

### Requirement: Expiry independent of the worker wall clock
The worker SHALL hand an authorization to the supervisor only before its monotonic reading taken before the request plus the TTL minus the skew. A start reported for an expired, revoked, or unknown authorization SHALL be recorded as an unauthorized start, cancelled, and reconciled.

#### Scenario: Wrong wall clock
- **WHEN** the worker's wall clock is wrong by more than the skew
- **THEN** the monotonic deadline still ends the authorization in time

#### Scenario: Late start
- **WHEN** a start is reported after the authorization expired
- **THEN** it is recorded as an unauthorized start and a cancellation command is written

### Requirement: Restart without start proof
A worker or supervisor that restarts with a journaled authorization but without proof of a start SHALL NOT spawn; it SHALL reconcile by execution identity and re-authorize with a new operation ID only when no execution exists.

#### Scenario: Restart after authorization
- **WHEN** the worker restarts after authorization and before a recorded start
- **THEN** it reconciles before any spawn

### Requirement: Quarantine fails closed
In restore quarantine the launch authority SHALL grant nothing, and authorizations or requests from an older recovery epoch SHALL fail closed.

#### Scenario: Old epoch
- **WHEN** a worker requests authorization with an older recovery epoch
- **THEN** the request is rejected with `stale-recovery-epoch`
