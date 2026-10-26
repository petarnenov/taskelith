## ADDED Requirements

### Requirement: Launch window crash recovery
A crash of the composed worker before or after each journal commit W1 to W6, followed by a restart, SHALL end the attempt with exactly one execution beyond `not-started` in the control plane and the worker journal, with the result the journal contract's recovery table assigns, at most one spawn, and no process of the scenario left.

#### Scenario: Crash before the grant is used
- **WHEN** the worker is killed after it journaled a grant (W3.after) and is started again
- **THEN** the execution is sealed and `not-started`, a new execution exits with code 0, the child spawned once, and no process is left

#### Scenario: Crash after the start is journaled
- **WHEN** the worker is killed after W5s and is started again
- **THEN** it adopts the live supervisor, the execution exits with code 0, and the child spawned once

### Requirement: Supervisor window crash recovery
A crash of the worker or of the launch supervisor at each step CP1 to CP12, followed by a restart of the worker, SHALL end with exactly one execution beyond `not-started` and the result section 6 of the supervisor identity contract assigns for the host, SHALL never spawn a second time, and SHALL leave no process once the child has exited.

#### Scenario: Claim without a spawn on macOS
- **WHEN** the supervisor is killed after it claimed the launch record (CP7) and the worker restarts
- **THEN** the execution is `uncertain` and nothing spawned

#### Scenario: Exit written before the crash
- **WHEN** the supervisor is killed after it wrote `exit` (CP11) and the worker restarts
- **THEN** the recorded exit, code 0, is the execution's outcome

### Requirement: Duplicate offer delivery
A redelivery of an offer the control plane published, while its execution runs and after its result, SHALL be acknowledged and SHALL leave one launch intent, one execution, one spawn, and one result.

#### Scenario: Copies during and after the execution
- **WHEN** the same offer is published again under new broker message identities while the child runs and after the result is stored
- **THEN** every copy is acknowledged, and the control plane and the journal hold one execution that exited with code 0

### Requirement: Crash scenario records
Each crash window and duplicate delivery scenario SHALL record its result as "Recorded scenario results" requires for a run on a test-side composition, with target `harness-composition`, and SHALL be skipped, with its reason, on a host where the composed worker cannot supervise natively.

#### Scenario: Evidence run on macOS
- **WHEN** the scenarios run on macOS with `TASKELITH_SCENARIO_RESULTS` set to this change's `results.jsonl`
- **THEN** the file gains one line per scenario with target `harness-composition`

#### Scenario: Linux host
- **WHEN** the scenarios run on Linux
- **THEN** each is skipped with the reason that item 25 runs it on Linux
