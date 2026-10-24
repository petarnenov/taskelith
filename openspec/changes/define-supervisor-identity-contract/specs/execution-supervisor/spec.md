## Purpose
Defines how a worker starts at most one process per execution through a per-execution supervisor, finds it again after a crash by proven process identity, and reports uncertainty instead of respawning blindly.

## ADDED Requirements

### Requirement: Stable execution identity before spawn
A worker SHALL create an execution identity and journal it with the launch intent before it requests a launch authorization, and SHALL write the execution record durably before starting the execution's supervisor. An execution identity SHALL name at most one spawn and SHALL never be reused.

#### Scenario: Crash before the record exists
- **WHEN** the worker crashes after journaling the launch intent and before creating the execution record
- **THEN** recovery seals the execution and reports `not-started`, and nothing is spawned

### Requirement: Single irreversible spawn decision
Each execution SHALL have one spawn decision, created exclusively and durably as either a claim by its supervisor before its deadline or a seal, before any spawn. A supervisor SHALL spawn only after its claim succeeded, and `not-started` SHALL be reported only for a sealed execution.

#### Scenario: Delayed supervisor after a seal
- **WHEN** a supervisor resumes after the worker sealed its execution
- **THEN** its claim fails and it exits without spawning

### Requirement: Adoption by proven process identity
After a worker or supervisor restart, the worker SHALL adopt a running supervisor or child only by its proven process identity of boot identity, process ID, and start time, and SHALL never identify a process by its process ID alone. No recovery path SHALL spawn.

#### Scenario: Process ID reused
- **WHEN** the recorded child exited and an unrelated process now has its process ID
- **THEN** the worker reports the execution as exited and does not adopt the unrelated process

#### Scenario: Worker service restart
- **WHEN** the worker service restarts while supervisors run
- **THEN** it adopts each live supervisor by its identity and the children keep running

### Requirement: Uncertainty instead of guessing
When native evidence proves neither that a process of a claimed execution runs nor that none does, the worker SHALL report the execution as uncertain, keep its ownership and capacity, and SHALL not respawn it. A corrupt, unreadable, or newer-format record SHALL also give uncertainty.

#### Scenario: Crash between spawn and handle on macOS
- **WHEN** the supervisor dies after its claim and before writing the child's handle on macOS, in the same boot
- **THEN** the worker reports the execution as uncertain

### Requirement: Exit with an unknown status
When native evidence proves that no process of a claimed execution can run but its exit status is lost, the worker SHALL report the execution as exited with an unknown status and SHALL say whether its start is proven.

#### Scenario: Supervisor died before its child
- **WHEN** an adopted child exits after its supervisor died
- **THEN** the worker reports an exit with an unknown status

### Requirement: Termination evidence for the process tree
The child SHALL lead its own process group, its supervisor SHALL record the descendants it observes, and a cancellation SHALL be reported as complete only when the group is empty and no recorded descendant is alive; otherwise the termination SHALL be reported as unproven.

#### Scenario: Descendant in its own session
- **WHEN** a cancelled child has a recorded descendant in another session that survives
- **THEN** the termination is reported as unproven

### Requirement: Survival and drain per operating system
Supervisors SHALL outlive a worker service restart where the operating system keeps their processes, and every event that ends them, such as a container restart, an image upgrade, or an unqualified service stop, SHALL require drain. A worker SHALL read the record format of the previous supervisor version.

#### Scenario: Linux image upgrade
- **WHEN** a Linux worker is upgraded by replacing its container
- **THEN** its executions are drained first, and any not drained end with an unknown status

### Requirement: Native evidence on each platform
Each supported platform SHALL supply its boot identity, process start time, process group and session, and parent links from the operating system, and behavior proven on one platform SHALL not establish it on another. Discovery without a handle SHALL be used only where every process can be read.

#### Scenario: Unreadable process during a scan
- **WHEN** a Linux marker scan cannot read one process
- **THEN** the scan is incomplete and proves no absence
