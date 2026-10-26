# launch-authority Specification

## Purpose
The launch authority of the control plane: the `authorizeLaunch` operation and its record, the invalidating writers' revocation of grants, and the worker's client.

## Requirements

### Requirement: Launch authorization operation
The control plane SHALL serve `authorizeLaunch` to an authenticated worker and SHALL decide each operation in one SERIALIZABLE transaction that reads every compared value, including the worker at its current credential generation and the retirement of its enrolled journal. A worker whose enrolled journal is retired SHALL be rejected with `worker-not-authorized`. A grant SHALL be recorded with its task. A transaction that reaches no decision SHALL be answered 503.

#### Scenario: Lost response
- **WHEN** a grant commits and its response is lost, and the worker repeats the operation
- **THEN** it receives the recorded grant with the same issue time

#### Scenario: Retired journal
- **WHEN** a worker whose enrolled journal was retired after a sequence rollback requests a launch
- **THEN** it is rejected with `worker-not-authorized`, and the rejection is recorded

### Requirement: Final rejections
A non-retryable rejection SHALL be recorded for its worker and operation and SHALL be answered to every repeat with the same values. A repeat with other values SHALL be rejected with `operation-mismatch`. A retryable rejection SHALL NOT be recorded.

#### Scenario: Rejected operation
- **WHEN** an operation is rejected with `stale-ownership-generation` and repeated with corrected values
- **THEN** the repeat is rejected with `operation-mismatch`, never granted

### Requirement: Invalidating writers
An invalidating writer SHALL, in its own transaction, read the live grants of its predicate, revoke them, and write one cancellation request per affected attempt. A worker revocation SHALL do so and SHALL record the worker's executions as uncertain for reconciliation.

#### Scenario: Worker revocation after a grant
- **WHEN** a worker is revoked after a grant
- **THEN** the grant is revoked, a cancellation command with reason `launch-revoked` is written, and the execution is uncertain

### Requirement: Current revisions
Submitting a task SHALL seed its run's current revision of each bound artifact that has none, and a launch SHALL compare the admission's bound revisions with them.

#### Scenario: Changed revision
- **WHEN** an artifact's current revision differs from the admission's bound one
- **THEN** the launch is rejected with `artifact-revision-changed`

### Requirement: Worker client
The worker's client SHALL send the operation with its bearer and SHALL return the outcome as the domain's. A 503, a timeout, or a lost connection SHALL be `unavailable`, and an answer that breaks its schema or values SHALL NOT become a grant.

#### Scenario: No decision
- **WHEN** the control plane answers 503
- **THEN** the client returns `unavailable`, and the worker may repeat the same operation

### Requirement: Attempt cancellation reason
A writer that records the attempt's cancellation SHALL record the reason of its command: `assignment-ended` for the cancellation of an ended assignment, `launch-revoked` for every other writer. An attempt that already has a cancellation SHALL keep it, because its first request decides the outcome.

#### Scenario: Ended assignment with a running launch
- **WHEN** a cancellation ends an assignment whose execution is authorized
- **THEN** both the command and the attempt record the reason `assignment-ended`

#### Scenario: Earlier cancellation
- **WHEN** a refusal revokes the launch of an attempt whose cancellation was already requested
- **THEN** the command carries `assignment-ended`, and the attempt keeps its earlier `requested` cancellation
