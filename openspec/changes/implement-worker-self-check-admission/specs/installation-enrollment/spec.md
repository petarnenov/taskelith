## ADDED Requirements

### Requirement: Worker admission on the self-check
A worker SHALL be `awaiting-self-check` from its enrollment and from each new journal incarnation until the control plane consumes a self-check report of it. Each report above the worker's self-check fence SHALL make it `admitted` when no result failed, and `self-check-failed` otherwise, and SHALL replace its stored results. Placement SHALL place only on an `admitted` worker.

#### Scenario: Newly enrolled worker
- **WHEN** a worker is enrolled and no self-check report of it has been consumed
- **THEN** it is `awaiting-self-check` and placement offers it nothing

#### Scenario: Failed check
- **WHEN** a report names the `linux-containment` check as `failed` with its problems
- **THEN** the worker is `self-check-failed`, its stored results hold that check with those problems, and placement offers it nothing

#### Scenario: Passing report after a failure
- **WHEN** a `self-check-failed` worker reports a later self-check with no failed result
- **THEN** it is `admitted`, its stored results are replaced, and placement may offer it work

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command reports `linux-containment` as `not-applicable` with `no-launch-command`
- **THEN** the worker is `admitted`

#### Scenario: macOS worker
- **WHEN** a macOS worker reports `linux-containment` as `not-applicable` with `platform-not-covered`
- **THEN** the worker is `admitted` and its stored result is `not-applicable` with that reason

#### Scenario: Stale report
- **WHEN** a report arrives at or below the worker's self-check fence
- **THEN** the worker admission and the stored results are unchanged

#### Scenario: New journal incarnation
- **WHEN** an `admitted` worker's journal is replaced
- **THEN** it is `awaiting-self-check` and its stored results are cleared

### Requirement: Not-applicable results checked by the control plane
The control plane SHALL count a `not-applicable` result as `failed` unless it holds exactly one recognised reason that agrees with the worker's enrolled platform and the check's scope, and SHALL count a required check missing from a report as `failed`.

#### Scenario: Linux worker claiming another platform
- **WHEN** a Linux worker reports `linux-containment` as `not-applicable` with `platform-not-covered`
- **THEN** the result is stored as `failed` and the worker is `self-check-failed`

#### Scenario: Unrecognised reason
- **WHEN** a report names a check as `not-applicable` with a reason that is not recognised
- **THEN** the result is stored as `failed` and the worker is `self-check-failed`

#### Scenario: Missing required check
- **WHEN** a report omits `linux-containment`
- **THEN** a `failed` result is stored for it and the worker is `self-check-failed`

### Requirement: Running executions survive a failed self-check
When a worker becomes `self-check-failed`, each of its executions already running SHALL keep its assignment, ownership, and reservation until it ends normally; a failed self-check SHALL revoke no grant.

#### Scenario: Execution running during a failed self-check
- **WHEN** a worker with an accepted, running attempt reports a failed self-check
- **THEN** the assignment does not end, and the attempt's later exit ends the task as usual
