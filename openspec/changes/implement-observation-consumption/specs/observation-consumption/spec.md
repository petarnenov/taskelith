## Purpose
The control plane's consumption of execution and worker observations: authentication, inbox deduplication, the persisted producer cursor and its confirmation, first contact, the effects of acceptance, refusal, command rejection, exit, not-started, capacity declaration, and admission pressure, and stale-generation rejection.

## ADDED Requirements

### Requirement: One transaction per observation
The control plane SHALL apply each observation in one SERIALIZABLE transaction that records its inbox entry, its sequence in the producer cursor of its `(workerId, journalId)`, first contact, its effect, and any confirmation, and SHALL acknowledge the message only after that transaction committed. An observation whose identity the inbox already holds SHALL change nothing.

#### Scenario: Redelivered observation
- **WHEN** an applied acceptance is delivered again under a new broker message identity
- **THEN** it is a duplicate, and the assignment, the cursor, and the outbox are unchanged

#### Scenario: Store failure
- **WHEN** the store fails while an exit is applied
- **THEN** nothing of it is committed, and the message is delivered again

### Requirement: Authenticated producer
An observation SHALL be applied only when its subject names its `metadata.workerId`, that worker is enrolled and not revoked, and its `journalId` is the worker's enrolled journal; otherwise it SHALL NOT be applied.

#### Scenario: Worker in the body differs from the subject
- **WHEN** an observation on worker A's subject names worker B
- **THEN** it is not applied, and no contact is recorded for either worker

#### Scenario: Unknown journal
- **WHEN** an enrolled worker's observation names a journal other than its enrolled one
- **THEN** it is not applied, and its sequence is not recorded

### Requirement: Observations left to later changes
An authenticated observation of a type that a later change consumes (`execution.started`, `execution.launch.rejected`, `execution.uncertain`, `execution.termination-unproven`, `execution.unrecorded-process`, `execution.cancellation.not-applied`, `worker.inventory.reported`), an observation of a revoked worker, and one whose sequence is a `rollback` SHALL NOT be applied, and its sequence SHALL stay unrecorded; an authenticated one SHALL still record first contact.

#### Scenario: Start before 21d
- **WHEN** a worker's `execution.started` is delivered
- **THEN** the worker becomes reachable, the execution is unchanged, the cursor does not record its sequence, and after five deliveries it is in quarantine

### Requirement: Confirmation by sequence
The producer cursor SHALL record each applied or rejected sequence, and when its contiguous prefix grows, the transaction SHALL append `execution.observations.confirmed` with the new `confirmedThrough` to the worker's command subject. The outbox publisher SHALL send a confirmation without a `Nats-Msg-Id` header.

#### Scenario: Gap
- **WHEN** sequences 1, 2, and 4 of a journal are applied
- **THEN** confirmations through 1 and 2 are appended, and none for 4 until 3 is applied, which appends a confirmation through 4

### Requirement: First contact
An authenticated observation SHALL mark its worker reachable and SHALL move the worker's last contact to the database time, never backward.

#### Scenario: New worker
- **WHEN** a newly enrolled worker's first capacity declaration is applied
- **THEN** the worker is reachable and eligible for placement

### Requirement: Stale ownership generation
An observation about an attempt SHALL be rejected without effect, with the reason `stale-ownership-generation`, when its ownership generation differs from its task's, or, for an acceptance or refusal, from its assignment's. A rejected observation SHALL still be recorded in the inbox and the cursor.

#### Scenario: Late acceptance after a refusal
- **WHEN** an assignment was refused, its attempt was placed again at the next generation, and an acceptance at the earlier generation arrives
- **THEN** it changes nothing, its sequence is confirmed, and the rejection is logged with its reason

### Requirement: Acceptance and refusal
An acceptance SHALL accept its assignment. A refusal SHALL end its assignment and release its reservation unless an execution under it can run, leaving the attempt to be placed again. A refusal with `worker-slots-exhausted` or `worker-capacity-exhausted` SHALL make the worker ineligible for placement until its next capacity declaration or terminal observation, and one with `worker-admission-pressure` SHALL record the worker's admission pressure.

#### Scenario: Slots exhausted
- **WHEN** a worker refuses an offer with `worker-slots-exhausted`
- **THEN** the assignment ends as refused, its reservation is released, and the next placement pass does not offer that worker the attempt

### Requirement: Protocol rejection of an offer
A command rejection of an `execution.assignment.offer` for `protocol-not-supported` SHALL refuse the offer's assignment with that reason and SHALL set the worker's protocol version to the one its window shares with the control plane, or to none.

#### Scenario: No common version
- **WHEN** a worker rejects an offer command for `protocol-not-supported` with a window that shares no version with the control plane
- **THEN** the assignment ends as refused with `protocol-not-supported`, its reservation is released, and the worker is not eligible for placement

### Requirement: Exit and not-started outcomes
An exit SHALL record the fact and end its attempt. A `not-started` SHALL record the fact and end the attempt only when cancellation was requested. In the same transaction, each assignment of an ended attempt SHALL be ended and its reservation released, with an `execution.assignment.end` command for each assignment it ends, and the worker's capacity refusal SHALL be cleared. A task whose attempt ended without an automatic retry SHALL close its delegation.

#### Scenario: Clean exit
- **WHEN** an accepted assignment's execution exits with code 0
- **THEN** the attempt ends `exited` with code 0, the reservation is released, the worker receives `execution.assignment.end` with `attempt-ended`, no retry is opened, and `readTaskResult` reports the outcome

#### Scenario: Child task ends
- **WHEN** a delegated child's only attempt exits with code 0
- **THEN** its delegation is closed, and its parent is no longer a waiting parent

#### Scenario: Not started without cancellation
- **WHEN** an execution is reported `not-started` and its attempt has no cancellation request
- **THEN** the attempt stays active and its reservation stays held

### Requirement: Automatic retry
An attempt that ended without a cancellation request, with the outcome `not-started` or `exited` with a proven start and a status other than exit code 0, SHALL be followed in the same transaction by a new attempt that retries it, while the task has fewer than 2 attempts that retry another. Its placement SHALL be an automatic retry of the earlier attempt.

#### Scenario: Failed exit
- **WHEN** an attempt's execution exits with code 1 after a proven start
- **THEN** a retry attempt naming it is opened, and the next pass places it charging the retry allowance

#### Scenario: Third failure
- **WHEN** the second retry of a task exits with code 1
- **THEN** no further attempt is opened, and the task's result reports that exit

#### Scenario: Spawn failure
- **WHEN** an attempt's execution exits with a failed spawn and no proven start
- **THEN** no retry is opened

### Requirement: Capacity and pressure reports
A capacity declaration SHALL set the worker's slots, CPU, memory, controls, and the protocol version common to its window and the control plane's, and SHALL clear its capacity refusal. An admission pressure change SHALL set the worker's pressure for a non-empty cause list, keeping an earlier start, and clear it for an empty one. Each kind SHALL apply only when its sequence is above the last applied one of that kind.

#### Scenario: Older declaration after a newer one
- **WHEN** a declaration at sequence 5 is applied and then one at sequence 3 arrives
- **THEN** the worker keeps the values of sequence 5, and sequence 3 is still confirmed
