## Purpose
The control plane's reconciliation of worker inventory: inventory requests and their bound, the application of inventory snapshots with the rollback check and the omission rules, new journal incarnations and retired journals, the reconciliation of assignments whose local history was lost, the re-sent offer, and the execution evidence that observations of uncertainty, unproven termination, unrecorded processes, and unapplied cancellation carry.

## ADDED Requirements

### Requirement: Inventory request
The control plane SHALL request a worker's inventory by appending `worker.inventory.requested` with a fresh random `requestId` to the worker's command subject, and SHALL keep only the latest request of each worker as its current one. The outbox publisher SHALL send an inventory request without a `Nats-Msg-Id` header.

#### Scenario: Unsolicited report
- **WHEN** a worker's report arrives without a `requestId`
- **THEN** one inventory request with a new `requestId` is appended to the worker's command subject, and its bound lists the highest sequence applied from each of the worker's journals

#### Scenario: Fresh snapshot omits an undelivered offer
- **WHEN** a fresh snapshot omits an unfinished assignment whose acceptance was never applied and for which no grant is recorded
- **THEN** the assignment's offer is re-sent and no new inventory request is appended

#### Scenario: Newer request
- **WHEN** a second request is sent to a worker before the first is answered
- **THEN** only the second is the worker's current request, and a snapshot answering the first is not fresh

#### Scenario: Request published
- **WHEN** the outbox publisher sends an inventory request
- **THEN** the publication carries no `Nats-Msg-Id` header

### Requirement: Request bound
Each inventory request SHALL record its bound: for each journal of the worker, the highest sequence applied from it and the unfinished assignments whose acceptance was applied from it. An observation applied after the request SHALL NOT change the bound.

#### Scenario: Observation after the request
- **WHEN** a request is sent while sequence 9 is the highest applied from the worker's journal, and sequence 10 is applied afterwards
- **THEN** the request's bound still holds sequence 9 for that journal

### Requirement: Inventory requests at start
At start, the control plane SHALL request the inventory of every enrolled worker that is not revoked, once and each in its own transaction, logging each failure without retrying it and logging a summary of the requests sent and failed.

#### Scenario: One request fails
- **WHEN** the control plane starts with two active workers and the request to one of them fails
- **THEN** the other worker's request is stored and appended, the failure is logged with its worker, and the summary reports one failure

### Requirement: Inventory report authentication and contact
An inventory report part SHALL be applied only when its subject names its `workerId`, the worker is enrolled and not revoked, and its `journalId` is the worker's enrolled journal and not retired, or an unseen journal that replaces it; otherwise it SHALL NOT be applied and SHALL record no contact. Each applied part SHALL be deduplicated by `reportId.part` in the inbox, SHALL record first contact, and SHALL NOT be confirmed.

#### Scenario: Report makes a worker reachable
- **WHEN** a newly enrolled worker's first report part is applied
- **THEN** the worker is reachable, and no confirmation is appended

#### Scenario: Repeated part
- **WHEN** an applied part is delivered again
- **THEN** it is a duplicate and changes nothing

#### Scenario: Report of a revoked worker
- **WHEN** a revoked worker's report part arrives
- **THEN** it is not applied, no contact is recorded, and no inventory request is appended

### Requirement: Pending snapshots
The control plane SHALL store the parts of a snapshot until it is complete and the producer cursor of its journal confirms every sequence through its `throughSequence`, and SHALL evaluate a stored complete snapshot after each part stored and after each cursor advance of its journal, without delaying the acknowledgement of any message. A part of a snapshot that is not fresh, whose `snapshot` is below one already received from the same journal, SHALL be discarded.

#### Scenario: Snapshot ahead of its observations
- **WHEN** a complete snapshot with `throughSequence` 5 arrives while the cursor confirms through 4
- **THEN** it is stored unapplied, and applying the observation at sequence 5 applies it in the same transaction

#### Scenario: Delayed snapshot
- **WHEN** a snapshot numbered 3 arrives without the current `requestId` after a part of snapshot 4 from the same journal
- **THEN** it is discarded and never applied

