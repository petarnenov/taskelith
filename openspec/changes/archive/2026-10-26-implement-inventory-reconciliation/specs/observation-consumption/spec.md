## MODIFIED Requirements

### Requirement: One transaction per observation
The control plane SHALL apply each observation in one SERIALIZABLE transaction that records its inbox entry, its sequence in the producer cursor of its `(workerId, journalId)`, first contact, its effect, and any confirmation, and SHALL acknowledge it only after that transaction committed. An observation whose identity the inbox already holds SHALL NOT apply its effect again: at a sequence its journal applied, it SHALL change nothing but a confirmation sent again.

#### Scenario: Redelivered observation
- **WHEN** an applied acceptance is delivered again under a new broker message identity
- **THEN** it is a duplicate, the assignment and the cursor are unchanged, and the outbox gains only a confirmation of the current prefix

#### Scenario: Store failure
- **WHEN** the store fails while an exit is applied
- **THEN** nothing of it is committed, and the message is delivered again

### Requirement: Authenticated producer
An observation SHALL be applied only when its subject names its `metadata.workerId`, that worker is enrolled and not revoked, and its `journalId` is the worker's enrolled journal and not retired, or a journal never seen from that worker that replaces the enrolled one as a new journal incarnation; otherwise it SHALL NOT be applied.

#### Scenario: Worker in the body differs from the subject
- **WHEN** an observation on worker A's subject names worker B
- **THEN** it is not applied, and no contact is recorded for either worker

#### Scenario: Unknown journal
- **WHEN** an enrolled worker's observation names a journal other than its enrolled one that the control plane saw from that worker before
- **THEN** it is not applied, and its sequence is not recorded

### Requirement: Observations left to later changes
An authenticated observation of a type that a later change consumes (`execution.started`, `execution.launch.rejected`) and an observation of a revoked worker SHALL NOT be applied, and its sequence SHALL stay unrecorded; an authenticated one SHALL still record first contact.

#### Scenario: Start before 21d
- **WHEN** a worker's `execution.started` is delivered
- **THEN** the worker becomes reachable, the execution is unchanged, the cursor does not record its sequence, and after five deliveries it is in quarantine
