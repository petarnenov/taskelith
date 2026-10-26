## Purpose
Define the G2 failure scenarios of work item 24, the targets they run against, and the recorded results that serve as G2 exit evidence for R05 to R08 and R27.

## ADDED Requirements

### Requirement: Recorded scenario results
Every G2 failure scenario SHALL record its result through the harness's scenario result records, with target `compose-installation` when it runs against the item 23 Docker Compose installation and `harness-composition` when it runs on a test-side composition of the real modules against the `make` services, and the change that runs it SHALL carry its recorded results.

#### Scenario: Evidence run
- **WHEN** a scenario runs with `TASKELITH_SCENARIO_RESULTS` set to the `results.jsonl` of its change
- **THEN** that file gains the scenario's result with its seed, rerun hint, host, architecture, commit, target, and outcome

### Requirement: Fresh-composition happy path
From a fresh Compose installation, an admitted task SHALL be submitted, assigned to the enrolled worker, and executed, and the control plane SHALL persist its ended result; the scenario SHALL run on an arm64 host.

#### Scenario: Happy path on Apple Silicon
- **WHEN** the scenario runs on an arm64 macOS host against a freshly built and started installation
- **THEN** the stored result of the task is `ended` with an exited outcome, and the result is recorded with architecture `arm64` and target `compose-installation`

### Requirement: Worker disk loss
When the worker of the Compose installation loses its persistent volume during an attempt, a new worker SHALL be enrolled, and the old attempt SHALL be reported `uncertain`, never retried blindly.

#### Scenario: Disk loss and re-enrolment
- **WHEN** the worker's volume is removed during an attempt and a new worker is enrolled
- **THEN** the old attempt is `uncertain`, the new worker is enrolled under a new identity, and the result is recorded with target `compose-installation`

### Requirement: Untimed worker kill
When the worker container of the Compose installation is killed by `SIGKILL` at an untimed moment of an attempt and restarted, reconciliation SHALL end the attempt consistently, with no attempt left running without an owner.

#### Scenario: Kill and reconcile
- **WHEN** the worker container receives `SIGKILL` during an attempt and is restarted
- **THEN** the attempt's state after reconciliation is consistent with the worker's journal, and the result is recorded with target `compose-installation`
