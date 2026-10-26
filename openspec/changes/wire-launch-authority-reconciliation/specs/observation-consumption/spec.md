## MODIFIED Requirements

### Requirement: Authenticated producer
An observation SHALL be applied only when its subject names its `metadata.workerId`, that worker is enrolled, and its `journalId` is the worker's enrolled journal and not retired, or, for a worker that is not revoked, a journal never seen from that worker that replaces the enrolled one as a new journal incarnation; otherwise it SHALL NOT be applied. An observation of a revoked worker SHALL be applied under the requirement for observations of a revoked worker in `launch-reconciliation`.

#### Scenario: Worker in the body differs from the subject
- **WHEN** an observation on worker A's subject names worker B
- **THEN** it is not applied, and no contact is recorded for either worker

#### Scenario: Unknown journal
- **WHEN** an enrolled worker's observation names a journal other than its enrolled one that the control plane saw from that worker before
- **THEN** it is not applied, and its sequence is not recorded

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

## REMOVED Requirements

### Requirement: Observations left to later changes
**Reason**: 21d consumes `execution.started`, `execution.launch.rejected`, and the observations of a revoked worker.
**Migration**: See the `launch-reconciliation` capability.
