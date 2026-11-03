## ADDED Requirements

### Requirement: Inbox answers served
The control plane SHALL serve `answerInboxItem` and `answerInstallationInboxItem`, checking the operation's role and then the item's `answerableBy` role through `Access` before the body, and SHALL check the answer's key, call the item's source, and record the key with a keyed digest of the unredacted answer and its responder in one `SERIALIZABLE` transaction.

#### Scenario: Two concurrent identical answers
- **WHEN** two requests with the same key and answer reach an open item at once
- **THEN** one answer and one key are recorded, and both requests return the same resolved item

#### Scenario: Two concurrent different answers
- **WHEN** two different answers reach an open item at once
- **THEN** one commits, and the other answers 409 `idempotency-key-reused` with the same key or `already-answered` with another

#### Scenario: Another principal repeats a key
- **WHEN** another principal repeats the key of a resolved item with the same answer
- **THEN** the answer is 409 `idempotency-key-reused`

#### Scenario: A replay without the role or scope
- **WHEN** a principal who answered an item repeats its key and answer after losing the item's role, or through another project's inbox
- **THEN** the answer is refused 403 or 404 as a stranger's is, before any key is read, and never returns the stored outcome

#### Scenario: A refused answer
- **WHEN** a source refuses an answer with 422
- **THEN** no key is recorded and nothing else changes

### Requirement: Reconciliation answers applied
Resolving an unknown execution SHALL end its attempt as operator-resolved and release its held reservation, and every reconciliation answer SHALL record the resolved item and publish `inbox-item-changed`, in the answer's transaction, so the item leaves the inbox and its counts and its card is touched.

#### Scenario: An unknown execution is resolved
- **WHEN** a project-maintainer answers an unknown execution's item with `resolve-execution`
- **THEN** its attempt is operator-resolved, its reservation released, its card touched, and the inbox and its counts no longer hold it

#### Scenario: A terminal fact came first
- **WHEN** an unknown execution's terminal fact arrived before the answer
- **THEN** the item is closed, and the answer is 422 `item-closed`

### Requirement: Reconciliation item events
The card projector SHALL publish `inbox-item-changed` for a reconciliation item when it opens or closes, or otherwise changes, once per change, in the projection's transaction, comparing it with its last published projection; a resolved item SHALL be published by its answer alone. A closed item SHALL keep the generation of its execution's grant and the time it first closed.

#### Scenario: An unknown execution opens and closes
- **WHEN** a task's execution is reported uncertain, and later its terminal fact arrives
- **THEN** the project's stream gets the item open once, then closed once

#### Scenario: An unrecorded process
- **WHEN** a worker's unrecorded process is recorded
- **THEN** the installation stream gets its item open once

#### Scenario: A closed item's task changes
- **WHEN** a closed item's task changes or is re-admitted later
- **THEN** the item keeps its subject's generation and its closing time
