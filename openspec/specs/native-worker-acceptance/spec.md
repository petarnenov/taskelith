# native-worker-acceptance Specification

## Purpose
Define how the G2 rows of the native acceptance gates are proven and recorded on each matrix entry of the worker platform contract: the acceptance runner, its records, the lifecycle scenarios, and the acceptance table that the G2 closure cites.

## Requirements

### Requirement: Native acceptance runner
`make native-acceptance` SHALL require `RESULTS` and SHALL run the proofs of the G2 acceptance rows (service lifecycle, process ownership, journal and storage, cancellation, and connectivity) for each matrix entry the host provides: the macOS entry natively on a macOS 26 host, and the Linux entry in the worker image or its base under the host's Docker engine. `ENTRIES` SHALL narrow the entries to `macos` or `linux`.

#### Scenario: Apple Silicon host
- **WHEN** `make native-acceptance RESULTS=results.jsonl` runs on macOS 26 on arm64 with Docker running
- **THEN** it runs the proofs of `macos-26-arm64` natively and those of `linux-ubuntu-24.04-arm64` under Docker, and records each into `results.jsonl`

### Requirement: Matrix entry detection
The runner SHALL derive each entry's name from the observed OS release and architecture, SHALL refuse a host that is not a matrix entry, and SHALL not otherwise depend on the host's architecture.

#### Scenario: Not a matrix entry
- **WHEN** the runner runs on macOS 15
- **THEN** it fails, naming macOS 26 as the required release

### Requirement: Every proof runs
The runner SHALL run every proof even after one failed, and SHALL fail at the end when any proof failed.

#### Scenario: A failed proof
- **WHEN** one proof fails
- **THEN** the remaining proofs still run, the failed proof is recorded as `failed`, and the target fails at the end

### Requirement: Recorded acceptance proofs
Each proof SHALL record one result `acceptance-<proof>` through the scenario recorder, with the run's seed, its target, its outcome from the command's exit status, a detail that names the exit status and the test counts or the last output line, and the acceptance context of its entry, row, command, and platform.

#### Scenario: A suite proof
- **WHEN** the journal suites pass on the macOS entry
- **THEN** `results.jsonl` gains `acceptance-journal-suites` with target `host-test-suite`, outcome `passed`, and the context `macos-26-arm64`, `journal-and-storage`, the command, and the platform

### Requirement: Platform facts of a proof
The acceptance context of a proof SHALL name the OS release, architecture, kernel, file system, Node.js version, and Docker engine and Compose versions of its entry, and the scenarios and harness compositions that a proof runs SHALL record their own results with the same context. On Linux the file system SHALL be the type of the mount that holds the probed path, so that ext4 is not named `ext2/ext3`; `stat -f` names it only where that type cannot be read.

#### Scenario: A self-recording proof
- **WHEN** a proof runs `make scenario-worker-kill`
- **THEN** the scenario's own `worker-kill` record and the proof's `acceptance-worker-kill` record carry the same acceptance context

#### Scenario: An ext4 volume on Linux
- **WHEN** the Linux entry's Docker volume or the worker data root is on ext4, whose magic number `stat -f` names `ext2/ext3`
- **THEN** the Linux platform, the platform row of the installation scenarios, and the native worker volume name the file system `ext4`

#### Scenario: No mount type readable
- **WHEN** `findmnt` is missing or fails in the container
- **THEN** the file system is the name that `stat -f -c %T` prints for the path

### Requirement: Linux worker container lifecycle
`make scenario-worker-lifecycle` SHALL, on a fresh throwaway installation with an enrolled Linux worker, run a task whose execution runs as the execution account in its own containment and exits 0, then stop the installation and start it again with the steps of the `installation-stop` and `installation-start` targets.

#### Scenario: Restart with the volume
- **WHEN** the scenario runs on Docker Desktop for arm64
- **THEN** the first task exits 0 as uid 10003 in `executions/<executionId>`, and the installation is stopped and started again

### Requirement: Restarted Linux worker proven
`make scenario-worker-lifecycle` SHALL pass only when the restarted worker keeps the digest of its identity file and its enrollment, a new worker process logs its first reconciliation pass and its broker contact, the worker keeps its containment, and a second task runs as the execution account and exits 0, and SHALL record the platform.

#### Scenario: Identity kept
- **WHEN** the worker comes back with the same identity file
- **THEN** the second task exits 0 as uid 10003, and the result is recorded `passed` with the platform

#### Scenario: Identity lost on restart
- **WHEN** the identity file differs after the restart
- **THEN** the scenario fails and records `failed`

### Requirement: Native worker lifecycle
`make scenario-native-worker-lifecycle` SHALL start a fresh throwaway installation without a Linux worker and run the checkout's worker as a host process, enrolled with a token for the host's platform and architecture, with a data root whose path holds spaces under `NATIVE_DATA_PARENT` or the temporary directory, and SHALL record the data root's volume and free space.

#### Scenario: Native macOS worker
- **WHEN** the scenario runs on macOS 26 on arm64 with the data root on local APFS
- **THEN** the native worker enrolls with a `darwin` `arm64` token and runs a task that exits 0

### Requirement: Restarted native worker proven
`make scenario-native-worker-lifecycle` SHALL stop the native worker with `SIGTERM`, start it again without a token, and pass only when the worker exited with status 0, kept its identity file and its enrollment, came online again, ran a second task that exits 0, and its `worker/` subtree has mode 0700.

#### Scenario: Clean restart
- **WHEN** the native worker stops on `SIGTERM` and starts again
- **THEN** its identity survives, the second task exits 0, and the result is recorded `passed`

#### Scenario: Unclean stop
- **WHEN** the native worker exits with a status other than 0 on `SIGTERM`
- **THEN** the scenario fails and records `failed`

### Requirement: Linux test image per architecture
The Linux test image of `make verify-linux-cgroup` SHALL use the pinned Node.js tarball of the Docker host's architecture, x86_64 or aarch64, and fail on any other. `make linux-test-suites` SHALL run the test files of `SUITES` in that image as an unprivileged user, without network, with its temporary directory on a fresh volume. Both SHALL accept `PATTERN` as a test name pattern.

#### Scenario: arm64 Docker host
- **WHEN** `make verify-linux-cgroup` runs on Docker Desktop for arm64
- **THEN** the image is built with the linux-arm64 tarball and the privileged tests run

### Requirement: Native data root paths
The worker journal tests SHALL prove that a data root whose path holds spaces enrolls, reopens, and keeps its root lock, and, on a case-insensitive volume, that opening a case-variant path of a held root fails with `root-locked`.

#### Scenario: Default APFS
- **WHEN** the journal suites run on a case-insensitive APFS volume
- **THEN** a second open of the held root through a path that differs only in case fails with `root-locked`

### Requirement: Acceptance table
The change that runs the acceptance on a matrix entry SHALL record a table with one line per G2 row and entry: the row, the matrix entry, each proof's target or test, the outcome, the record reference, and the reason a row stays open or failed, citing a known defect by its name, and SHALL never report a failed or unrun proof as passed.

#### Scenario: A known defect
- **WHEN** a crash window fails on the known defect D1
- **THEN** the table reports it as failed and cites D1
