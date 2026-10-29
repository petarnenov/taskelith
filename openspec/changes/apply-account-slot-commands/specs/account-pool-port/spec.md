## ADDED Requirements

### Requirement: Slot commands besides adding
The pool SHALL update a slot's allowed projects or concurrency limit, revoke, reinstate, remove, and rotate a slot by compare-and-set in `SERIALIZABLE` transactions. A repeat that changes nothing SHALL return the slot at its current revision; an update of a revoked slot or a rotation of an active one SHALL fail with `conflict`; a command on a removed or unknown slot SHALL fail with `not-found`.

#### Scenario: Repeated revocation or reinstatement
- **WHEN** an operator revokes a revoked slot or reinstates an active one
- **THEN** the command succeeds, writes nothing, and returns the slot at its current revision

#### Scenario: Update of a revoked slot
- **WHEN** an operator changes the allowed projects or the concurrency limit of a revoked slot
- **THEN** the update fails with `conflict` and the slot is unchanged

#### Scenario: Command on a removed slot
- **WHEN** an operator updates, revokes, reinstates, removes, or rotates a removed or unknown slot
- **THEN** the command fails with `not-found`

#### Scenario: Rotation answer
- **WHEN** a rotation's switch commits and its cleanup then fails
- **THEN** the rotation returns the slot at the revision of its switch, and the sweep later discards the replaced version

#### Scenario: Removal whose destroy fails
- **WHEN** a removal commits and the destroy of its credential then fails
- **THEN** the removal succeeds, and the sweep later destroys every version of the slot

#### Scenario: Revocation racing a placement
- **WHEN** a revocation and a placement that selects its slot run concurrently on PostgreSQL
- **THEN** both commit only in a serial order, the later one is retried, and no held reservation names the revoked slot

#### Scenario: Revocation racing a re-delivery
- **WHEN** a revocation and a re-delivery of its slot's credential read the active slot concurrently on PostgreSQL
- **THEN** both commit as if the re-delivery ran first, and the revocation cancels the attempt and revokes its grant

### Requirement: Credential sweep with a grace age
The sweep SHALL list the stored versions older than a grace age of at least one hour by the database clock and, per listed slot, discard exactly those versions when no record names the slot, destroy the credential when the record is removed, and otherwise discard the versions below the record's `credentialVersion`; it SHALL refuse a shorter grace age with `invalid`.

#### Scenario: Version within the grace age
- **WHEN** a slot without a record holds one version older than the grace age and one younger
- **THEN** the sweep discards the older version and keeps the younger one

#### Scenario: Versions around the named one
- **WHEN** a slot record names version 2 and versions 1, 2, and 3 are older than the grace age
- **THEN** the sweep discards version 1 and keeps versions 2 and 3

#### Scenario: Short grace age
- **WHEN** the sweep is asked for a grace age under one hour
- **THEN** it fails with `invalid` and discards nothing

### Requirement: Stored credential listing
`SlotCredentials.listStored(storedBefore)` SHALL list the slot identifier and version of every stored version stored before the instant, by slot identifier in code-unit order and then by version, without discarded or destroyed versions, and both adapters SHALL pass its conformance case; the PostgreSQL adapter SHALL date each version by the database clock in `slot_credentials.stored_at`.

#### Scenario: Listing order
- **WHEN** versions are stored for slots whose identifiers differ in case, one is discarded, and another slot is destroyed
- **THEN** the listing names the remaining versions in code-unit order of the slot identifier, then by version

#### Scenario: Versions stored later
- **WHEN** the listing is asked for versions stored before an instant earlier than every store
- **THEN** it is empty

## MODIFIED Requirements

### Requirement: Run slot credential port on the worker
The worker SHALL obtain a run's slot credential only through `RunSlotCredentials`, which fetches it with the current recovery epoch, holds it only in memory for that run until the host forgets the run, its generation, or its epoch, or a call moves past it, uses no delivery that arrives after that, gives it to no other execution, and logs refusals by identifiers and reason only; no form of a held credential SHALL show its text.

#### Scenario: Held per run
- **WHEN** the harness host obtains a run's credential twice and then forgets the run
- **THEN** the first call fetches it, the second returns the held one, and the next call after forgetting fetches again

#### Scenario: New recovery epoch
- **WHEN** the harness host forgets a recovery epoch, or a call reads a later one, while deliveries are held
- **THEN** the deliveries of the old epoch are forgotten at once, and the next call fetches with the current epoch

#### Scenario: Call of an older recovery epoch
- **WHEN** a call reads a recovery epoch lower than that of a held delivery or a fetch in flight
- **THEN** the call fails with `conflict`, and the later epoch's delivery stays held or in flight

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
