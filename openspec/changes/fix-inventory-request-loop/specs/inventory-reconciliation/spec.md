## MODIFIED Requirements

### Requirement: Inventory request
The control plane SHALL request a worker's inventory by appending `worker.inventory.requested` with a fresh random `requestId` to the worker's command subject, and SHALL keep only the latest request of each worker as its current one. A report that carries a `requestId` SHALL NOT by itself request inventory, even when that request is no longer current. The outbox publisher SHALL send an inventory request without a `Nats-Msg-Id` header.

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
- **THEN** it is not fresh, and no inventory request is appended, except as the requirement "Omitted assignments" states

#### Scenario: Overlapping requests settle
- **WHEN** two requests are outstanding for a worker with no unfinished assignment, and the worker answers each in turn with a growing `snapshot`
- **THEN** no further inventory request is appended

#### Scenario: Request published
- **WHEN** the outbox publisher sends an inventory request
- **THEN** the publication carries no `Nats-Msg-Id` header
