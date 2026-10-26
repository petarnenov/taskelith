## MODIFIED Requirements

### Requirement: Launch rejections that reconcile or only record
A launch rejected with `stale-recovery-epoch` or `execution-conflict` SHALL request the worker's inventory. A launch rejected with `assignment-not-active`, `stale-ownership-generation`, `attempt-not-launchable`, or `operation-mismatch` SHALL change no assignment or task. Every launch rejection of the producer's own assignment, at the current or a stale generation, SHALL clear the producer's capacity refusal.

#### Scenario: Execution conflict
- **WHEN** a worker reports a launch rejected with `execution-conflict`
- **THEN** an inventory request is sent to that worker

#### Scenario: Rejection after an earlier execution did not start
- **WHEN** a second launch of an assignment whose first granted execution is `not-started` is rejected with `capacity-not-reserved`
- **THEN** the attempt ends, the assignment ends as `attempt-ended` with its reservation released, and an automatic retry opens

#### Scenario: Stale generation
- **WHEN** a worker reports a launch rejected with `stale-ownership-generation`
- **THEN** the assignment is unchanged, and the rejection is logged

#### Scenario: Rejection after a refusal for slots
- **WHEN** a worker refuses an offer with `worker-slots-exhausted` and then reports a launch of its current assignment rejected with `assignment-not-active`
- **THEN** the assignment is unchanged, and the worker is eligible for placement again
