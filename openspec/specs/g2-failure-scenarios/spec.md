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

#### Scenario: Claim without a spawn on Linux
- **WHEN** the supervisor is killed after it claimed the launch record (CP7) in the Linux test container and the worker restarts
- **THEN** the empty containment ends the execution with an exit of unknown status and an unproven start, and nothing spawned

#### Scenario: Populated containment without a handle on Linux
- **WHEN** the supervisor is killed after it spawned the child, before it wrote `handle` (CP8), in the Linux test container and the worker restarts while the child runs
- **THEN** an adopting supervisor watches the containment, the execution exits with unknown status and an unproven start once the child is gone, the child spawned once, and the task opens no automatic retry

#### Scenario: Populated containment with a handle on Linux
- **WHEN** the supervisor is killed after it wrote `handle` (CP9) in the Linux test container and the worker restarts while the child runs
- **THEN** an adopting supervisor watches the containment, the execution exits with unknown status and a proven start once the child is gone, the child spawned once, and the task opens no automatic retry

#### Scenario: Exit written before the crash
- **WHEN** the supervisor is killed after it wrote `exit` (CP11) and the worker restarts
- **THEN** the recorded exit, code 0, is the execution's outcome

### Requirement: Duplicate offer delivery
A redelivery of an offer the control plane published, while its execution runs and after its result, SHALL be acknowledged and SHALL leave one launch intent, one execution, one spawn, and one result.

#### Scenario: Copies during and after the execution
- **WHEN** the same offer is published again under new broker message identities while the child runs and after the result is stored
- **THEN** every copy is acknowledged, and the control plane and the journal hold one execution that exited with code 0

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

### Requirement: Worker broker partition
On a test-side composition against the `make` services, a Toxiproxy partition of the worker's broker connection SHALL only delay an attempt: after the heal the worker runs it once, publishes its observations once, and the inventory exchange settles.

#### Scenario: Partition before the offer or while the process runs
- **WHEN** the worker's broker connection is cut before the offer or while the process runs, and healed at a seeded moment
- **THEN** the attempt exits once with one started execution, and the result is recorded with target `harness-composition`

#### Scenario: Inventory after a reconnect
- **WHEN** the worker reconnects after the control plane marked it lost and the task has ended
- **THEN** the control plane sends at most one further inventory request in the following three seconds

### Requirement: Control plane database partition
A Toxiproxy partition of the control plane's PostgreSQL connection SHALL not lose, duplicate, or reorder an attempt's facts into a wrong state: the worker repeats the same authorization operation until it is granted, redelivered observations are applied once, and observations quarantined past the redelivery budget still end the attempt once.

#### Scenario: Partition during authorization
- **WHEN** the connection is cut while the worker requests authorization, for a seeded number of unavailable answers
- **THEN** the control plane keeps running, every retry carries the first `operationId`, and the healed authority grants it

#### Scenario: Partition while the process runs
- **WHEN** the connection is cut after the start and healed before or after the exit
- **THEN** the attempt exits once, a start applied after the exit is a historical start, and nothing is quarantined

#### Scenario: Partition beyond the redelivery budget
- **WHEN** the start and the exit exhaust their deliveries before the heal
- **THEN** both are quarantined `max-deliveries`, and after the heal and a redrive in seeded order the attempt has ended once with one start

### Requirement: Cancel before W4
A cancel committed before the worker receives the offer, while the authorization request or its grant is held, or while the launch waits under admission pressure SHALL leave no record (W4) and no live grant under the cancelled assignment.

#### Scenario: Cancel before the offer, during authorization, or under pressure
- **WHEN** an assignment is cancelled at one of these points, chosen by the seed where there are several
- **THEN** no record and no live grant exist under it, and the attempt either ends cancelled with a not-started execution or runs once under a later assignment

### Requirement: Cancel after W4
A cancel of an assignment whose record is written SHALL terminate its process through the cancel file, and a worker that dies between journaling a cancellation (W1) and acknowledging it SHALL apply it once after restart and acknowledge its redelivery once.

#### Scenario: Cancel file
- **WHEN** the cancel commits after W4 or after the start, as the seed chooses
- **THEN** the attempt ends cancelled, a started process exits by `SIGKILL` under the cgroup supervisor, which kills the containment, and by `SIGTERM` under the macOS supervisor and the process-group launch host, and no scripted process remains

#### Scenario: Crash before the ack
- **WHEN** the worker is killed after W1 of the cancellation and restarted before or after the ack wait
- **THEN** the attempt ends cancelled, the cancellation is journaled once with its evidence, and the redelivery is acknowledged once

### Requirement: Invalidation racing a grant
An invalidation committed concurrently with an authorization SHALL leave no live grant under the invalidated assignment, whichever transaction commits first.

