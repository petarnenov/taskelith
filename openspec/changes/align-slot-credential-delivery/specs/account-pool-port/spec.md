## MODIFIED Requirements

### Requirement: Revocation, reinstatement, and removal
Revoking a slot SHALL take it out of every pool and stop revealing its credential while keeping the credential encrypted; reinstating it SHALL return it to its pools unchanged; removing it SHALL destroy its credential and keep its record as a tombstone; a held reservation SHALL block no revocation or removal; a revocation SHALL cancel each attempt holding the slot, and a removal SHALL drain or reject its in-flight sessions; none of them SHALL release a held reservation by itself.

#### Scenario: Reinstated slot
- **WHEN** a revoked slot is reinstated
- **THEN** it rejoins its pools with its stored credential, health, cooldown, and usage

#### Scenario: Revocation while reserved
- **WHEN** an operator revokes a slot with a compromised credential while a running attempt's held reservation names it
- **THEN** the revocation succeeds, the attempt's grants are revoked and its cancellation is written, the reservation stays held until the execution's terminal fact, and the worker redacts the run by the delivered value until it ends

#### Scenario: Removal while reserved
- **WHEN** an operator removes an active slot while a running attempt's held reservation names it
- **THEN** the removal succeeds and destroys the credential, the attempt is drained or rejected by policy or an operator, its re-delivery is refused, and the reservation stays held until the execution's terminal fact

#### Scenario: Removal after revocation
- **WHEN** an operator removes a revoked slot whose running attempt the revocation cancelled
- **THEN** the removal succeeds and destroys the credential, and the reservation stays held until the execution's terminal fact

### Requirement: Redacted slot credentials
`SlotCredentials` SHALL store each slot credential encrypted at rest and reveal it only for the delivery to the run that reserved the slot; the delivery, not `SlotCredentials`, SHALL check that the reservation is held, names the slot, and belongs to the launched attempt, and that the slot is active; destroying a missing credential SHALL succeed, and a `SlotSecret` SHALL disclose its text only through `reveal()`.

#### Scenario: Credential for another attempt
- **WHEN** a worker launches an attempt whose reservation does not name the slot
- **THEN** no credential of the slot is revealed or sent

#### Scenario: Logged credential
- **WHEN** a revealed credential is converted to a string, serialized as JSON, or inspected
- **THEN** each form is `[redacted]` and contains no credential text

#### Scenario: Repeated destruction
- **WHEN** a slot's credential is destroyed twice
- **THEN** both calls succeed and no credential can be revealed for the slot

## ADDED Requirements

### Requirement: Subscription token delivery only
Slot credential delivery SHALL deliver only `subscription-token` credentials: the add-slot command SHALL reject a `device-login` slot with `invalid`, and the delivery SHALL reveal nothing for a slot of another mechanism. This restriction SHALL be revisited only if G3 item 35 overturns G3 decision D6, which chose a subscription token per slot.

#### Scenario: Device login slot
- **WHEN** an operator adds a slot whose mechanism is `device-login`
- **THEN** the command fails with `invalid` and no slot or credential is stored

### Requirement: Credential rotation only on an unreserved revoked slot
Replacing a slot's stored credential SHALL be refused with `conflict` unless the slot is revoked and no held reservation names it, so that every delivery to a run, a re-delivery included, reveals the credential that the run started with.

#### Scenario: Rotation while reserved
- **WHEN** an operator rotates the credential of a revoked slot that a held reservation still names
- **THEN** the rotation fails with `conflict` and the stored credential is unchanged

#### Scenario: Rotation of an active slot
- **WHEN** an operator rotates the credential of an active slot
- **THEN** the rotation fails with `conflict` and the stored credential is unchanged

### Requirement: Credential kept out of worker records
A delivered slot credential SHALL be held only in the worker host's memory for the execution it was delivered to, and SHALL never enter the worker journal, a launch authorization grant, `worker/executions/<executionId>/`, `worker/logs/`, or the local outbox; every execution after its W3 commit, a recovered or adopted one included, SHALL request it again through a new delivery with the delivery's checks.

#### Scenario: Recovered execution
- **WHEN** recovery starts a new execution after a journaled grant without an execution record
- **THEN** the new execution requests the credential through a new delivery, and the journal holds no credential

#### Scenario: Adopted execution
- **WHEN** a restarted worker adopts a running execution
- **THEN** it requests the credential again before it redacts or injects anything with it

### Requirement: Re-delivery to an adopted execution
A re-delivery to an adopted execution SHALL need no new launch authorization; it SHALL be made only while the authenticated worker holds the attempt's assignment at its current ownership generation, the execution is the attempt's non-terminal owning execution with no revoked grant, and the attempt's held reservation names the active slot; otherwise it SHALL reveal nothing, and the worker SHALL send none of the run's output off its host.

#### Scenario: Adoption after the grant expired
- **WHEN** a worker restarts after its execution's launch authorization expired and adopts the execution, which still owns its attempt and holds the slot's reservation
- **THEN** the credential is delivered again without a new launch authorization

#### Scenario: Adoption after cancellation
- **WHEN** a worker adopts an execution whose attempt was cancelled or whose grant was revoked
- **THEN** the re-delivery is refused with `attempt-not-launchable` or `execution-conflict`, and none of the run's harness output or logs leaves the host

### Requirement: Run redaction by credential value
Every text of a run that leaves the harness host, its harness output, logs, and failures with their detail keys included, SHALL be redacted by the exact text of each slot credential revealed to the run, from the delivery to the run's end, because a subscription token has no known shape; overlapping or touching occurrences SHALL become one `[redacted]`, and no part of a credential or of a shape secret it touches SHALL stay visible.

#### Scenario: Token without a known prefix
- **WHEN** a run's harness output or failure holds a revealed credential that matches no shape rule
- **THEN** every occurrence is replaced with `[redacted]`

#### Scenario: Credential as a failure detail key
- **WHEN** a failure of a run names a revealed credential as a detail key
- **THEN** the redacted failure's keys and values contain no credential text

#### Scenario: Overlapping occurrences
- **WHEN** revealed credentials occur overlapping, touching, or inside a shape secret of the installation
- **THEN** no character of either is visible, and each covered run is one `[redacted]`

### Requirement: Confidential credential transport
A slot credential SHALL be delivered only over the TLS of G3 item 26 or to a worker co-located with the control plane on its host, never over plain HTTP or NATS to a remote worker.

#### Scenario: Remote worker before TLS
- **WHEN** a remote worker launches an attempt and the installation has no TLS for the worker's connection
- **THEN** no slot credential is sent to it
