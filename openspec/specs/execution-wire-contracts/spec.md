# execution-wire-contracts Specification

## Purpose
Define the execution wire contracts of G2: the AsyncAPI commands and observations between the control plane and a worker, the OpenAPI operations for enrollment, launch authorization, task results, and evidence, and the execution protocol version with which a worker fails closed.

## Requirements

### Requirement: Execution documents
`@taskelith/contracts` SHALL hold `documents/execution.asyncapi.json` (AsyncAPI 3.0.0) and `documents/execution.openapi.json` (OpenAPI 3.1.0), each with a semantic `info.version`. The rules that their schemas cannot express SHALL be stated in `docs/contracts/execution-wire-contracts.md`.

#### Scenario: Documents generated
- **WHEN** the build generates the contract types
- **THEN** it includes every schema and path of both execution documents

### Requirement: Worker channels
The AsyncAPI document SHALL define a command channel, an observation channel, and a heartbeat channel per installation and worker. The command channel SHALL carry the assignment offer, cancellation request, and assignment end commands and the observation confirmation. The observation channel SHALL carry every observation and the inventory report. The heartbeat channel SHALL carry only the worker heartbeat, over core NATS without a stream.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

#### Scenario: Heartbeat channel
- **WHEN** the heartbeat channel address is resolved
- **THEN** it is `taskelith.<installationId>.workers.<workerId>.heartbeats`, and its only message is `worker.heartbeat`

### Requirement: Execution commands
Each execution command SHALL use the shared command envelope, SHALL require its attempt, worker, and ownership generation, SHALL fix its command type, and SHALL carry `payload.protocolVersion`. An offer SHALL carry the assignment, the recovery epoch, and its reservation with the requested resources. A cancellation SHALL carry its reason and MAY name one execution.

#### Scenario: Offer without attempt
- **WHEN** an offer omits `metadata.attemptId`
- **THEN** validation fails and names the field

#### Scenario: Command type of another command
- **WHEN** a cancellation envelope is validated as an offer
- **THEN** validation fails at the metadata command type

### Requirement: Observation envelope
Every observation SHALL carry a deterministic `observationId`, its fixed type, schema and protocol versions, `workerId`, `journalId`, and a positive `sequence`. Every observation about an attempt SHALL also carry the attempt and its ownership generation; only command rejections, unrecorded processes, capacity, and admission pressure are about no attempt.

#### Scenario: Observation without journal
- **WHEN** an observation omits `journalId`
- **THEN** validation fails and names the field

#### Scenario: Assignment observation without generation
- **WHEN** an assignment acceptance omits `metadata.ownershipGeneration`
- **THEN** validation fails and names the field

#### Scenario: Sequence zero
- **WHEN** an observation has sequence 0
- **THEN** validation fails at the sequence

### Requirement: Execution observations
The AsyncAPI document SHALL define observations for assignment acceptance and refusal, command rejection, non-retryable launch rejection, and the supervisor facts. The facts are `started`, `exited`, `not-started`, `uncertain`, `termination-unproven`, and `unrecorded-process`. It SHALL also define a cancellation that was not applied, capacity declaration, and admission pressure.

#### Scenario: Refusal for the protocol
- **WHEN** an assignment refusal names `protocol-not-supported`
- **THEN** validation fails, because the worker rejects such an offer as a command

#### Scenario: Pressure refusal not retryable
- **WHEN** a refusal for admission pressure is not retryable or names no cause
- **THEN** validation fails

#### Scenario: Spawn failure with a proven start
- **WHEN** an exit reports a failed spawn and a proven start
- **THEN** validation fails

#### Scenario: Retryable launch rejection
- **WHEN** a launch rejection observation names `unavailable`
- **THEN** validation fails

#### Scenario: Exit code out of range
- **WHEN** an exit observation has exit code 256
- **THEN** validation fails

### Requirement: Confirmation and inventory
The AsyncAPI document SHALL define a cumulative confirmation of a positive `confirmedThrough` per worker and journal. It SHALL also define an inventory report of the held assignments and their executions' journal states with uncertainty beside them, sent in numbered parts of one report identity and an increasing snapshot number, each with the last journal sequence the report reflects and small enough for the broker's `1 MiB` payload limit.

#### Scenario: Snapshot answering a request
- **WHEN** an inventory part carries the `requestId` of an inventory request
- **THEN** it is valid, and the inventory request is valid on the command channel

#### Scenario: Uncertainty as a state
- **WHEN** an inventory execution has the state `uncertain`
- **THEN** validation fails

#### Scenario: Largest inventory part
- **WHEN** an inventory part has the most entries and the longest identifiers the schema allows
- **THEN** its JSON encoding is smaller than 1 MiB

#### Scenario: Empty confirmation
- **WHEN** a confirmation has `confirmedThrough` 0
- **THEN** validation fails

### Requirement: Inventory request
The AsyncAPI document SHALL define an inventory request on the command channel with a fresh `requestId`, which a snapshot answering it SHALL return. Only a snapshot that answers the latest request SHALL prove a rollback, by a `throughSequence` below the bound recorded when the request was sent or by omitting an assignment the bound lists, checked before the lower-`snapshot` filter. A rollback SHALL start reconciliation and keep ownership and the reservation.

#### Scenario: Rollback in a fresh snapshot
- **WHEN** a snapshot answering the current request has a `throughSequence` below the highest sequence applied from its journal when the request was sent
- **THEN** the contract page classifies it as a rollback, and a snapshot without that `requestId` proves none

