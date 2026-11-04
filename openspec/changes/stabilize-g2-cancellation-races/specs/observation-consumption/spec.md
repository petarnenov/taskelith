## MODIFIED Requirements

### Requirement: One transaction per observation
The control plane SHALL apply each observation in one SERIALIZABLE transaction that records its inbox entry, its sequence in the producer cursor of its `(workerId, journalId)`, its effect, and any confirmation, and SHALL acknowledge it only after that transaction committed. An observation whose identity the inbox already holds SHALL NOT apply its effect again: at a sequence its journal applied, it SHALL change nothing but a confirmation sent again and the worker's contact.

#### Scenario: Redelivered observation
- **WHEN** an applied acceptance is delivered again under a new broker message identity
- **THEN** it is a duplicate, the assignment and the cursor are unchanged, and the outbox gains only a confirmation of the current prefix

#### Scenario: Store failure
- **WHEN** the store fails while an exit is applied
- **THEN** nothing of it is committed, and the message is delivered again

### Requirement: First contact
An authenticated observation SHALL record contact in its own transaction, after the observation's transaction when that commits: the worker becomes reachable and its last contact moves to the database time, never backward, only while it is enrolled, not revoked, and under its enrolled journal, not retired. A failed contact of a consumed observation SHALL be logged and SHALL NOT fail or redeliver it. A duplicate SHALL record contact; a revoked worker's observation SHALL record none.

#### Scenario: New worker
- **WHEN** a newly enrolled worker's first capacity declaration is applied, and its contact is recorded
- **THEN** the worker is reachable and eligible for placement

#### Scenario: Duplicate after lost contact
- **WHEN** a worker marked unreachable republishes an observation that was already applied, and its contact is recorded
- **THEN** it is a duplicate, and the worker is reachable again

#### Scenario: Worker row held by a heartbeat
- **WHEN** a heartbeat's transaction holds the worker's row while an observation whose effect leaves that row unchanged is applied
- **THEN** the observation commits before the row is free, and its contact commits after the heartbeat

#### Scenario: Contact fails after the commit
- **WHEN** an observation committed and its contact's transaction fails
- **THEN** the observation stays applied and acknowledged, and the failure is logged as `execution.observation.contact-unrecorded`

#### Scenario: Journal retired before the contact
- **WHEN** the worker's journal is retired after an observation committed and before its contact
- **THEN** no contact is recorded, and the worker stays unreachable

#### Scenario: Worker revoked before the contact
- **WHEN** a reachable worker is revoked after an observation committed and before its contact
- **THEN** no contact is recorded: its last contact is unchanged, and it is not eligible for placement

#### Scenario: Newer stored contact
- **WHEN** an observation is applied while the worker's stored last contact is later than the database time
- **THEN** its contact keeps that later last contact
