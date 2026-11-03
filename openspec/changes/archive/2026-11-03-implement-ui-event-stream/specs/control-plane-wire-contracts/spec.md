## MODIFIED Requirements

### Requirement: Event position after commit
An event position SHALL exist only after the change it reports has committed, so that no read or event shows an uncommitted native request: positions SHALL come from one installation-wide sequence, never reused, each assigned only once its inserting transaction and every older transaction have ended (the numbering horizon). Positions SHALL never decrease for a reader, and an event concurrent with a role change MAY precede that stream's `stream-ended`.

#### Scenario: Aborted request recording
- **WHEN** the transaction that records a native request aborts
- **THEN** no event and no read shows the request, and no position names it

#### Scenario: Order across transactions
- **WHEN** a transaction inserts its event after another transaction's commit
- **THEN** its event has the higher position and is sent after the other

#### Scenario: Event concurrent with a role revocation
- **WHEN** a transaction inserts a project event, a revocation of a reader's project role commits, and then the first transaction commits
- **THEN** the reader's stream sends the event and then `stream-ended` `role-changed`
