## ADDED Requirements

### Requirement: One card per root run
The board SHALL show one card per root workflow run, keyed by its run identifier, and SHALL treat each G2 task of the run, a re-admitted task, and each delegated child task of its lineage as part of that card; the task detail SHALL list every such task with its admission, and inbox counts and merge requests SHALL name the card by its run.

#### Scenario: Run with several tasks
- **WHEN** a run holds tasks admitted to two stages and a delegated child task in a child run
- **THEN** the board shows one card for the run, and its detail lists all three tasks

#### Scenario: Child task item
- **WHEN** an inbox item concerns a delegated child task
- **THEN** it counts toward the card of the child's lineage root run

### Requirement: Completed workflow projection
When every stage of a card's run has completed, the card SHALL show its completed Close stage as its current stage; a merged card SHALL stay in archived even when a stage is started again, and an unmerged card whose completed stage is started again SHALL move back to that stage's column.

#### Scenario: Close completed
- **WHEN** every stage of a merged card's run has completed
- **THEN** the card is in archived and shows the Close stage as completed

#### Scenario: Rework before merge
- **WHEN** a completed stage of an unmerged card is started again and is the first stage not completed
- **THEN** the card moves to that stage's column

### Requirement: Merge readiness by passed stages
A card SHALL be merge-ready only when every stage before its Close stage has completed and has at least one gate with every gate passed at the current head; without a merge request or after a withdrawal, the merge gate SHALL follow the current readiness, showing not-ready when not merge-ready, and otherwise withdrawn, awaiting-manual-merge, or ready as the contract maps them.

#### Scenario: Stage without a gate
- **WHEN** a stage before the Close stage has no gate
- **THEN** the card is not-ready and no merge request is enqueued

#### Scenario: Gate stale after a manual-merge withdrawal
- **WHEN** a request was withdrawn for manual-merge and a gate before the Close stage then goes stale
- **THEN** the card shows not-ready, not awaiting-manual-merge

#### Scenario: Gate stale after an auto-merge-off withdrawal
- **WHEN** a request was withdrawn for auto-merge-off and a gate before the Close stage then goes stale
- **THEN** the card shows not-ready until the stage passes again

#### Scenario: Ready before enqueue
- **WHEN** a card is merge-ready with auto-merge on and its request is not enqueued yet
- **THEN** the card shows ready

#### Scenario: Cancelled with all stages passed
- **WHEN** a merge-ready card's request for the current head was withdrawn for cancelled
- **THEN** the card shows withdrawn

### Requirement: Placement obstacle projection
The card and its detail SHALL show why a task is not placed as the view's own value with a reason, a disposition waiting or rejected, a source, and the time it was observed, built from the fleet read, an automatic retry backing off, a worker refusal, and the task's placement outcome record, and SHALL show a record only while the task's state still matches it; a standing reason SHALL never be shown.

#### Scenario: Cancelled while waiting
- **WHEN** a task with a waiting placement outcome record is cancelled
- **THEN** the task shows no placement obstacle

#### Scenario: Empty fleet
- **WHEN** the view's fleet read finds no worker online and the task has no record
- **THEN** the task shows no-candidate from the fleet, observed at the view's time

#### Scenario: Retry backing off
- **WHEN** an automatic retry of the task is not yet placed
- **THEN** the task shows a waiting obstacle from the automatic retry with its retry number

### Requirement: Task end without merge
A task whose last attempt ended without an automatic retry and that is not active SHALL show a task end of kind cancelled, rejected, retries-exhausted, or uncertain-exit with the attempt's outcome, a clean exit SHALL not be a task end, and a re-admission of the task SHALL clear its end.

#### Scenario: Unknown exit
- **WHEN** a task's attempt exits with an unknown status
- **THEN** the task shows the end uncertain-exit with that outcome

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

## MODIFIED Requirements

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

#### Scenario: Other policy revision
- **WHEN** a rule's policy revision differs from the current policy revision of the request's run
- **THEN** the rule does not answer the request
