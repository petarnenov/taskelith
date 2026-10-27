## MODIFIED Requirements

### Requirement: Standing approval rules recorded and audited
A standing rule SHALL record its author, scope as a normalized operation, policy revision, and origin; only an active rule at the run's current policy revision SHALL answer a request, a request the harness port cannot classify SHALL match no rule, and recording, revoking, and each use SHALL be audited.

#### Scenario: Unclassified request
- **WHEN** a native permission request cannot be classified into a normalized operation
- **THEN** no standing rule answers it, and it waits in the inbox

#### Scenario: Use after a revocation
- **WHEN** a rule's revocation is serialized before a use of the rule for a request
- **THEN** the use answers nothing and records no use

## ADDED Requirements

### Requirement: Product writers invalidate launches
Every transaction that changes a spec gate's state (a decision, making a passed gate stale, reopening), a new artifact revision, which also updates the run's current revision, and a change of the run's policy revision SHALL each, in its own SERIALIZABLE transaction, read the live grants of its predicate, an empty read included, revoke each grant whose compared value it changes, and write a cancellation command per affected attempt (/docs/contracts/launch-authorization.md section 5).

#### Scenario: Return to Specify during a running attempt
- **WHEN** a return to Specify records a new spec revision that outdates a passed spec gate while an attempt of the task runs under a grant that relies on the gate
- **THEN** the transaction that records the revision makes the gate stale, revokes the grant, and writes the attempt's cancellation command

#### Scenario: Return to Specify without a new revision
- **WHEN** a return to Specify records no new revision while an attempt of the task runs
- **THEN** the task's active attempt is cancelled by assignment and its grants are revoked with `attempt-not-launchable`

#### Scenario: Spec gate made stale concurrently with an authorization
- **WHEN** a passed spec gate is made stale concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or the grant is revoked and its cancellation written, never neither

#### Scenario: Spec gate approved concurrently with an authorization
- **WHEN** a pending spec gate is approved concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or it may be granted and the approval revokes no grant

### Requirement: Revoked attempt ends before re-admission
After a product writer revokes a grant, the task SHALL NOT be dispatched again until the revoked attempt has ended, by exit, not started, or reconciliation, and a writer of admissions has re-admitted the task at the next ownership generation.

#### Scenario: Dispatch while the revoked attempt runs
- **WHEN** a product writer revoked a task's grant and the revoked attempt is still active
- **THEN** the task is not dispatched again and its re-admission is refused

### Requirement: Standing rule use checked in one transaction
A standing rule use SHALL read, in one SERIALIZABLE transaction with the answer and the use record, the rule, the run's current policy revision, and the request's attempt and task, and SHALL answer only if the rule may be used, the attempt is neither cancelled nor terminal, the task's ownership generation equals that of the request's assignment, its admission is the one the assignment names, and the request's attempt generation is current.

#### Scenario: Use for a cancelled attempt
- **WHEN** a launch revocation that cancels the request's attempt is serialized before the use
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after a policy revision change
- **WHEN** a change of the run's policy revision is serialized before a use of a rule of the older revision
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after an ownership change
- **WHEN** an ownership change of the request's task is serialized before the use
- **THEN** the rule answers nothing and no use is recorded
