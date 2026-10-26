## Purpose
Define the G2 failure scenarios of work item 24, the targets they run against, and the recorded results that serve as G2 exit evidence for R05 to R08 and R27.

## ADDED Requirements

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
- **THEN** the attempt ends cancelled, a started process exits by `SIGTERM`, and no scripted process remains

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

### Requirement: Adoption cancel scenario on Linux
The scenario of an adopting macOS supervisor that does not apply a cancel SHALL be reported not applicable on Linux, with its reason.

#### Scenario: Linux run
- **WHEN** the cancellation races run on Linux
- **THEN** the scenario is skipped as not applicable

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
