# observation-consumption Specification

## Purpose
The control plane's consumption of execution and worker observations: authentication, inbox deduplication, the persisted producer cursor and its confirmation, first contact, the effects of acceptance, refusal, command rejection, exit, not-started, capacity declaration, and admission pressure, and stale-generation rejection.

## Requirements

### Requirement: One transaction per observation
The control plane SHALL apply each observation in one SERIALIZABLE transaction that records its inbox entry, its sequence in the producer cursor of its `(workerId, journalId)`, first contact, its effect, and any confirmation, and SHALL acknowledge it only after that transaction committed. An observation whose identity the inbox already holds SHALL NOT apply its effect again: at a sequence its journal applied, it SHALL change nothing but the worker's contact and a confirmation sent again.

#### Scenario: Redelivered observation
- **WHEN** an applied acceptance is delivered again under a new broker message identity
- **THEN** it is a duplicate, the assignment and the cursor are unchanged, and the outbox gains only a confirmation of the current prefix

#### Scenario: Store failure
- **WHEN** the store fails while an exit is applied
- **THEN** nothing of it is committed, and the message is delivered again

### Requirement: Authenticated producer
An observation SHALL be applied only when its subject names its `metadata.workerId`, that worker is enrolled, and its `journalId` is the worker's enrolled journal and not retired, or, for a worker that is not revoked, a journal never seen from that worker that replaces the enrolled one as a new journal incarnation; otherwise it SHALL NOT be applied. An observation of a revoked worker SHALL be applied under the requirement for observations of a revoked worker in `launch-reconciliation`.

#### Scenario: Worker in the body differs from the subject
- **WHEN** an observation on worker A's subject names worker B
- **THEN** it is not applied, and no contact is recorded for either worker

#### Scenario: Unknown journal
- **WHEN** an enrolled worker's observation names a journal other than its enrolled one that the control plane saw from that worker before
- **THEN** it is not applied, and its sequence is not recorded

### Requirement: Confirmation by sequence
The producer cursor SHALL record each applied or rejected sequence, and when its contiguous prefix grows, the transaction SHALL append `execution.observations.confirmed` with the new `confirmedThrough` to the worker's command subject. The outbox publisher SHALL send a confirmation without a `Nats-Msg-Id` header.

#### Scenario: Gap
- **WHEN** sequences 1, 2, and 4 of a journal are applied
- **THEN** confirmations through 1 and 2 are appended, and none for 4 until 3 is applied, which appends a confirmation through 4

### Requirement: Confirmation sent again
A duplicate from an authenticated producer at or below `confirmedThrough` SHALL append a confirmation of the current `confirmedThrough` again, under a new event identity and without any other effect than recording the worker's contact, because the worker may have lost the earlier one. A revoked worker's duplicate SHALL record no contact.

#### Scenario: Confirmation lost
- **WHEN** the confirmation through 1 expired from the stream unread, and the worker republishes its applied observation at sequence 1
- **THEN** it is a duplicate, the cursor is unchanged, and a confirmation through the current prefix is appended again under a new event identity

### Requirement: First contact
An authenticated observation of a worker that is not revoked SHALL mark its worker reachable and SHALL move the worker's last contact to the database time, never backward. A duplicate that the inbox already holds SHALL record contact too. An observation of a revoked worker SHALL record no contact, as `launch-reconciliation` requires.

#### Scenario: New worker
- **WHEN** a newly enrolled worker's first capacity declaration is applied
- **THEN** the worker is reachable and eligible for placement

#### Scenario: Duplicate after lost contact
- **WHEN** a worker marked unreachable republishes an observation that was already applied
- **THEN** it is a duplicate, and the worker is reachable again

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

### Requirement: Refusal after a grant
A refusal, or a protocol rejection of an offer, of an assignment under which an execution can still run SHALL keep its reservation and SHALL act as an invalidating writer, as a cancellation does: it SHALL revoke that execution's grants and append `execution.cancellation.request` with `assignment-ended`. The execution's later exit or `not-started` SHALL end the attempt and release the reservation.

#### Scenario: Refusal of an authorized execution's assignment
- **WHEN** a worker refuses an accepted assignment whose execution holds a live grant
- **THEN** the assignment ends as refused with its reservation held, the grant is revoked, the worker receives the cancellation request, and the execution's `not-started` releases the reservation

