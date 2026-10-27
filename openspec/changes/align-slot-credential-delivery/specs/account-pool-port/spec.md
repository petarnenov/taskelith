## MODIFIED Requirements

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

### Requirement: Redacted slot credentials
`SlotCredentials` SHALL store each slot credential encrypted under a new version it never replaces, and reveal the slot record's version only to deliver it to the reserving run; the delivery, not `SlotCredentials`, SHALL check that the reservation is held, names the slot, and belongs to the launched attempt, and that the slot is active; destroying SHALL remove every version and any later store, and succeed when none exists; a `SlotSecret` SHALL disclose its text only through `reveal()`.

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

## ADDED Requirements

### Requirement: Admitted credential deliveries only
A slot's credential SHALL be delivered only through a delivery admitted for the slot's harness and mechanism: the add-slot command SHALL reject a slot whose mechanism has no admitted delivery for its harness with `invalid`, and the delivery SHALL reveal nothing for such a slot. By G3 decision D6, the only delivery admitted for Claude Code, the only harness G3 admits, SHALL be `subscription-token`.

#### Scenario: Device login slot without an admitted delivery
- **WHEN** an operator adds a slot whose mechanism is `device-login` and its harness has no admitted `device-login` delivery, as Claude Code has none under D6
- **THEN** the command fails with `invalid` and no slot or credential is stored

### Requirement: Credential rotation only on an unreserved revoked slot
A rotation SHALL store the new credential under a new version and then, in one capacity transaction, switch the slot record to it by compare-and-set only while the slot is revoked, no held reservation names it, and its version is still the one the rotation read; otherwise it SHALL fail with `conflict` and discard the new version, so that every delivery to a run, a re-delivery included, reveals the credential that the run started with.

#### Scenario: Rotation while reserved
- **WHEN** an operator rotates the credential of a revoked slot that a held reservation still names
- **THEN** the rotation fails with `conflict` and the slot keeps its credential

#### Scenario: Rotation of an active slot
- **WHEN** an operator rotates the credential of an active slot
- **THEN** the rotation fails with `conflict` and the slot keeps its credential

#### Scenario: Reinstatement during a rotation
- **WHEN** a revoked slot is reinstated after a rotation stored its new credential but before the rotation switched to it
- **THEN** the rotation fails with `conflict`, its new version is discarded, and every delivery reveals the old credential

#### Scenario: Removal during a rotation
- **WHEN** a revoked slot is removed while a rotation stores its new credential
- **THEN** the rotation fails with `conflict`, and no version of the slot's credential is kept

### Requirement: Superseded credential versions discarded
A rotation SHALL keep no superseded credential: after its switch commits, it SHALL discard, through `SlotCredentials.discardAllExcept`, the replaced version and every version that an earlier failed or stopped rotation left, and then advance the slot's revision, so that a concurrent rotation whose version was discarded fails its switch with `conflict`; `discardAllExcept` SHALL keep the named version, later stores, and other slots' versions, and succeed when nothing is stored.

#### Scenario: Superseded version discarded
- **WHEN** a rotation switches a slot to its new version
- **THEN** the replaced version is discarded and only the new version can be revealed

#### Scenario: Orphaned version discarded on recovery
- **WHEN** an operator rotates a slot again after an earlier rotation stored a version and then crashed or failed with `conflict`
- **THEN** after the switch the earlier rotation's version is discarded, and no version other than the new one can be revealed

#### Scenario: Rotation racing the discard
- **WHEN** a rotation stores its version before another rotation's discard removes it
- **THEN** its switch fails with `conflict`, and the slot keeps naming a stored version

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
