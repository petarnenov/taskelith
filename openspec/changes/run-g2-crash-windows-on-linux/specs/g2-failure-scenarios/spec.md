## MODIFIED Requirements

### Requirement: Supervisor window crash recovery
A crash of the worker or of the launch supervisor at each step CP1 to CP12, followed by a restart of the worker, SHALL end with exactly one execution beyond `not-started` and the result section 6 of the supervisor identity contract assigns for the host, SHALL never spawn a second time, and SHALL leave no process once the child has exited.

#### Scenario: Claim without a spawn on macOS
- **WHEN** the supervisor is killed after it claimed the launch record (CP7) and the worker restarts
- **THEN** the execution is `uncertain` and nothing spawned

#### Scenario: Claim without a spawn on Linux
- **WHEN** the supervisor is killed after it claimed the launch record (CP7) in the Linux test container and the worker restarts
- **THEN** the empty containment ends the execution with an exit of unknown status and an unproven start, and nothing spawned

#### Scenario: Populated containment on Linux
- **WHEN** the supervisor is killed after it wrote `handle` (CP9) in the Linux test container and the worker restarts while the child runs
- **THEN** an adopting supervisor watches the containment, the execution exits with unknown status and a proven start once the child is gone, the child spawned once, and the task opens no automatic retry

#### Scenario: Exit written before the crash
- **WHEN** the supervisor is killed after it wrote `exit` (CP11) and the worker restarts
- **THEN** the recorded exit, code 0, is the execution's outcome

### Requirement: Crash scenario records
Each crash window and duplicate delivery scenario SHALL record its result as "Recorded scenario results" requires for a run on a test-side composition, with target `harness-composition`; on Linux it SHALL run through `make verify-linux-crash-windows`, which gives the composed worker a containment parent and an execution account, and it SHALL be skipped, with its reason, on a host where the composed worker cannot supervise natively.

#### Scenario: Evidence run on macOS
- **WHEN** the scenarios run on macOS with `TASKELITH_SCENARIO_RESULTS` set to this change's `results.jsonl`
- **THEN** the file gains one line per scenario with target `harness-composition`

#### Scenario: Evidence run on Linux
- **WHEN** `make verify-linux-crash-windows` runs with `TASKELITH_SCENARIO_RESULTS` set to a change's `results.jsonl`
- **THEN** the file gains one line per scenario with target `harness-composition` and the commit of the checkout

#### Scenario: Linux host
- **WHEN** the scenarios run on Linux without the containment parent and the execution account, as in `make verify`
- **THEN** each is skipped with the reason that names `make verify-linux-crash-windows`