### Requirement: Rollback check of a fresh snapshot
A complete snapshot whose `requestId` is the worker's current request SHALL be checked against the request's bound before any other rule: a `throughSequence` below the bound's sequence of its journal, or the omission of an unfinished assignment the bound lists for that journal, SHALL be a rollback. A fresh snapshot below a `snapshot` already received SHALL be used only for this check. A snapshot that is not fresh SHALL never prove a rollback.

#### Scenario: Journal rolled back below the bound
- **WHEN** a request's bound holds sequence 9 for the worker's journal and the fresh snapshot answering it has `throughSequence` 6
- **THEN** the journal is retired as rolled back, and the snapshot is not applied

#### Scenario: Rolled-back counter
- **WHEN** a fresh snapshot numbered 2 omits an assignment its bound lists, after snapshot 7 was received from the same journal
- **THEN** the rollback check retires the journal, and snapshot 2 never replaces snapshot 7

#### Scenario: Delayed snapshot proves nothing
- **WHEN** a snapshot without the current `requestId` has a `throughSequence` below the bound
- **THEN** the journal is not retired

### Requirement: Snapshot effects
Applying a snapshot SHALL change only the handling of the worker's unfinished assignments it omits; it SHALL NOT change any execution's state, and SHALL record evidence only through the reconciliation of lost local history.

#### Scenario: Reported execution state
- **WHEN** a snapshot reports an execution as `exited` that the control plane records as `started`
- **THEN** the execution stays `started`

### Requirement: Omitted assignments
An omitted assignment whose acceptance was applied from the snapshot's journal at a sequence up to `throughSequence`, or from an earlier journal of the worker, SHALL be reconciled as having lost its local history. Any other omitted assignment SHALL only be re-sent while no grant was ever recorded for its attempt, and a snapshot without the current `requestId` that omits one SHALL request the worker's inventory.

#### Scenario: Restored journal lost an acknowledged offer
- **WHEN** a worker's journal restored from an older copy lost only an acknowledged offer whose acceptance was applied, no grant exists, and the snapshot omits the assignment
- **THEN** the offer is re-sent with its `commandId` unchanged

#### Scenario: Omitted assignment with a grant
- **WHEN** a snapshot omits an assignment whose acceptance was applied from its journal at a sequence up to `throughSequence`, and its execution holds a seeded grant
- **THEN** the execution records `local-history-lost` and stays in its state

#### Scenario: Offer not yet received
- **WHEN** an unsolicited snapshot omits an offered assignment with no applied acceptance and no grant
- **THEN** the offer is re-sent, an inventory request is appended, and no execution changes

### Requirement: New journal incarnation
An observation or inventory report of an enrolled worker that is not revoked, whose `journalId` the control plane has never seen from that worker and no other worker holds, SHALL replace the worker's enrolled journal, retire the previous journal, log the replacement with the previous and the new `journalId`, restart the worker's report fences, and reconcile every unfinished assignment of the worker as having lost its local history, in its transaction.

#### Scenario: Missing journal replaced by an operator
- **WHEN** a worker whose journal was lost publishes its first observation from a new incarnation, with one unfinished assignment without a grant and one whose execution holds a seeded grant
- **THEN** the enrolled journal is the new one, `execution.journal.replaced` is logged with both journals, the first assignment's offer is re-sent, and the second's execution records `local-history-lost`

#### Scenario: First declaration of a new incarnation
- **WHEN** the previous journal's last capacity declaration had sequence 3 and the new incarnation declares its capacity at sequence 1
- **THEN** the new declaration is applied

### Requirement: Refused journals
A journal seen from the worker before, a journal another worker holds, and any new journal of a revoked worker SHALL be refused without effect and without contact.

#### Scenario: Previously seen journal
- **WHEN** a worker whose journal was replaced publishes an observation from its previous journal
- **THEN** it is not applied, the enrolled journal is unchanged, and no contact is recorded

