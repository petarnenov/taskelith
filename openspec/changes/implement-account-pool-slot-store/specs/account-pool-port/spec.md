## ADDED Requirements

### Requirement: Slot records on PostgreSQL
`PostgresAccountSlots` SHALL store slot records in the installation's PostgreSQL database as the `accountSlots` member of the reservation transaction, whose table checks repeat the record invariants, and SHALL pass the `AccountSlots` conformance suite, as the in-memory test double does.

#### Scenario: Conformance on PostgreSQL
- **WHEN** the `AccountSlots` conformance suite runs against `PostgresAccountSlots` inside one transaction
- **THEN** every case passes, concurrent replaces at one revision included

### Requirement: Slot count of a harness
`AccountSlots.countNotRemoved` SHALL return the number of a harness's slots in every project that are not removed, revoked slots included, for the slot limit of the harness's admitted pair.

#### Scenario: Revoked and removed slots
- **WHEN** a harness has an active, a revoked, and a removed slot
- **THEN** `countNotRemoved` returns 2

### Requirement: Encrypted slot credential store
`PostgresSlotCredentials` SHALL keep only AES-256-GCM ciphertext bound to its slot and version, with the key in `control-plane/slot-credential-key` and never in the database, SHALL commit each operation in a SERIALIZABLE transaction of its own, SHALL pass the `SlotCredentials` conformance suite, and SHALL fail `reveal` with `internal`, naming no credential text, for a ciphertext that does not open.

#### Scenario: Credential at rest
- **WHEN** a credential is stored
- **THEN** no row of the database holds its text, and `reveal` with the installation's key returns it

#### Scenario: Row moved to another version
- **WHEN** a stored ciphertext is copied to another slot or version, or read with another key
- **THEN** `reveal` fails with `internal` and the failure holds no credential text

### Requirement: Add-slot command with a pair limit
`addAccountSlot` SHALL reject with `invalid`, before it stores anything, a slot without an admitted pair or with an invalid record, SHALL then store the credential and, in one SERIALIZABLE capacity transaction, check the pair's slot limit with `countNotRemoved` and add the record that names the stored version, and SHALL discard that version when the transaction returns an `Err`.

#### Scenario: Concurrent adds for the last slot
- **WHEN** two add-slot commands for a pair that allows one slot run concurrently on PostgreSQL
- **THEN** one slot is added, the other command fails with `invalid`, and only the added slot keeps a credential

#### Scenario: Refused add
- **WHEN** an add-slot command fails
- **THEN** its failure names identifiers and limits and holds no credential text

### Requirement: New-session selection in the placement transaction
`placeInTransaction` SHALL take the attempt's slot request instead of provider credentials, SHALL select a `new-session` request's slot by eligibility, the least-loaded rule, and its policy at the credential step, SHALL record the selected slot and its reservation time with the reservation, and SHALL fail a `resumed-session` or `after-limit` request with `invalid` until sub-change 12b.

#### Scenario: Race for the last unit of a slot
- **WHEN** two placements on PostgreSQL race for the last unit of a slot whose concurrency limit is 1
- **THEN** one is placed and the other waits with `provider-concurrency-exhausted`

#### Scenario: Resumed session before 12b
- **WHEN** a placement names a `resumed-session` request
- **THEN** the placement fails with `invalid` and reserves nothing
