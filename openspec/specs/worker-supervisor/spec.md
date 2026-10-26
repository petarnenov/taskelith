# worker-supervisor Specification

## Purpose
Implement the per-execution supervisor of decision D7 (c) and the worker's side of the supervisor identity contract as a worker-only adapter: launch by stable execution identity, adoption, exit observation, cancellation of the process set, recovery, and uncertainty when neither start nor absence is proven.

## Requirements

### Requirement: Worker-only supervisor package
The private workspace package `@taskelith/worker-supervisor` SHALL live in `packages/adapters/worker-supervisor`, SHALL hold the supervisor and the worker's supervision steps, and SHALL stay out of the control-plane and browser bundles under the boundary rule of G2 item 9.

#### Scenario: Control plane imports the supervisor
- **WHEN** control-plane product code imports `@taskelith/worker-supervisor` at runtime
- **THEN** the boundary check fails

### Requirement: Versioned execution record
Every file of an execution record SHALL carry a format version. A reader SHALL accept the current and the previous format, and SHALL treat a corrupt, unversioned, or newer-format file, or a combination the launch sequence cannot produce, as a problem that makes recovery report `uncertain`.

#### Scenario: Newer format
- **WHEN** the launch record carries a format version above the current one
- **THEN** recovery reports `uncertain`

#### Scenario: Handle without a claim
- **WHEN** a handle exists without a claim
- **THEN** recovery reports `uncertain`

### Requirement: Framed event log
The append-only `events` file SHALL frame each entry with its length and a checksum. A reader SHALL discard a torn last entry and SHALL treat a damaged entry before it as a corrupt file.

#### Scenario: Torn tail
- **WHEN** the last entry of `events` is incomplete
- **THEN** the reader returns the entries before it

### Requirement: First supervisor's launch
The first supervisor SHALL take `lock` without waiting and write `supervisor.<n>` with its identity. It SHALL seal instead of spawning when the boot differs, the deadline clock cannot be read, or the deadline has passed. Only `supervisor.1` SHALL claim, and it SHALL spawn once, in a new session and process group, only after its claim succeeded.

#### Scenario: Suspend past the deadline
- **WHEN** the machine sleeps past the deadline between hand-off and claim
- **THEN** the supervisor seals and spawns nothing

#### Scenario: Launch record exists
- **WHEN** the worker sealed before the supervisor claims
- **THEN** the supervisor follows the seal and spawns nothing

### Requirement: Spawn failure and durable writes
A spawn that fails, or a deadline that passes between claim and spawn, SHALL end with a handle recording the failure and an exit with an unknown status, an unproven start, and the termination evidence `never-spawned`. After a spawn, a failed durable write SHALL be retried while the child keeps running.

#### Scenario: Missing program
- **WHEN** the child's program does not exist
- **THEN** the exit records the failure, and recovery reports it without a second spawn

### Requirement: Exit only for an empty process set
The supervisor SHALL write `exit` only when the process set is proven empty: on Linux when the containment is unpopulated, on macOS when two consecutive listings each hold no process of the child's group and no recorded descendant is alive. Otherwise it SHALL record the survivors and keep waiting.

#### Scenario: Escaped descendant on macOS
- **WHEN** a recorded descendant in its own group lives after the child exited
- **THEN** the supervisor records it as a survivor and writes no exit until it is gone

#### Scenario: A member the first listing missed
- **WHEN** a listing holds no process of the child's group, and the next listing holds one
- **THEN** the supervisor records it as a survivor and writes no exit until two consecutive listings hold none

### Requirement: Cancellation of the process set
On a `cancel` file, a Linux supervisor SHALL kill the containment. The first macOS supervisor SHALL send the group a termination signal and then a kill, only while the child is unreaped. An adopting macOS supervisor SHALL record the cancellation as not applied and SHALL signal nothing.

#### Scenario: Adopter on macOS
- **WHEN** an adopting macOS supervisor receives a cancellation
- **THEN** it records `not-applied` and sends no signal

### Requirement: Recovery by the contract table
On start, the worker SHALL decide each execution from its journal, its record, the supervisor lock with the identity of the highest supervisor record, and native evidence, as the table of contract section 6 states. It SHALL never spawn during recovery and SHALL report `not-started` only after a seal is read back.

