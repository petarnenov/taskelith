# product-ports Specification

## Purpose
Define the module-owned ports and contract values behind the board, the task detail, the "Needs you" inbox, standing approval rules, task intake, write-back, and auto-merge (ADR 0008 decision 6), for implementation in G3.

## Requirements

### Requirement: Vendor-neutral product ports
The board, inbox, and standing rule ports SHALL belong to the Execution module, and the intake, write-back, auto-merge setting, and merge queue ports to the Integrations module, which imports only the kernel, SDLC, and Execution; no type, value, or test of either module SHALL name a source, SCM, harness, or framework.

#### Scenario: New intake source
- **WHEN** a new intake source is added
- **THEN** it implements `IntakeSource` and `WriteBack` in a plugin, and neither module changes

### Requirement: Board columns from the framework mapping
The board SHALL have the columns propose, specify, implement, verify, review, and archived, and SHALL derive each stage's column from the obligations and graph order the frozen SDLC framework port returns, placing a review stage before any implementation stage in specify, and keeping a card whose current stage, the first stage not completed or, once all completed, the last closure stage, is the Close stage in review with its merge gate state until its change is merged, then in archived.

#### Scenario: Specification review stage
- **WHEN** a workflow has a review stage that precedes every implementation stage
- **THEN** a card at that stage is in the specify column

#### Scenario: Merged while closing
- **WHEN** a card's merge request is merged and its Close stage still runs
- **THEN** the card is in the archived column

#### Scenario: Platform-managed stage
- **WHEN** the card's current stage has the platform-managed origin
- **THEN** the card shows "platform-managed" instead of a native step

### Requirement: Views are stamped projections
Every board, task detail, and inbox view SHALL carry the time of its state and the event stream position it reflects, SHALL fail as unavailable rather than return partial data, and SHALL never be the authority for a command, which rechecks the current state.

#### Scenario: Source unavailable
- **WHEN** one source of the board cannot be read
- **THEN** the query fails with `unavailable` and returns no cards

### Requirement: Needs you items answered once by their source
Every item that waits on a person SHALL be an inbox item of a registered source, of kind permission-request, input-request, spec-approval, escalation, or reconciliation; an answer SHALL go to the owning source, which consumes it once and rejects a duplicate or an answer for a newer attempt generation, and the inbox SHALL never answer an item itself.

#### Scenario: Duplicate answer
- **WHEN** a second answer arrives for a resolved item
- **THEN** it fails with `conflict` and changes nothing

### Requirement: Standing approval rules recorded and audited
A standing rule SHALL record its author, scope as a normalized operation, policy revision, and origin; only an active rule whose policy revision equals the current policy revision of the request's run SHALL answer a request, a request the harness port cannot classify SHALL match no rule, and recording, revoking, and each use SHALL be audited.

#### Scenario: Unclassified request
- **WHEN** a native permission request cannot be classified into a normalized operation
- **THEN** no standing rule answers it, and it waits in the inbox

#### Scenario: Use after a revocation
- **WHEN** a rule's revocation is serialized before a use of the rule for a request
- **THEN** the use answers nothing and records no use

#### Scenario: Push in a run at another revision
- **WHEN** auto-merge is on and a push request comes from an unclosed run whose current policy revision differs from the project's current one
- **THEN** the auto-merge rule recorded at that run's revision answers it

#### Scenario: Other policy revision
- **WHEN** a rule's policy revision differs from the current policy revision of the request's run
- **THEN** the rule does not answer the request

### Requirement: Auto-merge setting and serial merge queue
The auto-merge setting SHALL be on by default and changed by compare-and-set, recording or revoking the push standing rule in the same transaction; the merge queue SHALL keep at most one request per target branch merging or resolving a conflict, with a conflict budget of three attempts, and the target branch SHALL be a field of each request.

#### Scenario: Auto-merge turned off
- **WHEN** a project-maintainer turns auto-merge off
- **THEN** the push standing rule is revoked in the same transaction and queued, escalated, and returned-to-specify requests are withdrawn

### Requirement: Untrusted intake and write-back data
`IntakeSource` and `WriteBack` SHALL exchange plain data that the Integrations module parses and bounds, every write-back call SHALL carry an idempotency key, and a write-back failure SHALL be retried and never block a gate or a merge.

#### Scenario: Over-long title
- **WHEN** a source returns a title longer than 200 characters
- **THEN** the import fails as `invalid` and no task is created

