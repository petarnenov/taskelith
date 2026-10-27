## MODIFIED Requirements

### Requirement: Automatic retry
An attempt that ended without a cancellation request, with the outcome `not-started` or `exited` with a proven start and a status that is a signal or an exit code other than 0, SHALL be followed in the same transaction by a new attempt that retries it, while the task has fewer than 2 attempts that retry another. An exit with an unknown status SHALL open no retry. Its placement SHALL be an automatic retry of the earlier attempt.

#### Scenario: Failed exit
- **WHEN** an attempt's execution exits with code 1 after a proven start
- **THEN** a retry attempt naming it is opened, and the first pass after its backoff places it charging the retry allowance

#### Scenario: Third failure
- **WHEN** the second retry of a task exits with code 1
- **THEN** no further attempt is opened, and the task's result reports that exit

#### Scenario: Spawn failure
- **WHEN** an attempt's execution exits with a failed spawn and no proven start
- **THEN** no retry is opened

#### Scenario: Unknown exit after a proven start
- **WHEN** an attempt's execution exits with an unknown status after a proven start
- **THEN** no retry is opened
