## MODIFIED Requirements

### Requirement: Exit only for an empty process set
The supervisor SHALL write `exit` only when the process set is proven empty: on Linux when the containment is unpopulated, on macOS when two consecutive listings each hold no process of the child's group and no recorded descendant is alive. Otherwise it SHALL record the survivors and keep waiting.

#### Scenario: Escaped descendant on macOS
- **WHEN** a recorded descendant in its own group lives after the child exited
- **THEN** the supervisor records it as a survivor and writes no exit until it is gone

#### Scenario: A member the first listing missed
- **WHEN** a listing holds no process of the child's group, and the next listing holds one
- **THEN** the supervisor records it as a survivor and writes no exit until two consecutive listings hold none

## REMOVED Requirements

### Requirement: macOS fails closed
**Reason**: On 2026-10-25 the owner decided D-A of G2 item 15: the macOS native values are read through `koffi`.
**Migration**: Replaced by "macOS native readers", "Native calls confined and failing closed", and "Bounded macOS listing". A host that cannot load the native calls still fails closed and seals every launch.

## ADDED Requirements

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
