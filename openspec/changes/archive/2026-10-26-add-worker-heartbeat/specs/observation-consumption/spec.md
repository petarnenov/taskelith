## MODIFIED Requirements

### Requirement: One transaction per observation
The control plane SHALL apply each observation in one SERIALIZABLE transaction that records its inbox entry, its sequence in the producer cursor of its `(workerId, journalId)`, first contact, its effect, and any confirmation, and SHALL acknowledge it only after that transaction committed. An observation whose identity the inbox already holds SHALL NOT apply its effect again: at a sequence its journal applied, it SHALL change nothing but the worker's contact and a confirmation sent again.

#### Scenario: Redelivered observation
- **WHEN** an applied acceptance is delivered again under a new broker message identity
- **THEN** it is a duplicate, the assignment and the cursor are unchanged, and the outbox gains only a confirmation of the current prefix

#### Scenario: Store failure
- **WHEN** the store fails while an exit is applied
- **THEN** nothing of it is committed, and the message is delivered again

### Requirement: Confirmation sent again
A duplicate from an authenticated producer at or below `confirmedThrough` SHALL append a confirmation of the current `confirmedThrough` again, under a new event identity and without any other effect than recording the worker's contact, because the worker may have lost the earlier one.

#### Scenario: Confirmation lost
- **WHEN** the confirmation through 1 expired from the stream unread, and the worker republishes its applied observation at sequence 1
- **THEN** it is a duplicate, the cursor is unchanged, and a confirmation through the current prefix is appended again under a new event identity

### Requirement: First contact
An authenticated observation SHALL mark its worker reachable and SHALL move the worker's last contact to the database time, never backward. A duplicate that the inbox already holds SHALL record contact too.

#### Scenario: New worker
- **WHEN** a newly enrolled worker's first capacity declaration is applied
- **THEN** the worker is reachable and eligible for placement

#### Scenario: Duplicate after lost contact
- **WHEN** a worker marked unreachable republishes an observation that was already applied
- **THEN** it is a duplicate, and the worker is reachable again
