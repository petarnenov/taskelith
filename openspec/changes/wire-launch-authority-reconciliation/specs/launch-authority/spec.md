## MODIFIED Requirements

### Requirement: Launch authorization operation
The control plane SHALL serve `authorizeLaunch` to an authenticated worker and SHALL decide each operation in one SERIALIZABLE transaction that reads every compared value, including the worker at its current credential generation and the retirement of its enrolled journal. A worker whose enrolled journal is retired SHALL be rejected with `worker-not-authorized`. A grant SHALL be recorded with its task. A transaction that reaches no decision SHALL be answered 503.

#### Scenario: Lost response
- **WHEN** a grant commits and its response is lost, and the worker repeats the operation
- **THEN** it receives the recorded grant with the same issue time

#### Scenario: Retired journal
- **WHEN** a worker whose enrolled journal was retired after a sequence rollback requests a launch
- **THEN** it is rejected with `worker-not-authorized`, and the rejection is recorded

### Requirement: Invalidating writers
An invalidating writer SHALL, in its own transaction, read the live grants of its predicate, revoke them, and write one cancellation request per affected attempt. A worker revocation SHALL do so and SHALL record the worker's executions as uncertain for reconciliation. The attempt's cancellation reason SHALL match its command: `assignment-ended` for the cancellation of an ended assignment, `launch-revoked` for every other writer.

#### Scenario: Worker revocation after a grant
- **WHEN** a worker is revoked after a grant
- **THEN** the grant is revoked, a cancellation command with reason `launch-revoked` is written, and the execution is uncertain

#### Scenario: Ended assignment with a running launch
- **WHEN** a cancellation ends an assignment whose execution is authorized
- **THEN** both the command and the attempt record the reason `assignment-ended`
