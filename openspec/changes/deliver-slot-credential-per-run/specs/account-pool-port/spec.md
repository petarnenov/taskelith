## ADDED Requirements

### Requirement: Slot credential delivery service
The control plane SHALL check a worker's slot credential fetch in one serializable transaction in the order of the account pool contract section 7.3, a first delivery to an authorized execution also needing an unexpired, unrevoked grant, and SHALL reveal the credential only after that transaction commits; a failing check SHALL reveal nothing and answer its typed reason.

#### Scenario: First delivery after the launch authorization
- **WHEN** the worker that holds an attempt's reservation fetches the slot credential for its authorized execution with a live grant
- **THEN** the credential of the slot's current version is delivered once the check transaction commits

#### Scenario: Re-delivery after the grant expired
- **WHEN** an execution that already had a delivery fetches the credential again after its grant expired
- **THEN** the same version is delivered without a new launch authorization

#### Scenario: Released reservation
- **WHEN** the attempt's reservation was released or does not name the slot
- **THEN** the fetch is refused with `capacity-not-reserved` and nothing is revealed

#### Scenario: First fetch after the grant expired
- **WHEN** an authorized execution without an earlier delivery fetches the credential after its grant expired
- **THEN** the fetch is refused with `execution-conflict` and nothing is revealed or recorded

### Requirement: Slot credential delivery record
Each delivery SHALL be recorded, in its check transaction and before the reveal, per task, execution, and slot with the attempt, worker, credential version, first and latest delivery times, and count, and SHALL never hold the credential; no database row, outbox entry, or broker message SHALL hold a delivered credential; two racing first fetches SHALL both be recorded by retry.

#### Scenario: Racing first fetches
- **WHEN** two first fetches for one execution and slot race on PostgreSQL
- **THEN** both deliver one version, the record counts two deliveries, and the second to commit retried

#### Scenario: No credential at rest
- **WHEN** a credential was delivered and the outbox was published to the broker
- **THEN** no database table and no stream message holds the credential text

### Requirement: Slot credential delivery over TLS only
The control plane SHALL answer `fetchSlotCredential` on a connection without TLS with an internal failure before it reads the bearer, and every answer SHALL carry `Cache-Control: no-store`; the worker's client SHALL send no fetch to a base URL that is not HTTPS and SHALL use no delivery whose schema fails or that names another execution or slot.

#### Scenario: Plain HTTP request
- **WHEN** a worker sends `fetchSlotCredential` over plain HTTP
- **THEN** the answer is `500` and no delivery is made

#### Scenario: Delivery for another execution
- **WHEN** the client receives a delivery that names another execution or slot than its request
- **THEN** it returns a failure that holds no credential

### Requirement: Run slot credential port on the worker
The worker SHALL obtain a run's slot credential only through `RunSlotCredentials`, which fetches it with the current recovery epoch, holds it only in memory for that run until the harness host forgets the run, gives it to no other execution, and logs a refusal or failure by identifiers and reason only; no string, JSON, or inspection form of a held credential SHALL show its text.

#### Scenario: Held per run
- **WHEN** the harness host obtains a run's credential twice and then forgets the run
- **THEN** the first call fetches it, the second returns the held one, and the next call after forgetting fetches again

#### Scenario: Refusal not held
- **WHEN** a fetch is refused or fails
- **THEN** nothing is held, and the log names the execution, attempt, slot, and reason or code only
