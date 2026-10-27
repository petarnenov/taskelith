## MODIFIED Requirements

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
Slot credential delivery SHALL deliver only `subscription-token` credentials: the add-slot command SHALL reject a `device-login` slot with `invalid`, and the delivery SHALL reveal nothing for a slot of another mechanism, until a later item defines a device login's state directory format and its compare-and-set write-back by the reserving run.

#### Scenario: Device login slot
- **WHEN** an operator adds a slot whose mechanism is `device-login`
- **THEN** the command fails with `invalid` and no slot or credential is stored

### Requirement: Credential kept out of worker records
A delivered slot credential SHALL be held only in the worker host's memory for the execution it was delivered to, and SHALL never enter the worker journal, a launch authorization grant, `worker/executions/<executionId>/`, `worker/logs/`, or the local outbox; every execution after its W3 commit, a recovered or adopted one included, SHALL request it again through a new delivery with the delivery's checks.

#### Scenario: Recovered execution
- **WHEN** recovery starts a new execution after a journaled grant without an execution record
- **THEN** the new execution requests the credential through a new delivery, and the journal holds no credential

#### Scenario: Adopted execution
- **WHEN** a restarted worker adopts a running execution
- **THEN** it requests the credential again before it redacts or injects anything with it

### Requirement: Run redaction by credential value
Every text of a run that leaves the harness host, its harness output, logs, and failures included, SHALL be redacted by the exact text of each slot credential revealed to the run, from the delivery to the run's end, before the shape rules apply, because a subscription token has no known shape.

#### Scenario: Token without a known prefix
- **WHEN** a run's harness output or failure holds a revealed credential that matches no shape rule
- **THEN** every occurrence is replaced with `[redacted]`

### Requirement: Confidential credential transport
A slot credential SHALL be delivered only over the TLS of G3 item 26 or to a worker co-located with the control plane on its host, never over plain HTTP or NATS to a remote worker.

#### Scenario: Remote worker before TLS
- **WHEN** a remote worker launches an attempt and the installation has no TLS for the worker's connection
- **THEN** no slot credential is sent to it
