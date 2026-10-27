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
The least-loaded rule SHALL order eligible slots by held reservations, then by usage fraction only when every tied slot has a usage report whose derived window end is after the selection time, then by least recent reservation, then by lowest identifier, and a selection SHALL record the time of the slot's reservation.

#### Scenario: Equal usage
- **WHEN** two eligible slots tie on held reservations and report the same usage fraction
- **THEN** the least recently reserved of the two is reserved

#### Scenario: Ended usage window
- **WHEN** two eligible slots tie on held reservations, report usage fractions 0.2 and 0.7, and the window of the 0.2 report has ended
- **THEN** the least recently reserved of the two is reserved

### Requirement: Cooldown bounds
A limit without a future reset time SHALL put a slot in cooldown for the installation's default, a setting from 1 to 1440 minutes, provisionally 60; a later limit SHALL never shorten a cooldown, and a cooldown SHALL end only at its stored end, because no signal ends it earlier.

#### Scenario: Shorter later limit
- **WHEN** a slot cooling down until 10:00 reports a limit with a reset time of 09:30
- **THEN** its cooldown still ends at 10:00

#### Scenario: No early end
- **WHEN** a slot cooling down until 10:00 reports a usage fraction of 0 at 09:00
- **THEN** its cooldown still ends at 10:00

### Requirement: Revocation, reinstatement, and removal
Revoking a slot SHALL take it out of every pool and stop revealing its credential while keeping it encrypted; reinstating it SHALL return it to its pools unchanged; removing it SHALL destroy every version of its credential and keep its record as a tombstone; no held reservation SHALL block either; a revocation SHALL cancel each attempt holding the slot, which releases reservations as capacity reservation section 6 says; a removal SHALL drain or reject them and release none itself.

#### Scenario: Reinstated slot
- **WHEN** a revoked slot is reinstated
- **THEN** it rejoins its pools with its stored credential, health, cooldown, and usage

#### Scenario: Revocation while reserved
- **WHEN** an operator revokes a slot with a compromised credential while a running attempt's held reservation names it
- **THEN** the revocation succeeds, the attempt's grants are revoked and its cancellation is written, the reservation stays held until the execution's terminal fact, and the worker redacts the run by the delivered value until it ends

#### Scenario: Revocation of a reserved attempt not yet launched
- **WHEN** an operator revokes a slot whose held reservation belongs to an attempt with no `authorized` or `started` execution
- **THEN** the revocation cancels the attempt and releases the reservation in the same transaction

#### Scenario: Removal while reserved
- **WHEN** an operator removes an active slot while a running attempt's held reservation names it
- **THEN** the removal succeeds and destroys the credential, the attempt is drained or rejected by policy or an operator, its re-delivery is refused, and the reservation stays held until the execution's terminal fact

#### Scenario: Removal after revocation
- **WHEN** an operator removes a revoked slot whose running attempt the revocation cancelled
- **THEN** the removal succeeds and destroys the credential, and the reservation stays held until the execution's terminal fact

### Requirement: Slot store compare-and-set
`AccountSlots` SHALL store a new slot only at revision 1, SHALL replace a slot only at its expected revision with the next revision, failing with `conflict` for another stored revision and `invalid` for another new revision, and SHALL return a project's pool for a harness as its active allowed slots in the code-unit order of their identifiers, which for ASCII identifiers is the order of the "C" collation.

#### Scenario: Concurrent replaces
- **WHEN** two replaces of one slot run at the same expected revision
- **THEN** exactly one succeeds and the other fails with `conflict`

### Requirement: Redacted slot credentials
`SlotCredentials` SHALL store each credential encrypted under a new version it assigns and never replaces, and reveal the record's version only to deliver it to the reserving run; the delivery, not `SlotCredentials`, SHALL check that the reservation is held, names the slot, and belongs to the launched attempt, and that the slot is active; destroying SHALL remove every version and any later store, and succeed when none exists; a `SlotSecret` SHALL disclose its text only through `reveal()`.

#### Scenario: Credential for another attempt
- **WHEN** a worker launches an attempt whose reservation does not name the slot
- **THEN** no credential of the slot is revealed or sent

#### Scenario: Logged credential
- **WHEN** a revealed credential is converted to a string, serialized as JSON, or inspected
- **THEN** each form is `[redacted]` and contains no credential text

#### Scenario: Repeated destruction
- **WHEN** a slot's credential is destroyed twice
- **THEN** both calls succeed and no credential can be revealed for the slot

#### Scenario: Store after destruction
- **WHEN** a credential is stored for a slot after its credential was destroyed
- **THEN** no version of it is kept or revealed