#### Scenario: Observation applied after the request
- **WHEN** an observation is applied after the request and the fresh snapshot's `throughSequence` is below it but not below the bound
- **THEN** the contract page classifies the snapshot as no rollback

#### Scenario: Rolled-back snapshot counter
- **WHEN** a complete fresh snapshot has a lower `snapshot` than one already received from its journal
- **THEN** the contract page checks it for rollback before the `snapshot` filter, and it never replaces the later snapshot

### Requirement: Wire vocabularies
The wire enumerations of refusal, non-retryable launch rejection, launch rejection, revocation, cancellation, and assignment end reasons, and of hard controls, SHALL equal the vocabularies of the execution and scheduling domains, except that the worker's refusal reasons omit `protocol-not-supported`, which the control plane derives from a command rejection.

#### Scenario: Domain reason added
- **WHEN** a domain vocabulary gains a value the wire enumeration lacks
- **THEN** the package tests fail

### Requirement: Execution HTTP operations
The OpenAPI document SHALL define `enrollWorker`, `authorizeLaunch`, `requestDelegation`, `readTaskResult`, `publishEvidence`, `readEvidence`, and `downloadEvidence`. Each SHALL declare its credential: an enrollment token, the worker credential, or the operator credential. Errors SHALL use the kernel failure shape.

#### Scenario: Parent in a delegation request
- **WHEN** a delegation request names `parentTaskId`
- **THEN** the request body is invalid

#### Scenario: Worker in a launch request
- **WHEN** a launch authorization request names `workerId`
- **THEN** the request body is invalid

### Requirement: Launch authorization outcome
`authorizeLaunch` SHALL return the decision recorded for its `operationId` with status 200. The decision is a grant with its bound values, `ttlMilliseconds`, and `skewMilliseconds`, a rejection with its reason and retryability, a revoked grant with its revocation reason, or an expired grant. Status 503 SHALL mean that no decision was reached.

#### Scenario: Retryable gate rejection
- **WHEN** a rejection names `gate-not-passed` as retryable
- **THEN** validation fails

#### Scenario: Revocation for a non-revocation reason
- **WHEN** a revoked outcome names `operation-mismatch`
- **THEN** validation fails

### Requirement: Task result and evidence
`readTaskResult` SHALL return a pending result, or the outcome fact of the task's last ended attempt with the task's evidence records. An evidence record SHALL require the fields of architecture section 8, the ownership generation it was produced at, a SHA-256 content digest, and its producer, and SHALL state whether that generation was current.

#### Scenario: Evidence without validator
- **WHEN** an evidence publication omits its validator
- **THEN** validation fails and names the field

#### Scenario: Pending result with outcome
- **WHEN** a pending task result carries an outcome
- **THEN** validation fails

### Requirement: Protocol version
Every execution command, observation, and report SHALL carry a positive integer protocol version. `VersionedCommand` SHALL accept every command whose metadata is valid and whose payload names a version. The package SHALL export `EXECUTION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `supportsProtocolVersion`, and `commonProtocolVersion`.

#### Scenario: Later version
- **WHEN** a worker supporting version 1 receives an offer of version 2 with unknown payload fields
- **THEN** `VersionedCommand` accepts it, the version is unsupported, the offer schema rejects it, and a command rejection naming only its `commandId` and type is valid

#### Scenario: No common version
- **WHEN** the worker supports only version 1 and the control plane versions 2 to 3
- **THEN** `commonProtocolVersion` returns no version

### Requirement: Declared capacity bounds
The `WorkerCapacity` schema SHALL bound `slots`, `cpuMillicores`, and `memoryMebibytes` to at most `2147483647`, the largest PostgreSQL `integer`, in both the OpenAPI and the AsyncAPI execution document.

#### Scenario: Enrollment above the bound
- **WHEN** an enrollment request declares a slot count, CPU, or memory above `2147483647`
- **THEN** the request body is invalid

#### Scenario: Capacity declaration above the bound
- **WHEN** a `worker.capacity.declared` observation declares a slot count, CPU, or memory above `2147483647`
- **THEN** the observation is invalid

#### Scenario: Largest value
- **WHEN** a capacity value is `2147483647`
- **THEN** the enrollment request and the observation are valid

### Requirement: Requested resource bounds
The `ResourceRequest` schema SHALL bound `cpuMillicores` and `memoryMebibytes` to at most `2147483647`, the largest PostgreSQL `integer`, in the AsyncAPI execution document. The per-attempt ceiling of the capacity reservation contract SHALL still apply.

#### Scenario: Offer above the bound
- **WHEN** an `execution.assignment.offer` command requests CPU or memory above `2147483647`
- **THEN** the command is invalid and validation names the field

#### Scenario: Largest requested value
- **WHEN** an offer requests CPU or memory of `2147483647`
- **THEN** the command is valid

### Requirement: Worker heartbeat
The AsyncAPI document SHALL define `WorkerHeartbeat` with `messageType` `worker.heartbeat`, `schemaVersion`, `protocolVersion`, `workerId`, `journalId`, and `sentAt`, and no other property. A heartbeat SHALL be outside the journal sequence and SHALL be neither confirmed nor deduplicated. Adding it SHALL raise the document's `info.version` to `0.4.0`.

#### Scenario: Capacity in a heartbeat
- **WHEN** a heartbeat also carries a capacity field
- **THEN** it fails its schema

#### Scenario: Missing journal
- **WHEN** a heartbeat has no `journalId`
- **THEN** it fails its schema
