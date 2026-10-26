## Purpose

Define the harness-neutral account pool port of the Scheduling module: subscription account slots, their eligibility and selection inside the reservation transaction, session affinity, the selection after a limit, encrypted slot credentials, and revocation and removal.

## ADDED Requirements

### Requirement: Harness-neutral slot records
The Scheduling module SHALL identify a slot by the `ProviderCredentialId` that a reservation records, SHALL treat its harness and subscription mechanism as opaque identifiers, and SHALL not let a slot change its harness or leave the removed state; no type, value, or test of the pool SHALL name a harness or vendor.

#### Scenario: Harness change
- **WHEN** an adapter is asked to replace a slot with one of another harness
- **THEN** the change fails with `invalid` and the stored slot is unchanged

#### Scenario: Removed slot
- **WHEN** an adapter is asked to make a removed slot active again
- **THEN** the change fails with `invalid`, and the slot stays a tombstone in no pool

### Requirement: Eligibility with ordered reasons
A slot SHALL be eligible when it is not removed, not revoked, allowed for the project, healthy, out of cooldown, and below its concurrency limit, checked in that order, and the first failing check SHALL be its ineligibility reason.

#### Scenario: Revoked and unhealthy slot
- **WHEN** a revoked slot is also unhealthy
- **THEN** its ineligibility reason is `revoked`

### Requirement: Selection request kinds
A selection SHALL be a `new-session`, `resumed-session`, or `after-limit` request; a resumed session SHALL consider only its own slot, and an `after-limit` request SHALL try the other allowed harnesses in the project's order before the limited slot, never another slot of the limited harness.

#### Scenario: Resumed session on a revoked slot
- **WHEN** a resumed session's slot is revoked
- **THEN** the selection is rejected with `session-slot-withdrawn`, and no other slot or harness is chosen

#### Scenario: Limit without another eligible harness
- **WHEN** an `after-limit` request finds no eligible slot on another harness and the limited slot is still cooling down
- **THEN** the selection waits with `provider-concurrency-exhausted`, and no other slot of the limited harness is chosen

### Requirement: Slot store compare-and-set
`AccountSlots` SHALL store a new slot only at revision 1, SHALL replace a slot only at its expected revision with the next revision, and SHALL return a project's pool for a harness as its active allowed slots ordered by identifier.

#### Scenario: Concurrent replaces
- **WHEN** two replaces of one slot run at the same expected revision
- **THEN** exactly one succeeds and the other fails with `conflict`

### Requirement: Redacted slot credentials
`SlotCredentials` SHALL store each slot credential encrypted at rest and reveal it only for delivery to the run that reserved the slot, destroying a missing credential SHALL succeed, and a `SlotSecret` SHALL disclose its text only through `reveal()`.

#### Scenario: Logged credential
- **WHEN** a revealed credential is converted to a string, serialized as JSON, or inspected
- **THEN** each form is `[redacted]` and contains no credential text

#### Scenario: Repeated destruction
- **WHEN** a slot's credential is destroyed twice
- **THEN** both calls succeed and no credential can be revealed for the slot
