## MODIFIED Requirements

### Requirement: Platform facts of a proof
The acceptance context of a proof SHALL name the OS release, architecture, kernel, file system, Node.js version, and Docker engine and Compose versions of its entry, and the scenarios and harness compositions that a proof runs SHALL record their own results with the same context. On Linux the file system SHALL be the type of the mount that holds the probed path, so that ext4 is not named `ext2/ext3`; `stat -f` names it only where that type cannot be read.

#### Scenario: A self-recording proof
- **WHEN** a proof runs `make scenario-worker-kill`
- **THEN** the scenario's own `worker-kill` record and the proof's `acceptance-worker-kill` record carry the same acceptance context

#### Scenario: An ext4 volume on Linux
- **WHEN** the Linux entry's Docker volume or the worker data root is on ext4, whose magic number `stat -f` names `ext2/ext3`
- **THEN** the Linux platform and the platform row of the installation scenarios name the file system `ext4`

#### Scenario: No mount type readable
- **WHEN** `findmnt` is missing or fails in the container
- **THEN** the file system is the name that `stat -f -c %T` prints for the path