### Requirement: Product writers invalidate launches
Every transaction that changes a spec gate's state (a decision, making a passed gate stale, reopening), a new artifact revision, which also updates the run's current revision, and a change of the run's policy revision SHALL each, in its own SERIALIZABLE transaction, read the live grants of its predicate, an empty read included, revoke each grant whose compared value it changes, and write a cancellation command per affected attempt (/docs/contracts/launch-authorization.md section 5).

#### Scenario: Return to Specify during a running attempt
- **WHEN** a return to Specify records a new spec revision that outdates a passed spec gate while an attempt of the task runs under a grant that relies on the gate
- **THEN** the transaction that records the revision makes the gate stale, revokes the grant, and writes the attempt's cancellation command

#### Scenario: Return to Specify without a new revision
- **WHEN** a return to Specify records no new revision while an attempt of the task runs
- **THEN** the task's active attempt is cancelled by assignment and its grants are revoked with `attempt-not-launchable`

#### Scenario: Spec gate made stale concurrently with an authorization
- **WHEN** a passed spec gate is made stale concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or the grant is revoked and its cancellation written, never neither

#### Scenario: Spec gate approved concurrently with an authorization
- **WHEN** a pending spec gate is approved concurrently with a launch authorization that relies on it
- **THEN** either the launch is rejected with `gate-not-passed`, or it may be granted and the approval revokes no grant

### Requirement: Revoked attempt ends before re-admission
After a product writer revokes a grant, the task SHALL NOT be dispatched again until the revoked attempt has ended, by exit, not started, or reconciliation, and a writer of admissions has re-admitted the task at the next ownership generation.

#### Scenario: Dispatch while the revoked attempt runs
- **WHEN** a product writer revoked a task's grant and the revoked attempt is still active
- **THEN** the task is not dispatched again and its re-admission is refused

### Requirement: Standing rule use checked in one transaction
A standing rule use SHALL read, in one SERIALIZABLE transaction with the answer and the use record, the rule, the run's current policy revision, and the request's attempt and task, and SHALL answer only if the rule may be used, the attempt is neither cancelled nor terminal, the task's ownership generation equals that of the request's assignment, its admission is the one the assignment names, and the request's attempt generation is current.

#### Scenario: Use for a cancelled attempt
- **WHEN** a launch revocation that cancels the request's attempt is serialized before the use
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after a policy revision change
- **WHEN** a change of the run's policy revision is serialized before a use of a rule of the older revision
- **THEN** the rule answers nothing and no use is recorded

#### Scenario: Use after an ownership change
- **WHEN** an ownership change of the request's task is serialized before the use
- **THEN** the rule answers nothing and no use is recorded

### Requirement: One card per root run
The board SHALL show one card per root workflow run, keyed by its run identifier, and SHALL treat each G2 task of the run, a re-admitted task, and each delegated child task of its lineage as part of that card; the task detail SHALL list every such task with its admission, and inbox counts and merge requests SHALL name the card by its run.

#### Scenario: Run with several tasks
- **WHEN** a run holds tasks admitted to two stages and a delegated child task in a child run
- **THEN** the board shows one card for the run, and its detail lists all three tasks

#### Scenario: Child task item
- **WHEN** an inbox item concerns a delegated child task
- **THEN** it counts toward the card of the child's lineage root run

### Requirement: Completed workflow projection
When every stage of a card's run has completed, the card SHALL show as its current stage its Close stage, the last stage with the closure obligation in graph order; a merged card SHALL stay in archived even when a stage is started again, and an unmerged card SHALL move back to the column of a completed stage started again when that stage is the first not completed.

#### Scenario: Close completed
- **WHEN** every stage of a merged card's run has completed
- **THEN** the card is in archived and shows the Close stage as completed

#### Scenario: Closure stage not last
- **WHEN** every stage has completed in a graph whose closure stage precedes another stage in graph order
- **THEN** the card shows that closure stage as its current stage

#### Scenario: Rework before merge
- **WHEN** a completed stage of an unmerged card is started again and is the first stage not completed
- **THEN** the card moves to that stage's column

### Requirement: Merge readiness by passed stages
A card SHALL be merge-ready only when every stage other than its Close stage and the stages depending on it has completed and has at least one gate with every gate passed at the current head; without a merge request or after a withdrawal, the merge gate SHALL follow the current readiness, showing not-ready when not merge-ready, and otherwise withdrawn, awaiting-manual-merge, or ready as the contract maps them.

#### Scenario: Stage without a gate
- **WHEN** a stage other than the Close stage that does not depend on it has no gate
- **THEN** the card is not-ready and no merge request is enqueued

#### Scenario: Gate stale after a manual-merge withdrawal
- **WHEN** a request was withdrawn for manual-merge and a gate of a pre-merge stage then goes stale
- **THEN** the card shows not-ready, not awaiting-manual-merge