### Requirement: Shared harness plugin identifier
The Scheduling module SHALL name a slot's harness with the Execution module's `HarnessPluginId`, whose value is the harness plugin's manifest `id`, and SHALL define no harness plugin identifier type of its own; it SHALL keep a slot's mechanism its own opaque `SubscriptionMechanismId`, whose values come from the mechanisms the plugin declares through the agent harness port and are validated outside the pool.

#### Scenario: Harness identifier from Execution
- **WHEN** the pool names the harness plugin of a slot
- **THEN** it uses the `HarnessPluginId` that `@taskelith/execution` exports, with the plugin's manifest `id` as its value

#### Scenario: Mechanism stays opaque
- **WHEN** the pool stores a slot's subscription mechanism
- **THEN** it stores a `SubscriptionMechanismId` without importing the agent harness port's mechanism type, and the "Harness-neutral slot records" requirement still holds

### Requirement: Admitted credential deliveries only
A slot's credential SHALL be delivered only through a delivery admitted for the slot's harness and mechanism: the add-slot command SHALL reject a slot whose mechanism has no admitted delivery for its harness with `invalid`, and the delivery SHALL reveal nothing for such a slot. By G3 decision D6, the only delivery admitted for Claude Code, the only harness G3 admits, SHALL be `subscription-token`.

#### Scenario: Device login slot without an admitted delivery
- **WHEN** an operator adds a slot whose mechanism is `device-login` and its harness has no admitted `device-login` delivery, as Claude Code has none under D6
- **THEN** the command fails with `invalid` and no slot or credential is stored

### Requirement: Credential rotation only on an unreserved revoked slot
A rotation SHALL store the new credential under a new version and then, in one capacity transaction, switch the slot record to it by compare-and-set only while the slot is revoked, no held reservation names it, and its version is still the one the rotation read; otherwise it SHALL fail with `conflict` and leave the new version unnamed, so that every delivery to a run, a re-delivery included, reveals the credential that the run started with.

#### Scenario: Rotation while reserved
- **WHEN** an operator rotates the credential of a revoked slot that a held reservation still names
- **THEN** the rotation fails with `conflict` and the slot keeps its credential

#### Scenario: Rotation of an active slot
- **WHEN** an operator rotates the credential of an active slot
- **THEN** the rotation fails with `conflict` and the slot keeps its credential

#### Scenario: Reinstatement during a rotation
- **WHEN** a revoked slot is reinstated after a rotation stored its new credential but before the rotation switched to it
- **THEN** the rotation fails with `conflict`, no record names its new version, and every delivery reveals the old credential

#### Scenario: Removal during a rotation
- **WHEN** a revoked slot is removed while a rotation stores its new credential
- **THEN** the rotation fails with `conflict`, and no version of the slot's credential is kept

### Requirement: Superseded credential versions discarded
`SlotCredentials.store` SHALL assign a slot's versions from a stored per-slot counter, strictly increasing and never reused, even after a discard or destroy. After its switch commits, a rotation SHALL call `discardOlderThan` with its own version, which destroys only the slot's lower versions, and then advance the slot's revision; a rotation whose switch fails SHALL leave its version, which a later successful rotation with a higher version discards.

#### Scenario: Superseded version discarded
- **WHEN** a rotation switches a slot to its new version after an earlier rotation crashed or failed and left a lower version
- **THEN** the replaced version and the lower orphan are discarded, and the new version can be revealed

#### Scenario: Cleanup after a later rotation
- **WHEN** rotation A switches a slot to its version, and rotation B then stores and switches before A's cleanup runs
- **THEN** A's cleanup keeps B's version, and the slot's credential can still be delivered

#### Scenario: Rotations that read the same revision
- **WHEN** two rotations read the same revision of a slot and both store a version
- **THEN** the first switch wins, the other fails with `conflict`, and the record never names a discarded version

#### Scenario: Orphan newer than the current version
- **WHEN** a failed rotation left a version higher than the slot's current one, and a later rotation stores after it and switches
- **THEN** the later rotation's cleanup discards the orphan

#### Scenario: Version never reused
- **WHEN** a slot's highest version is discarded, or its credential destroyed, and a credential is stored for it again
- **THEN** the new version is higher than every earlier version of the slot

### Requirement: Credential kept out of worker records
A delivered slot credential SHALL be held only in the worker host's memory for the execution it was delivered to, and SHALL never enter the worker journal, a launch authorization grant, `worker/executions/<executionId>/`, `worker/logs/`, or the local outbox; every execution after its W3 commit, a recovered or adopted one included, SHALL request it again through a new delivery with the delivery's checks.

#### Scenario: Recovered execution
- **WHEN** recovery starts a new execution after a journaled grant without an execution record
- **THEN** the new execution requests the credential through a new delivery, and the journal holds no credential

#### Scenario: Adopted execution
- **WHEN** a restarted worker adopts a running execution
- **THEN** it requests the credential again before it redacts or injects anything with it