### Requirement: Protocol rejection of an offer
A command rejection of an `execution.assignment.offer` for `protocol-not-supported` SHALL refuse the offer's assignment with that reason, whatever its sequence, and SHALL set the worker's protocol version to the one its window shares with the control plane, or to none, under the protocol fence.

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
- **THEN** a retry attempt naming it is opened, and the first pass after its backoff places it charging the retry allowance

#### Scenario: Third failure
- **WHEN** the second retry of a task exits with code 1
- **THEN** no further attempt is opened, and the task's result reports that exit

#### Scenario: Spawn failure
- **WHEN** an attempt's execution exits with a failed spawn and no proven start
- **THEN** no retry is opened

### Requirement: Retry backoff
A retry attempt without an assignment SHALL NOT be placed before the retried attempt's end plus `placementBackoff` of its retry number, which grows from 5 s to at most 60 s with jitter, and a placement pass SHALL still reach the other waiting tasks meanwhile.

#### Scenario: Retry within its backoff
- **WHEN** an attempt's execution exits with code 1 after a proven start, and a placement pass runs before the retry's backoff has passed
- **THEN** the retry is not placed, other waiting tasks are, and a pass after the backoff places the retry

### Requirement: Capacity and pressure reports
A capacity declaration SHALL set the worker's slots, CPU, memory, controls, and the protocol version common to its window and the control plane's, and SHALL clear its capacity refusal. An admission pressure change SHALL set the worker's pressure for a non-empty cause list, keeping an earlier start, and clear it for an empty one.

#### Scenario: Older declaration after a newer one
- **WHEN** a declaration at sequence 5 is applied and then one at sequence 3 arrives
- **THEN** the worker keeps the values of sequence 5, and sequence 3 is still confirmed

### Requirement: Report sequence fences
Each worker SHALL keep four fences: capacity values, pressure, the capacity refusal mark, and the protocol version. A write SHALL apply only when its observation's sequence is above its fence's last applied sequence, which it then advances; a write that does not apply SHALL succeed unchanged, and a write for a worker without a record SHALL fail without advancing any fence. Marking and clearing a capacity refusal SHALL share one fence.

#### Scenario: Late refusal after a newer declaration
- **WHEN** a declaration at sequence 3 is applied and then a `worker-slots-exhausted` refusal at sequence 2 arrives
- **THEN** the assignment ends as refused, and the worker is not marked refused

#### Scenario: Older declaration after a newer refusal
- **WHEN** a `worker-capacity-exhausted` refusal at sequence 3 is applied and then a declaration at sequence 2 arrives
- **THEN** the declaration's capacity values apply, and the worker stays marked refused

#### Scenario: Terminal fact older than a refusal
- **WHEN** a `worker-slots-exhausted` refusal at sequence 3 is applied and then an exit at sequence 2 arrives
- **THEN** the exit ends its attempt, and the worker stays marked refused

#### Scenario: Late protocol rejection
- **WHEN** a declaration at sequence 3 is applied and then a protocol rejection of an offer at sequence 2 arrives
- **THEN** the offer's assignment is refused, and the worker keeps the declared protocol version

### Requirement: Epoch gate before effects
Before the effect of an exit, `not-started`, `uncertain`, `termination-unproven`, or `cancellation.not-applied`, the control plane SHALL check the observation's recovery epoch and the quarantine state with the execution module's start-observation check. An observation outside the current epoch, or in quarantine, SHALL be applied without effect, confirmed, and logged as `execution.observation.evidence`.

#### Scenario: Old-epoch exit beside a current one
- **WHEN** after a restore one execution's exit arrives at the earlier epoch and another execution's exit at the current epoch
- **THEN** the first ends nothing, keeps the reservation, and is confirmed and logged; the second ends its attempt and releases it

#### Scenario: Evidence in quarantine
- **WHEN** `uncertain`, `termination-unproven`, `cancellation.not-applied`, and `not-started` observations arrive at the current epoch during restore quarantine
- **THEN** each is confirmed and logged, the task is unchanged, and a repeat of one after the quarantine is a duplicate without effect

#### Scenario: Unrecorded process at an older epoch
- **WHEN** an unrecorded process is reported at an epoch older than the current one
- **THEN** it is recorded for the reconciliation queue, and its warning names its epoch