#### Scenario: Process ID reused
- **WHEN** another process now has the recorded child's process ID
- **THEN** the execution is `uncertain`, and nothing is adopted or signalled

#### Scenario: Seal loses its race
- **WHEN** recovery seals while a supervisor claimed first
- **THEN** recovery decides again from the claim

### Requirement: Execution lock
The execution `lock` SHALL be taken without waiting through one lock port. Only that port SHALL open the file. The record SHALL be removed only while the worker holds the lock, with the launch record removed last.

#### Scenario: Paused supervisor holds the lock
- **WHEN** a supervisor holds `lock` while the worker removes the record
- **THEN** removal fails and the record stays

### Requirement: Linux readers and containment
On Linux, the adapter SHALL read the boot identity, process start time, parent, and group from `/proc`, and the deadline clock from `/proc/uptime`. It SHALL run each execution in a cgroup v2 containment that the child is born in. A self-check SHALL prove cgroup v2 delegation, a kill control, and that the execution account cannot write any cgroup of the worker.

#### Scenario: Writable cgroup
- **WHEN** the execution account can write a `cgroup.procs` file of the worker
- **THEN** the self-check fails and names the file

### Requirement: Named crash points
The worker and the supervisor SHALL reach the crash points CP2, CP4, CP5 to CP9, and CP11 of contract section 4 through an injected hook, after the step each names. A crash at any of them SHALL lead to the recovery result section 6 assigns, without a second spawn.

#### Scenario: Crash after the spawn
- **WHEN** a supervisor crashes at CP8, before its handle
- **THEN** recovery adopts the populated containment on Linux and reports `uncertain` on macOS

### Requirement: macOS native readers
On macOS, the adapter SHALL read process identities, parents, and groups from `kinfo_proc` through `sysctl` with `KERN_PROC_PID` and `KERN_PROC_ALL`, and the deadline clock from `mach_continuous_time` and `mach_timebase_info`.

#### Scenario: Launch on macOS
- **WHEN** a supervisor with the macOS platform starts and the child exits
- **THEN** it spawns once, records the exit status, and proves termination by the process group

### Requirement: Native calls confined and failing closed
The adapter SHALL make the macOS native calls through `koffi`, an exact-pinned dependency confined to one adapter module behind the `DeadlineClock` and `ProcessInspector` ports. When the native calls cannot be loaded or read, the clock, identities, and listing SHALL fail, and the supervisor SHALL then seal.

#### Scenario: Native calls cannot load
- **WHEN** a supervisor with the macOS platform starts and `koffi` or `libSystem` cannot be loaded
- **THEN** it cannot read its own identity or the clock, seals, and spawns nothing

### Requirement: Bounded macOS listing
The macOS listing SHALL query its size, fill, and query again when the fill reports `ENOMEM`, within a bounded number of attempts.

#### Scenario: Listing grows during the fill
- **WHEN** the process list grows between the size query and the fill on every attempt
- **THEN** the listing fails after the bounded number of attempts

### Requirement: Exit record type
The supervisor's exit record type SHALL allow the termination evidence `boot-changed` or `namespace-ended` only with status `unknown`, and the exit reader SHALL build a value of that type, so that a combination the reader rejects cannot be written in code.

#### Scenario: Recovery evidence with a known status in code
- **WHEN** code builds an exit record with `boot-changed` and an exit code
- **THEN** type checking fails

### Requirement: Reaped real-process tests
Every test that starts a real supervisor SHALL, after it ends, kill every live process it started, directly or through a supervisor, found by a marker unique to the test file on the command line, and SHALL have a run-time bound, so that a failed assertion or a stuck wait fails the test instead of hanging the suite.

#### Scenario: Failed assertion with a live supervisor
- **WHEN** an assertion fails while the test's supervisor and child are running
- **THEN** the test fails, both processes are killed, and the test run ends

#### Scenario: Child before its handle
- **WHEN** a supervisor is killed after the spawn and before `handle`, and an assertion then fails
- **THEN** the child is killed although no record names it