#### Scenario: Gate stale after an auto-merge-off withdrawal
- **WHEN** a request was withdrawn for auto-merge-off and a gate of a pre-merge stage then goes stale
- **THEN** the card shows not-ready until the stage passes again

#### Scenario: Ready before enqueue
- **WHEN** a card is merge-ready with auto-merge on and its request is not enqueued yet
- **THEN** the card shows ready

#### Scenario: Cancelled with all stages passed
- **WHEN** a merge-ready card's request for the current head was withdrawn for cancelled
- **THEN** the card shows withdrawn

#### Scenario: Stage after the closure stage in graph order
- **WHEN** a stage that follows the Close stage in graph order and does not depend on it has not passed
- **THEN** the card is not-ready

#### Scenario: Re-queue at the same head
- **WHEN** a merge-ready card with auto-merge on is enqueued at the head of a request withdrawn for gate-not-passed or auto-merge-off
- **THEN** that request moves back to queued with its conflict attempts kept

#### Scenario: Chosen withdrawal at the same head
- **WHEN** a card is enqueued at the head of a request withdrawn for cancelled, manual-merge, or maintainer-withdrew
- **THEN** the existing request is returned and stays withdrawn

### Requirement: Placement obstacle projection
The card and its detail SHALL show why a task is not placed as the view's own value with a reason, a disposition waiting or rejected, a source, and the time it was observed, built from the fleet read, an automatic retry backing off, a worker refusal, and the task's placement outcome record, and SHALL show a waiting obstacle only for a task that waits for placement and a rejected one only at the ownership generation its attempt ended in; a standing reason SHALL never be shown.

#### Scenario: Placed, not yet launched
- **WHEN** a task's active attempt has an assignment with a held reservation and no execution yet, and the fleet is full
- **THEN** the task shows no placement obstacle

#### Scenario: Record of an earlier attempt
- **WHEN** a task's waiting record names an attempt other than its active attempt
- **THEN** the record is not shown

#### Scenario: Cancelled while waiting
- **WHEN** a task with a waiting placement outcome record is cancelled
- **THEN** the task shows no placement obstacle

#### Scenario: Empty fleet
- **WHEN** the view's fleet read finds no worker online and the task has no record
- **THEN** the task shows no-candidate from the fleet, observed at the view's time

#### Scenario: Retry backing off
- **WHEN** an automatic retry of the task has no assignment and no newer observation exists
- **THEN** the task shows the waiting obstacle retry-backoff from the automatic retry with its retry number

#### Scenario: Newer scheduler record
- **WHEN** a waiting task's scheduler record is newer than its worker refusal or the end of the attempt its retry retries
- **THEN** the task shows the scheduler record

#### Scenario: Rejected in an empty fleet
- **WHEN** a rejected task has no active attempt and the fleet read finds no worker
- **THEN** the task shows the rejection, not a fleet obstacle

#### Scenario: Re-admitted after a rejection
- **WHEN** a rejected task is re-admitted and has no new attempt yet
- **THEN** the task shows no obstacle

### Requirement: Task end without merge
A task whose last attempt ended without an automatic retry and that is not active SHALL show a task end of kind cancelled, rejected, retries-exhausted, or uncertain-exit with the attempt's outcome, a clean exit, exit code 0 after a proven start, SHALL not be a task end, and a re-admission of the task SHALL clear its end.

#### Scenario: Unknown exit
- **WHEN** a task's attempt exits with an unknown status
- **THEN** the task shows the end uncertain-exit with that outcome

#### Scenario: Retries spent after not started
- **WHEN** a task has used its automatic retries and its last attempt ended not-started
- **THEN** the task shows the end retries-exhausted

#### Scenario: Re-admission
- **WHEN** a task with an end is re-admitted at its next ownership generation
- **THEN** it shows no end and shows its new admission

### Requirement: Reconciliation in the inbox
Each unknown execution, including one a worker revocation made uncertain, SHALL be a reconciliation item of its card that a project-maintainer resolves with evidence only while the execution is unknown at the subject's ownership generation; each unrecorded process SHALL be an item of the installation-scoped inbox that only an installation-owner answers.

#### Scenario: Terminal fact first
- **WHEN** a terminal fact ends an unknown execution before its reconciliation item is answered
- **THEN** the item is closed and a later resolve answer fails with `precondition-failed`

#### Scenario: Unrecorded process
- **WHEN** a worker reports a process without a journal record
- **THEN** the item appears only in the installation-scoped inbox and a project-maintainer cannot answer it