#### Scenario: New journal of a revoked worker
- **WHEN** a revoked worker publishes an observation from a journal never seen before
- **THEN** it is not applied, and the worker's enrolled journal is unchanged

#### Scenario: Journal of another worker
- **WHEN** a worker presents a journal that is another worker's enrolled journal
- **THEN** it is refused, and neither worker's journal changes

### Requirement: Journal retirement after a rollback
A sequence classified `rollback`, and a fresh snapshot that fails the rollback check, SHALL retire their journal as a journal loss: the worker SHALL become unreachable, its ownership and reservations SHALL be kept, and every later observation or report of that journal SHALL be refused without contact until a new incarnation replaces it.

#### Scenario: Rollback that repeats a sequence
- **WHEN** an observation arrives at an applied sequence of its journal under a new observation identity
- **THEN** the journal is retired, the observation is not applied, the worker is not offered new assignments, and its assignments keep their reservations

#### Scenario: Observation after retirement
- **WHEN** a worker publishes an observation at a new sequence of its retired journal
- **THEN** it is not applied, and the worker stays unreachable

### Requirement: Lost local history
An assignment whose worker lost its local history SHALL keep its ownership and reservation. Its offer SHALL be re-sent while no grant was ever recorded for its attempt; otherwise every execution under it that is not terminal SHALL record `local-history-lost`, so that its attempt cannot end and no retry follows it until a terminal fact or an operator resolves it.

#### Scenario: Uncertain attempt gets no retry
- **WHEN** an execution under an assignment of a worker that lost its local history records `local-history-lost`
- **THEN** the execution keeps its state, its attempt stays active with its reservation held, and no retry attempt is opened

### Requirement: Acceptance provenance
Applying an acceptance SHALL record in its assignment the journal and sequence it was applied from. An assignment accepted before this was recorded SHALL have no provenance, and its omission SHALL be unclassified.

#### Scenario: Acceptance recorded
- **WHEN** an acceptance at sequence 4 of a journal is applied
- **THEN** its assignment records that journal and sequence 4, and the worker's unfinished assignments list it

### Requirement: Re-sent offer
A re-sent offer SHALL append a new outbox row, under a new event identity, whose subject and payload are the stored offer's unchanged, with the same `commandId` and `issuedAt`. An assignment without a stored offer SHALL NOT be re-sent, and the omission SHALL be logged.

#### Scenario: Offer re-sent twice
- **WHEN** two snapshots with different `reportId` each re-send the same offer
- **THEN** the outbox holds the original and two copies with distinct event identities, and all three carry the same command, `commandId`, and `issuedAt`

### Requirement: Unrecorded process
An `execution.unrecorded-process` observation SHALL be applied with no domain effect: its sequence SHALL be recorded and confirmed, and it SHALL be logged as a structured warning with its worker, containment, and process count. It SHALL never count as current work.

#### Scenario: Unrecorded process after data loss
- **WHEN** a worker reports an unrecorded process
- **THEN** no task or assignment changes, its sequence is confirmed, and the warning is logged

### Requirement: Execution evidence observations
`execution.uncertain`, `execution.termination-unproven`, and `execution.cancellation.not-applied` SHALL record their evidence on their execution under the stale-generation rule of observation consumption. Evidence the domain refuses, such as `termination-unproven` after an exit, SHALL make the observation `rejected`, recorded and confirmed without effect.

#### Scenario: Uncertain execution
- **WHEN** a worker reports a started execution `uncertain`
- **THEN** the execution stays `started` with the evidence, and its attempt cannot end until a terminal fact

#### Scenario: Termination unproven after an exit
- **WHEN** `execution.termination-unproven` arrives for an execution already recorded `exited`
- **THEN** it is rejected without effect, and its sequence is confirmed

#### Scenario: Cancellation not applied
- **WHEN** a worker reports `execution.cancellation.not-applied` for an execution whose attempt has a cancellation request
- **THEN** the execution stays `started`, the cancellation request stays pending, and its later exit ends the attempt as cancelled
