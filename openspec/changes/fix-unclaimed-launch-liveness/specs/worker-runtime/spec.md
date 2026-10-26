## MODIFIED Requirements

### Requirement: Supervisor liveness
While a claimed record has no terminal fact, a worker SHALL check its supervisor's liveness every tenth poll. A record that still has no launch record after thirty polls, which is past the launch deadline, SHALL be checked every tenth poll from then on. The recovery table SHALL decide an execution whose supervisor is gone.

#### Scenario: Supervisor lost
- **WHEN** the liveness check finds no live supervisor and the recovery table answers `uncertain`
- **THEN** the worker reports `execution.uncertain` and logs `worker.supervisor.lost`

#### Scenario: Unclaimed record within the bound
- **WHEN** a record has no launch record for fewer than thirty polls and is then claimed
- **THEN** the worker asks the recovery table nothing

#### Scenario: Supervisor lost before its claim
- **WHEN** the supervisor dies at CP5 and the worker keeps running
- **THEN** on the thirtieth poll the recovery table seals the record, and the worker reports `execution.not-started` without a restart and launches the intent again

#### Scenario: Live supervisor at the unclaimed check
- **WHEN** the recovery table answers `observe` at the check of an unclaimed record
- **THEN** the worker keeps reading the record and reports the start and the exit
