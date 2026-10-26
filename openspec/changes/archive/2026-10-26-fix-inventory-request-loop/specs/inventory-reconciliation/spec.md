## MODIFIED Requirements

### Requirement: Inventory request
The control plane SHALL request a worker's inventory by appending `worker.inventory.requested` with a fresh random `requestId` to the worker's command subject, and SHALL keep only the latest request of each worker as its current one. A report that carries a `requestId` SHALL NOT request inventory, even when that request is no longer current. The outbox publisher SHALL send an inventory request without a `Nats-Msg-Id` header.

#### Scenario: Unsolicited report
- **WHEN** a worker's report arrives without a `requestId`
- **THEN** one inventory request with a new `requestId` is appended to the worker's command subject, and its bound lists the highest sequence applied from each of the worker's journals

#### Scenario: Fresh snapshot omits an undelivered offer
- **WHEN** a fresh snapshot omits an unfinished assignment whose acceptance was never applied and for which no grant is recorded
- **THEN** the assignment's offer is re-sent and no new inventory request is appended

#### Scenario: Newer request
- **WHEN** a second request is sent to a worker before the first is answered
- **THEN** only the second is the worker's current request, and a snapshot answering the first is not fresh

#### Scenario: Answer to a superseded request
- **WHEN** a snapshot answers a request that is no longer the worker's current one
- **THEN** it is not fresh, and no inventory request is appended

#### Scenario: Overlapping requests settle
- **WHEN** two requests are outstanding for a worker, and the worker answers each in turn with a growing `snapshot`
- **THEN** no further inventory request is appended

#### Scenario: Request published
- **WHEN** the outbox publisher sends an inventory request
- **THEN** the publication carries no `Nats-Msg-Id` header

### Requirement: Omitted assignments
An omitted assignment whose acceptance was applied from the snapshot's journal at a sequence up to `throughSequence`, or from an earlier journal of the worker, SHALL be reconciled as having lost its local history. Any other omitted assignment SHALL only be re-sent while no grant was ever recorded for its attempt, and only an unsolicited snapshot, one without a `requestId`, that omits one SHALL request the worker's inventory.

#### Scenario: Restored journal lost an acknowledged offer
- **WHEN** a worker's journal restored from an older copy lost only an acknowledged offer whose acceptance was applied, no grant exists, and the snapshot omits the assignment
- **THEN** the offer is re-sent with its `commandId` unchanged

#### Scenario: Omitted assignment with a grant
- **WHEN** a snapshot omits an assignment whose acceptance was applied from its journal at a sequence up to `throughSequence`, and its execution holds a seeded grant
- **THEN** the execution records `local-history-lost` and stays in its state

#### Scenario: Offer not yet received
- **WHEN** an unsolicited snapshot omits an offered assignment with no applied acceptance and no grant
- **THEN** the offer is re-sent, an inventory request is appended, and no execution changes

#### Scenario: Superseded answer omits an offer
- **WHEN** a snapshot answering a request that is no longer current omits an offered assignment with no applied acceptance and no grant
- **THEN** the offer is re-sent, and no inventory request is appended

#### Scenario: Omitted offer under overlapping requests
- **WHEN** two requests are outstanding, and the worker answers each in turn with a growing `snapshot` that omits an offered assignment with no applied acceptance and no grant
- **THEN** each answer re-sends the offer, and no further inventory request is appended
