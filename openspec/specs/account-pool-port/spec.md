# account-pool-port Specification

## Purpose
Define the harness-neutral account pool port of the Scheduling module: subscription account slots, their eligibility and selection inside the reservation transaction, session affinity, the selection after a limit, encrypted slot credentials, and revocation and removal.

## Requirements

### Requirement: Harness-neutral slot records
The Scheduling module SHALL identify a slot by the `ProviderCredentialId` that a reservation records, SHALL treat its harness and subscription mechanism as opaque identifiers, and SHALL not let a slot change its harness or leave the removed state; no type, value, or test of the pool SHALL name a harness or vendor.

#### Scenario: Harness change
- **WHEN** an adapter is asked to replace a slot with one of another harness
- **THEN** the change fails with `invalid` and the stored slot is unchanged

#### Scenario: Removed slot
- **WHEN** an adapter is asked to make a removed slot active again
- **THEN** the change fails with `invalid`, and the slot stays a tombstone in no pool

### Requirement: Parsed slot records
Every slot record SHALL be built through `parseAccountSlot`, which SHALL reject with `invalid` a slot without an allowed project, with a project allowed twice, with a concurrency limit or revision that is not a positive integer, or with a usage fraction outside 0 to 1.

#### Scenario: Slot without a project
- **WHEN** a slot with no allowed project is parsed
- **THEN** parsing fails with `invalid`

### Requirement: Eligibility with ordered reasons
A slot SHALL be eligible when it is not removed, not revoked, allowed for the project, healthy, out of cooldown, and below its concurrency limit, checked in that order, and the first failing check SHALL be its ineligibility reason.

#### Scenario: Revoked and unhealthy slot
- **WHEN** a revoked slot is also unhealthy
- **THEN** its ineligibility reason is `revoked`

### Requirement: Selection request kinds
A selection SHALL be a `new-session`, `resumed-session`, or `after-limit` request; a resumed session SHALL consider only its own slot, and an `after-limit` request SHALL try the other allowed harnesses in the project's order before the limited slot, never another slot of the limited harness; an `after-limit` request whose alternatives include the limited harness or name a harness twice SHALL be `invalid`.

#### Scenario: Resumed session on a revoked slot
- **WHEN** a resumed session's slot is revoked
- **THEN** the selection is rejected with `session-slot-withdrawn`, and no other slot or harness is chosen

#### Scenario: Limit without another eligible harness
- **WHEN** an `after-limit` request finds no eligible slot on another harness and the limited slot is still cooling down
- **THEN** the selection waits with `provider-concurrency-exhausted`, and no other slot of the limited harness is chosen

#### Scenario: Limited harness among the alternatives
- **WHEN** an `after-limit` request lists the limited harness among its alternatives
- **THEN** the request is rejected as `invalid` and no slot is reserved

#### Scenario: Resumed session on a slot that no longer allows its project
- **WHEN** a resumed session's slot no longer lists the session's project
- **THEN** the selection is rejected with `session-slot-withdrawn`

### Requirement: Deterministic least-loaded order
The least-loaded rule SHALL order eligible slots by held reservations, then by usage fraction only when every tied slot reports one within its current window, then by least recent reservation, then by lowest identifier, and a selection SHALL record the time of the slot's reservation.

#### Scenario: Equal usage
- **WHEN** two eligible slots tie on held reservations and report the same usage fraction
- **THEN** the least recently reserved of the two is reserved

### Requirement: Cooldown bounds
A limit without a future reset time SHALL put a slot in cooldown for the installation's default, a setting from 1 to 1440 minutes, provisionally 60; a later limit SHALL never shorten a cooldown, and a reset signal SHALL end it.

#### Scenario: Shorter later limit
- **WHEN** a slot cooling down until 10:00 reports a limit with a reset time of 09:30
- **THEN** its cooldown still ends at 10:00

### Requirement: Revocation, reinstatement, and removal
Revoking a slot SHALL take it out of every pool and stop revealing its credential while keeping the credential encrypted; reinstating it SHALL return it to its pools unchanged; removing it SHALL destroy its credential and keep its record as a tombstone; none of them SHALL release a held reservation by itself.

#### Scenario: Reinstated slot
- **WHEN** a revoked slot is reinstated
- **THEN** it rejoins its pools with its stored credential, health, cooldown, and usage

### Requirement: Slot store compare-and-set
`AccountSlots` SHALL store a new slot only at revision 1, SHALL replace a slot only at its expected revision with the next revision, failing with `conflict` for another stored revision and `invalid` for another new revision, and SHALL return a project's pool for a harness as its active allowed slots in the code point order of their identifiers.

#### Scenario: Concurrent replaces
- **WHEN** two replaces of one slot run at the same expected revision
- **THEN** exactly one succeeds and the other fails with `conflict`

### Requirement: Redacted slot credentials
`SlotCredentials` SHALL store each slot credential encrypted at rest and reveal it only for delivery to the run that reserved the slot, after checking that its reservation is held, names the slot, and belongs to the launched attempt, and that the slot is active; destroying a missing credential SHALL succeed, and a `SlotSecret` SHALL disclose its text only through `reveal()`.

#### Scenario: Credential for another attempt
- **WHEN** a worker launches an attempt whose reservation does not name the slot
- **THEN** no credential of the slot is revealed or sent

#### Scenario: Logged credential
- **WHEN** a revealed credential is converted to a string, serialized as JSON, or inspected
- **THEN** each form is `[redacted]` and contains no credential text

#### Scenario: Repeated destruction
- **WHEN** a slot's credential is destroyed twice
- **THEN** both calls succeed and no credential can be revealed for the slot

### Requirement: Shared harness plugin identifier
The Scheduling module SHALL name a slot's harness with the Execution module's `HarnessPluginId`, whose value is the harness plugin's manifest `id`, and SHALL define no harness plugin identifier type of its own; it SHALL keep a slot's mechanism its own opaque `SubscriptionMechanismId`, whose values come from the mechanisms the plugin declares through the agent harness port and are validated outside the pool.

#### Scenario: Harness identifier from Execution
- **WHEN** the pool names the harness plugin of a slot
- **THEN** it uses the `HarnessPluginId` that `@taskelith/execution` exports, with the plugin's manifest `id` as its value

#### Scenario: Mechanism stays opaque
- **WHEN** the pool stores a slot's subscription mechanism
- **THEN** it stores a `SubscriptionMechanismId` without importing the agent harness port's mechanism type, and the "Harness-neutral slot records" requirement still holds