#### Scenario: Seeded race rounds
- **WHEN** the held request and the cancel are released at seeded offsets within 25 ms, in three rounds
- **THEN** each grant under the cancelled assignment is revoked, a granted round ends cancelled, and a rejected round runs once under a later assignment

### Requirement: Unauthorized start
An unauthorized start SHALL cancel only its execution: the authority writes a cancellation naming it, and the attempt's owning execution keeps running to its end.

#### Scenario: Start under a grant bound to another execution
- **WHEN** the worker's journal reports a start of a new execution under the owning execution's grant
- **THEN** one cancellation names the new execution, the attempt has no cancellation request, and the owning execution exits 0 in the only attempt

### Requirement: Rejected launch frees its slot
A launch whose authorization is finally rejected SHALL not keep a slot of the worker.

#### Scenario: One-slot worker after a cancel
- **WHEN** a one-slot worker's request is rejected after its assignment is cancelled
- **THEN** the worker accepts the re-placement and the attempt runs once

### Requirement: Stale ownership generation
With two workers, a request of a superseded ownership generation SHALL be rejected without a record, and the current owner SHALL run the attempt once.

#### Scenario: Supersession of a cut-off worker
- **WHEN** worker A's held request is answered, before or after worker B's as the seed chooses, after A's assignment is superseded and B owns the next generation
- **THEN** A's request is rejected, a request naming B's assignment at A's generation is rejected `stale-ownership-generation`, and B runs the attempt once

### Requirement: Stale recovery epoch
With two workers, a request of an older recovery epoch SHALL be rejected without a record, and a start observation of an older epoch SHALL not be recorded as a start or write a cancellation.

#### Scenario: Epoch advance between two requests
- **WHEN** the recovery epoch advances between the grant of the worker the seed chooses and the request of the other
- **THEN** the later request is rejected `stale-recovery-epoch`, and the earlier worker's start is neither recorded nor cancelled

### Requirement: Scenarios through the Linux cgroup supervisor
When the delegated cgroup and the execution account are set, as the privileged runner of `make verify-linux-g2-scenarios` sets them, each scenario worker, the crash-before-ack worker included, SHALL launch through the worker's own Linux launch host, the cgroup supervisor with the execution account, instead of the test-side process-group launch host. A partial launch, or a missing one under that runner, SHALL fail the scenario file.

#### Scenario: Privileged Linux runner
- **WHEN** `make verify-linux-g2-scenarios` runs the cancellation races
- **THEN** the scripted process of race h, and of race c when its cancel lands after the start, runs in a containment directly below its worker's own containment parent, and a check fails the scenario otherwise

#### Scenario: Launch required by the runner
- **WHEN** the runner requires the Linux launch and a launch variable is missing, or only some launch variables are set
- **THEN** the scenario file fails when it loads, naming the missing variables, and no scenario falls back to the process-group launch host

#### Scenario: Unprivileged run
- **WHEN** `make verify` runs the same files on a Linux host without those settings
- **THEN** the scenario workers launch through the process-group launch host and the containment check is skipped

### Requirement: Scenarios through the macOS supervisor
When `TASKELITH_MACOS_SCENARIOS` is `1` on macOS, as `make verify-macos-g2-scenarios` sets it, each scenario worker, the crash-before-ack worker included, SHALL launch through the worker's own launch host, the macOS supervisor. Set off macOS, the variable SHALL fail the scenario file. Without it the scenario files SHALL be skipped on macOS.

#### Scenario: macOS runner
- **WHEN** `make verify-macos-g2-scenarios` runs the cancellation races
- **THEN** the scripted process of race h, race g, and race c when its cancel lands after the start, is a child of a launch supervisor of its own worker, and a check fails the scenario otherwise

#### Scenario: Variable off macOS
- **WHEN** `TASKELITH_MACOS_SCENARIOS` is `1` on another platform
- **THEN** the scenario file fails when it loads, naming the platform

#### Scenario: Plain run on macOS
- **WHEN** `make verify` runs the same files on macOS
- **THEN** every scenario is skipped with its reason

### Requirement: Adoption cancel scenario
Through the macOS supervisor, race g SHALL kill the launching supervisor of a running execution, let the worker start an adopting supervisor, and cancel the attempt, before the adopter starts or while it observes, as the seed chooses. The adopter SHALL record the cancel as not applied and signal nothing. On any other launch host race g SHALL be skipped as not applicable.

#### Scenario: Adopter on macOS
- **WHEN** race g runs under `make verify-macos-g2-scenarios`
- **THEN** the execution gains the evidence `cancellation-not-applied` while its child keeps running, and after the child is released it stays `started` with the evidence `uncertain`, and the task result stays `pending`

#### Scenario: Other hosts
- **WHEN** the cancellation races run on Linux
- **THEN** race g is skipped as not applicable
