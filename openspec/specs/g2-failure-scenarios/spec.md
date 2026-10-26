# g2-failure-scenarios Specification

## Purpose
Define the G2 failure scenarios of work item 24, the targets they run against, and the recorded results that serve as G2 exit evidence for R05 to R08 and R27.

## Requirements

### Requirement: Recorded scenario results
Every G2 failure scenario SHALL record its result through the harness's scenario result records, with target `compose-installation` when it runs against the item 23 Docker Compose installation and `harness-composition` when it runs on a test-side composition of the real modules against the `make` services, and the change that runs it SHALL carry its recorded results.

#### Scenario: Evidence run
- **WHEN** a scenario runs with `TASKELITH_SCENARIO_RESULTS` set to the `results.jsonl` of its change
- **THEN** that file gains the scenario's result with its seed, rerun hint, host, architecture, commit, target, and outcome

### Requirement: Fresh-composition happy path
`make scenario-fresh-composition` SHALL run the installation smoke on a fresh throwaway Compose project: an admitted task is submitted, assigned to the enrolled Linux worker, and executed, and the control plane persists its result, which SHALL be `ended` and exited with code 0 and a proven start. The scenario SHALL be run on an arm64 host.

#### Scenario: Happy path on Apple Silicon
- **WHEN** the scenario runs on an arm64 macOS host against a freshly built and started installation
- **THEN** the stored result of the task is `ended`, exited with code 0 and a proven start, and the result is recorded with architecture `arm64` and target `compose-installation`

#### Scenario: Smoke fails
- **WHEN** the installation smoke fails
- **THEN** the scenario records the outcome `failed` and fails

### Requirement: Missing journal in Compose
`make scenario-worker-disk-loss` SHALL first kill the worker container of a fresh Compose project while an execution of a task is `started`, delete the journal and keep the identity, deleting only files inside that project's worker volume, and start the worker again. With its restart policy off for that start, the worker SHALL log the `journal-loss` refusal since that start, SHALL exit with a failure without being stopped, and SHALL create no journal.

#### Scenario: Journal missing with an identity
- **WHEN** the killed worker's journal is deleted, its identity is kept, and the worker is started
- **THEN** it logs `journal-loss` and exits with a non-zero code, and its data root still holds the identity and no journal

#### Scenario: Refusal logged and still running
- **WHEN** the worker logs the refusal but keeps running, or exits without the refusal
- **THEN** the scenario records the outcome `failed` and fails

### Requirement: Worker disk loss
The same scenario SHALL then delete the whole data root, revoke the lost worker, and enroll a new worker. The new worker SHALL have a new identity; the old execution SHALL stay `started` with `uncertain` evidence, its assignment `accepted` with its reservation held, and its task's result `pending`; and a new task SHALL exit with code 0 on the new worker, whose assignment ends and releases its reservation.

#### Scenario: Data root lost and a new worker enrolled
- **WHEN** the worker's whole data root is deleted, the lost worker is revoked, and a new worker is enrolled
- **THEN** the old execution is `started` with `uncertain` evidence, its assignment keeps its reservation, its task stays pending, a new task exits with code 0 on the new worker, and the result is recorded with target `compose-installation`

### Requirement: Untimed worker kill
`make scenario-worker-kill` SHALL send `SIGKILL` to the worker container of a fresh Compose project after a pause derived from the seed, from 0 to 25 seconds after a task's submission was answered, with no blocking step between the pause and the kill, and SHALL restart it. Within two minutes of the restart, on the monotonic clock, at least one execution of the task SHALL exist, and each SHALL be `exited` or `not-started` or carry `uncertain` evidence.

#### Scenario: Kill and reconcile
- **WHEN** the worker container receives `SIGKILL` during or before an attempt and is restarted
- **THEN** a new worker process reconciles and keeps running, and each execution of the task ended or is uncertain

#### Scenario: No consistent state
- **WHEN** no new worker process reaches its reconciliation, it stops running, or an execution of the task stays neither terminal nor uncertain, even when the execution had ended before the kill
- **THEN** the scenario records the outcome `failed` with the step it failed in, and fails

### Requirement: Restarted worker proven
Before it waits for the executions of the untimed kill, the scenario SHALL wait for a new worker process at most one minute, and never past the two minutes from the restart: the container runs with a start time other than the killed one's, and that process logged `worker.reconciliation.planned` and `worker.contact.online`. Before the journal comparison, the same process SHALL still run.

#### Scenario: Phases within bounds, total over two minutes
- **WHEN** the new worker process appears within one minute and the executions reconcile within two minutes of that, but more than two minutes after the restart
- **THEN** the scenario records the outcome `failed` and fails

#### Scenario: Restart failed after the execution ended
- **WHEN** the execution had ended before the kill and the restarted worker exits, or never logs its reconciliation
- **THEN** the scenario records the outcome `failed` and fails, although the executions look reconciled

### Requirement: Kill reconciliation agrees with the journal
After the reconciliation of the untimed kill, the state and certainty of each execution in the control plane SHALL equal those in a copy of the stopped worker's journal, and the record's `detail` SHALL name the planned pause and the measured interval from the submission's answer to the kill, the executions just after the kill and after the reconciliation, the task result, and the worker's `worker.execution` log events.

#### Scenario: Agreement recorded
- **WHEN** the control plane and the journal agree after the kill
- **THEN** the result is recorded with target `compose-installation`, the outcome `passed`, and the observed state in `detail`

#### Scenario: Disagreement
- **WHEN** the control plane and the journal disagree on an execution
- **THEN** the scenario records the outcome `failed` and fails
