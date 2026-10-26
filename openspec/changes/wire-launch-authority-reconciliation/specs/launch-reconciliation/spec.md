## Purpose

The control plane's consumption of start and launch-rejected observations, the observations and attempts of a revoked worker, and the reconciliation queue of unknown executions and unrecorded processes.

## ADDED Requirements

### Requirement: Start observations
The control plane SHALL decide each `execution.started` as launch authorization contract section 7 requires, with the grant found by its `launchAuthId`. It SHALL record a current or historical start on the execution and SHALL change nothing for a duplicate. It SHALL keep a foreign start or a quarantine start as evidence without a state change.

#### Scenario: Authorized start
- **WHEN** a worker reports the start of its owning `authorized` execution under a grant the launch authority issued
- **THEN** the execution is `started`, and the observation is confirmed

### Requirement: Unauthorized start
For an unauthorized start, the control plane SHALL write one `execution.cancellation.request` with reason `launch-revoked` and that `executionId`, and never a cancellation of another execution of the attempt.

#### Scenario: Start under an unknown grant
- **WHEN** a worker reports a start at the current epoch under a `launchAuthId` the authority never issued
- **THEN** a cancellation for that execution only is written, and no other execution changes

#### Scenario: Start of another worker's execution
- **WHEN** a worker reports a start under a grant issued to another worker
- **THEN** nothing is written to that execution, and the observation is logged as evidence

### Requirement: Launch rejections
The control plane SHALL apply each `execution.launch.rejected` by its reason and SHALL log it with that reason. `worker-not-authorized`, `stale-recovery-epoch`, `capacity-not-reserved`, `admission-not-current`, `gate-not-passed`, `artifact-revision-changed`, and `policy-revision-changed` SHALL supersede the assignment, so placement can reassign the attempt.

#### Scenario: Reservation lost
- **WHEN** a worker reports a launch rejected with `capacity-not-reserved` for its current assignment
- **THEN** the assignment ends as `superseded`, and its attempt can be placed again

### Requirement: Launch rejections that reconcile or only record
A launch rejected with `stale-recovery-epoch` or `execution-conflict` SHALL request the worker's inventory. A launch rejected with `assignment-not-active`, `stale-ownership-generation`, `attempt-not-launchable`, or `operation-mismatch` SHALL only be recorded.

#### Scenario: Execution conflict
- **WHEN** a worker reports a launch rejected with `execution-conflict`
- **THEN** an inventory request is sent to that worker

#### Scenario: Stale generation
- **WHEN** a worker reports a launch rejected with `stale-ownership-generation`
- **THEN** the assignment is unchanged, and the rejection is logged

### Requirement: Observations of a revoked worker
The control plane SHALL apply an observation of a revoked worker only when it names the worker's enrolled journal and that journal is not retired. Such an observation SHALL record no contact and SHALL be logged as a structured event. An acceptance, a capacity declaration, or an admission-pressure report from a revoked worker SHALL be rejected. A journal never seen from a revoked worker, its heartbeats, and its inventory reports SHALL be refused.

#### Scenario: In-flight exit
- **WHEN** a revoked worker's exit of an uncertain `started` execution, published before its revocation, is delivered
- **THEN** the execution is `exited`, the attempt ends with its outcome, and the worker stays unreachable

#### Scenario: New journal after revocation
- **WHEN** a revoked worker's observation names a journal never seen from it
- **THEN** it is not applied, and the enrolled journal stays current

#### Scenario: Heartbeat and inventory after revocation
- **WHEN** a revoked worker sends a heartbeat or an inventory report
- **THEN** each is refused, and no contact is recorded

### Requirement: Attempts of a revoked worker
A worker revocation SHALL, in its transaction, supersede every active assignment of the worker that never held a grant. An attempt with an `authorized` or `started` execution SHALL keep its ownership and reservation, with the execution uncertain.

#### Scenario: Accepted assignment without a grant
- **WHEN** a worker holding an accepted assignment with no grant is revoked
- **THEN** the assignment ends as `superseded`, and its attempt can be placed on another worker

#### Scenario: Started execution
- **WHEN** a worker with a `started` execution is revoked
- **THEN** the assignment keeps its reservation, and the execution is uncertain

### Requirement: Reconciliation queue
The control plane SHALL offer a read of the unknown executions, for a worker or a task, and of the unrecorded processes recorded for a worker. Each consumed `execution.unrecorded-process` SHALL be recorded with its worker, journal, containment, process count, observation identity, and time; a duplicate SHALL record nothing.

#### Scenario: Revoked worker's execution in the queue
- **WHEN** a worker with a `started` execution is revoked
- **THEN** the queue lists that execution for the worker and for its task

#### Scenario: Unrecorded process
- **WHEN** a worker reports an unrecorded process
- **THEN** the queue lists it for that worker with its containment and process count