### Requirement: Re-delivery to an adopted execution
A re-delivery to an adopted execution SHALL need no new launch authorization; it SHALL be made only after the launch authorization checks that a started execution still passes (quarantine, recovery epoch, worker, assignment, ownership generation, attempt, owning execution without a revoked grant), the reservation and slot checks, and the admitted delivery check; otherwise it SHALL reveal nothing, and the worker SHALL discard the run's output and never send it.

#### Scenario: Adoption after the grant expired
- **WHEN** a worker restarts after its execution's launch authorization expired and adopts the execution, which still owns its attempt and holds the slot's reservation
- **THEN** the credential is delivered again without a new launch authorization

#### Scenario: Adoption after cancellation
- **WHEN** a worker adopts an execution whose attempt was cancelled
- **THEN** the re-delivery is refused with `attempt-not-launchable`, and none of the run's harness output or logs is written or leaves the host, even after the run ends

#### Scenario: Adoption after a revoked grant
- **WHEN** a worker adopts an execution whose attempt is live but whose grant was revoked
- **THEN** the re-delivery is refused with `execution-conflict`

#### Scenario: Re-delivery in quarantine
- **WHEN** a worker requests a re-delivery while the installation is in restore quarantine
- **THEN** the re-delivery is refused with `quarantined` and no credential is revealed

### Requirement: Run redaction by credential value
Every text of a run, whatever its channel, SHALL be redacted by the exact text of each slot credential revealed to the run, from the delivery to the run's end, before it is written to a worker record or leaves the host; a stream SHALL be redacted over a window that finds a credential split across chunks, and text truncated only after redaction; overlapping or touching occurrences SHALL become one `[redacted]`, and no part of a credential or of a shape secret in its word SHALL stay visible.

#### Scenario: Token without a known prefix
- **WHEN** a run's harness output or failure holds a revealed credential that matches no shape rule
- **THEN** every occurrence is replaced with `[redacted]`

#### Scenario: Credential as a failure detail key
- **WHEN** a failure of a run names a revealed credential as a detail key
- **THEN** the redacted failure's keys and values contain no credential text

#### Scenario: Overlapping occurrences
- **WHEN** revealed credentials occur overlapping, touching, or in one whitespace-free word with a shape secret of the installation
- **THEN** no character of either is visible, and each covered run is one `[redacted]`

#### Scenario: Credential split across stream chunks
- **WHEN** a run's harness output stream carries a revealed credential split across two chunks
- **THEN** neither chunk's part of it is written or sent

### Requirement: Confidential credential transport
A slot credential SHALL be delivered only in the control plane's API response to the worker, over the TLS of G3 item 26 or to a worker co-located with the control plane on its host, never over plain HTTP to a remote worker and never in a broker message.

#### Scenario: Remote worker before TLS
- **WHEN** a remote worker launches an attempt and the installation has no TLS for the worker's connection
- **THEN** no slot credential is sent to it

### Requirement: Session reports applied to the reserving slot
The control plane SHALL apply a session's usage and limit signals and its credential authentication failures, by compare-and-set, to the slot that the reservation of the session's attempt records, and SHALL never query a harness plugin outside a session; the add-slot command SHALL check a slot's mechanism against the control plane's admitted pairs of harness plugin and mechanism.

#### Scenario: Limit signal without a slot name
- **WHEN** the plugin of a session whose attempt's reservation records slot S reports a limit
- **THEN** slot S enters cooldown

#### Scenario: Mechanism check without the plugin
- **WHEN** an operator adds a slot
- **THEN** its mechanism is checked against the admitted pairs of its harness, and no harness plugin is called

### Requirement: Usage window derived by the pool
The pool SHALL derive a usage report's window end as the database time at which the control plane applies the report plus the usage window length that the pool configuration sets for the slot's harness; a report for a harness without a length SHALL clear the slot's usage, and the agent harness port's usage signal SHALL carry no window.

#### Scenario: Report within its window
- **WHEN** harness H has a usage window length of 300 minutes and a usage report for a slot of H is applied at 09:00
- **THEN** the slot's usage window ends at 14:00

#### Scenario: Harness without a window length
- **WHEN** a usage report is applied for a slot whose harness has no usage window length
- **THEN** the slot has no usage, and the usage tie-breaker is skipped for its ties

### Requirement: Health from session failures
A slot SHALL become unhealthy when a session on it reports that its credential fails authentication, through a turn that fails with `authentication` or a start or resume that fails with `forbidden`, and SHALL become healthy again only when a rotation switches it to a new credential.

#### Scenario: Authentication failure in a session
- **WHEN** a turn of a session on slot S fails with `authentication`
- **THEN** slot S becomes unhealthy and receives no new reservation

#### Scenario: Recovery by rotation
- **WHEN** an unhealthy slot is revoked, rotated to a new credential, and reinstated
- **THEN** it is healthy and eligible again
