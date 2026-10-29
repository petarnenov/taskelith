## ADDED Requirements

### Requirement: Slot credential delivery service
The control plane SHALL check a worker's slot credential fetch in one serializable transaction in the order of the account pool contract section 7.3, a first delivery to an authorized execution also needing an unexpired, unrevoked grant, and SHALL reveal the credential only after that transaction commits; a failing check SHALL reveal nothing and answer its typed reason, and a failed reveal SHALL answer a local message that names only the slot.

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

#### Scenario: Failed reveal
- **WHEN** the credential store throws or returns a failure whose text holds the credential
- **THEN** the answer is `unavailable` or `internal` with a local message and the slot only

### Requirement: Slot credential delivery record
Each delivery SHALL be recorded, in its check transaction and before the reveal, per task, execution, and slot with the attempt, worker, credential version, first and latest delivery times, and count, and SHALL never hold the credential; no database row, outbox entry, or broker message SHALL hold a delivered credential; two racing first fetches SHALL both be recorded by retry.

#### Scenario: Record before the reveal
- **WHEN** the reveal fails after the check transaction committed, or that transaction does not commit
- **THEN** the record stays and a retry delivers and counts again, or nothing is revealed or recorded

#### Scenario: Racing first fetches
- **WHEN** two first fetches for one execution and slot race on PostgreSQL
- **THEN** both deliver one version, the record counts two deliveries, and the second to commit retried

#### Scenario: No credential at rest
- **WHEN** a credential was delivered and the outbox was published to the broker
- **THEN** no database table and no stream message holds the credential text

### Requirement: Slot credential delivery over TLS only
The control plane SHALL answer `fetchSlotCredential` on a connection without TLS with an internal failure before it reads the bearer, and every answer SHALL carry `Cache-Control: no-store`; the worker's client SHALL send no fetch to a base URL that is not HTTPS SHALL use no delivery whose schema fails or that names another execution or slot, and SHALL repeat no server text in a refusal or failure.

#### Scenario: Plain HTTP request
- **WHEN** a worker sends `fetchSlotCredential` over plain HTTP
- **THEN** the answer is `500` and no delivery is made

#### Scenario: Browser endpoint
- **WHEN** a request for `fetchSlotCredential` reaches the browser endpoint
- **THEN** no route answers it, the answer is `404`, and no delivery is made

#### Scenario: Delivery for another execution
- **WHEN** the client receives a delivery that names another execution or slot than its request
- **THEN** it returns a failure that holds no credential

#### Scenario: Server text in a refusal or failure
- **WHEN** an error answer holds any text in its message or details, or a reason outside the contract's list
- **THEN** the client's refusal or failure has a local message, the status, and a listed reason only

### Requirement: Run slot credential port on the worker
The worker SHALL obtain a run's slot credential only through `RunSlotCredentials`, which fetches it with the current recovery epoch, holds it only in memory for that run until the host forgets the run, its ownership generation, or its recovery epoch, or a call moves past it, uses no delivery that arrives after that, gives it to no other execution, and logs a refusal or failure by identifiers and reason only; no string, JSON, or inspection form of a held credential SHALL show its text.

#### Scenario: Held per run
- **WHEN** the harness host obtains a run's credential twice and then forgets the run
- **THEN** the first call fetches it, the second returns the held one, and the next call after forgetting fetches again

#### Scenario: New recovery epoch
- **WHEN** the harness host forgets a recovery epoch, or a call reads a new one, while deliveries are held
- **THEN** the deliveries of the old epoch are forgotten at once, and the next call fetches with the current epoch

#### Scenario: New ownership generation
- **WHEN** the harness host forgets an attempt's ownership generation, or a call names a later one
- **THEN** the attempt's deliveries of the old generation are forgotten and the next call fetches again

#### Scenario: Call of an older generation
- **WHEN** a call names an older ownership generation than one held or fetched for its attempt
- **THEN** the call fails with `conflict`, and the later generation's delivery stays held or in flight

#### Scenario: Delivery after the end
- **WHEN** the run, its ownership generation, or its recovery epoch ends while its fetch is in flight
- **THEN** the arriving credential is neither returned nor held, the call fails with `conflict`, and the next call fetches again

#### Scenario: Refusal not held
- **WHEN** a fetch is refused or fails
- **THEN** nothing is held, and the log names the execution, attempt, slot, and reason or code only

## MODIFIED Requirements

### Requirement: Confidential credential transport
A slot credential SHALL be delivered only in the control plane's API response to the worker and only over the TLS of G3 item 26, to a remote worker and to a worker co-located with the control plane on its host alike, never over plain HTTP and never in a broker message.

#### Scenario: Remote worker before TLS
- **WHEN** a remote worker launches an attempt and the installation has no TLS for the worker's connection
- **THEN** no slot credential is sent to it

#### Scenario: Co-located worker without TLS
- **WHEN** a worker co-located with the control plane on its host fetches a slot credential over plain HTTP
- **THEN** no slot credential is sent to it
