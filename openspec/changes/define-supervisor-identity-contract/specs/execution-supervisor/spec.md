## Purpose
Defines how a worker spawns at most once per execution through a per-execution supervisor, finds the execution's processes again after a crash by proven identity, and reports uncertainty instead of respawning blindly.

## ADDED Requirements

### Requirement: Stable execution identity before spawn
A worker SHALL create an execution identity and journal it with the launch intent before it requests a launch authorization, and SHALL journal that the execution record exists before starting the execution's supervisor. An execution identity SHALL name at most one spawn and SHALL never be reused.

#### Scenario: Crash before the record is journaled
- **WHEN** the worker crashes after journaling the launch intent and before journaling the execution record
- **THEN** recovery seals the launch record and reports `not-started`, and nothing is spawned

#### Scenario: Record lost after it was journaled
- **WHEN** the execution record is missing or damaged after the worker journaled it
- **THEN** the worker reports the execution as uncertain, not as `not-started`

### Requirement: Launch record claimed once or sealed
Each execution SHALL have one launch record, created exclusively and durably as either a claim by its first supervisor before its deadline or a seal. A supervisor SHALL spawn only after its claim succeeded, a party that loses the creation SHALL follow the winning record, and `not-started` SHALL be reported only after a durable seal is read.

#### Scenario: Seal and claim race
- **WHEN** the worker seals while a delayed supervisor claims
- **THEN** exactly one creation succeeds, the other party follows it, and `not-started` is reported only if the seal won

### Requirement: Adoption by proven identity
After a worker or supervisor restart, the worker SHALL adopt a supervisor or process only by its proven process identity of boot identity, process ID, and start time, or on Linux by the execution's containment, and SHALL never identify or signal a process by a process ID it does not hold. No recovery path SHALL spawn.

#### Scenario: Process ID reused
- **WHEN** the recorded child exited and an unrelated process now has its process ID
- **THEN** the unrelated process is neither adopted nor signalled

#### Scenario: Worker service restart
- **WHEN** the worker service restarts while supervisors run
- **THEN** it adopts each live supervisor and the process sets keep running

### Requirement: Uncertainty instead of guessing
When native evidence proves neither that a process of a claimed execution runs nor that none does, the worker SHALL report the execution as uncertain, keep its state, ownership, and capacity, and SHALL not respawn it. A corrupt, unreadable, newer-format, or impossible record SHALL also give uncertainty.

#### Scenario: Crash between spawn and handle on macOS
- **WHEN** the supervisor dies after its claim and before writing the child's handle on macOS, in the same boot
- **THEN** the worker reports the execution as uncertain

### Requirement: Exit only when the process set is empty
A worker SHALL report an execution as exited only when its whole process set is proven empty, with the child's exit status or an unknown status, and SHALL report surviving or unprovable processes as an unproven termination that keeps ownership.

#### Scenario: Descendant outlives the child
- **WHEN** the child exits while a descendant in another session still runs
- **THEN** the execution is not reported as exited

### Requirement: Contained process sets on Linux
On Linux, every execution SHALL run in its own cgroup v2 containment that its descendants cannot leave, emptiness SHALL be read from the containment, cancellation SHALL kill through it, and a worker that cannot create one SHALL fail its self-check.

#### Scenario: Supervisor killed while its child runs
- **WHEN** a Linux supervisor dies and its process set later exits
- **THEN** the worker proves the exit from the unpopulated containment and reports it with an unknown status

### Requirement: Group signals on macOS
On macOS, a supervisor SHALL signal the child's process group only while it holds the child unreaped, SHALL never signal by an identifier it no longer holds, and a harness supported on macOS SHALL keep its processes in its process group.

#### Scenario: Cancellation after the child was reaped
- **WHEN** a cancellation arrives after the supervisor reaped the child
- **THEN** no group signal is sent and surviving processes are reported as an unproven termination

### Requirement: Survival and drain per operating system
Supervisors SHALL outlive a worker service restart where the operating system keeps their processes; every event that ends them, such as a container restart, an image upgrade, or an unqualified service stop, SHALL require drain. A worker SHALL read the record format of the previous supervisor version.

#### Scenario: Linux image upgrade
- **WHEN** a Linux worker is upgraded by replacing its container
- **THEN** its executions are drained first, and any not drained end with an unknown status

### Requirement: Native evidence and a suspend-aware deadline
Each platform SHALL supply its boot identity, process start time, process group, and parent links from the operating system, and the spawn deadline SHALL use a clock that counts system sleep. Behavior proven on one platform SHALL not establish it on another.

#### Scenario: Suspend past the deadline
- **WHEN** the system sleeps past the spawn deadline between hand-off and claim
- **THEN** the supervisor seals instead of spawning
