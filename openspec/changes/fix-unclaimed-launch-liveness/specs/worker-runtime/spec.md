## MODIFIED Requirements

### Requirement: Supervisor liveness
While a claimed record has no terminal fact, a worker SHALL check its supervisor's liveness every tenth poll. A launch's record that still has no launch record once the worker cannot prove its spawn deadline ahead SHALL be checked every tenth poll from then on, and never before. The recovery table SHALL decide an execution whose supervisor is gone.

#### Scenario: Supervisor lost
- **WHEN** the liveness check finds no live supervisor and the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` and logs `worker.supervisor.lost`

#### Scenario: Unclaimed record before the deadline
- **WHEN** a launch's record has no launch record and its spawn deadline is still ahead
- **THEN** the worker makes no liveness check of the unclaimed record, however many polls have passed

#### Scenario: Supervisor lost before its claim
- **WHEN** the supervisor dies at CP5 and the worker keeps running
- **THEN** on the first tenth poll past the spawn deadline the recovery table seals the record, and the worker reports `execution.not-started` without a restart and launches the intent again

#### Scenario: Live supervisor at the unclaimed check
- **WHEN** the recovery table answers `observe` at the check of an unclaimed record
- **THEN** the worker keeps reading the record and reports the start and the exit
