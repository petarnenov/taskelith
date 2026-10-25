## Purpose

Define the execution wire contracts of G2: the AsyncAPI commands and observations between the control plane and a worker, the OpenAPI operations for enrollment, launch authorization, task results, and evidence, and the execution protocol version with which a worker fails closed.

## ADDED Requirements

### Requirement: Execution documents
`@taskelith/contracts` SHALL hold `documents/execution.asyncapi.json` (AsyncAPI 3.0.0) and `documents/execution.openapi.json` (OpenAPI 3.1.0), each with a semantic `info.version`. The rules that their schemas cannot express SHALL be stated in `docs/contracts/execution-wire-contracts.md`.

#### Scenario: Documents generated
- **WHEN** the build generates the contract types
- **THEN** it includes every schema and path of both execution documents

### Requirement: Worker channels
The AsyncAPI document SHALL define a command channel and an observation channel per installation and worker. The command channel SHALL carry the assignment offer, cancellation request, and assignment end commands and the observation confirmation. The observation channel SHALL carry every observation and the inventory report.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

### Requirement: Execution commands
Each execution command SHALL use the shared command envelope, SHALL require its attempt, worker, and ownership generation, SHALL fix its command type, and SHALL carry `payload.protocolVersion`. An offer SHALL carry the assignment, the recovery epoch, and its reservation with the requested resources. A cancellation SHALL carry its reason and MAY name one execution.

#### Scenario: Offer without attempt
- **WHEN** an offer omits `metadata.attemptId`
- **THEN** validation fails and names the field

#### Scenario: Command type of another command
- **WHEN** a cancellation envelope is validated as an offer
- **THEN** validation fails at the metadata command type

### Requirement: Observation envelope
Every observation SHALL carry a deterministic `observationId`, its fixed type, schema and protocol versions, `workerId`, `journalId`, and a positive `sequence`, and MAY carry its attempt and ownership generation.

#### Scenario: Observation without journal
- **WHEN** an observation omits `journalId`
- **THEN** validation fails and names the field

#### Scenario: Sequence zero
- **WHEN** an observation has sequence 0
- **THEN** validation fails at the sequence

### Requirement: Execution observations
The AsyncAPI document SHALL define observations for assignment acceptance and refusal, command rejection, non-retryable launch rejection, and the supervisor facts. The facts are `started`, `exited`, `not-started`, `uncertain`, `termination-unproven`, and `unrecorded-process`. It SHALL also define a cancellation that was not applied, capacity declaration, and admission pressure.

#### Scenario: Retryable launch rejection
- **WHEN** a launch rejection observation names `unavailable`
- **THEN** validation fails

#### Scenario: Exit code out of range
- **WHEN** an exit observation has exit code 256
- **THEN** validation fails

### Requirement: Confirmation and inventory
The AsyncAPI document SHALL define a cumulative confirmation of a positive `confirmedThrough` per worker and journal. It SHALL also define an inventory report of the held assignments and their executions' journal states, with the last journal sequence the report reflects.

#### Scenario: Empty confirmation
- **WHEN** a confirmation has `confirmedThrough` 0
- **THEN** validation fails

### Requirement: Wire vocabularies
The wire enumerations of refusal, non-retryable launch rejection, launch rejection, revocation, cancellation, and assignment end reasons, and of hard controls, SHALL equal the vocabularies of the execution and scheduling domains.

#### Scenario: Domain reason added
- **WHEN** a domain vocabulary gains a value the wire enumeration lacks
- **THEN** the package tests fail

### Requirement: Execution HTTP operations
The OpenAPI document SHALL define `enrollWorker`, `authorizeLaunch`, `readTaskResult`, `publishEvidence`, `readEvidence`, and `downloadEvidence`. Each SHALL declare its credential: an enrollment token, the worker credential, or the operator credential. Errors SHALL use the kernel failure shape.

#### Scenario: Worker in a launch request
- **WHEN** a launch authorization request names `workerId`
- **THEN** the request body is invalid

### Requirement: Launch authorization outcome
`authorizeLaunch` SHALL return the decision recorded for its `operationId` with status 200. The decision is a grant with its bound values, `ttlMilliseconds`, and `skewMilliseconds`, a rejection with its reason and retryability, a revoked grant with its revocation reason, or an expired grant. Status 503 SHALL mean that no decision was reached.

#### Scenario: Revocation for a non-revocation reason
- **WHEN** a revoked outcome names `operation-mismatch`
- **THEN** validation fails

### Requirement: Task result and evidence
`readTaskResult` SHALL return a pending result, or the outcome fact of the task's last ended attempt with the task's evidence records. An evidence record SHALL carry the fields of architecture section 8, a SHA-256 content digest, and its producer.

#### Scenario: Pending result with outcome
- **WHEN** a pending task result carries an outcome
- **THEN** validation fails

### Requirement: Protocol version
Every execution command, observation, and report SHALL carry a positive integer protocol version. `VersionedCommand` SHALL accept every command whose metadata is valid and whose payload names a version. The package SHALL export `EXECUTION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `supportsProtocolVersion`, and `commonProtocolVersion`.

#### Scenario: Later version
- **WHEN** a worker supporting version 1 receives an offer of version 2 with unknown payload fields
- **THEN** `VersionedCommand` accepts it, the version is unsupported, and the offer schema rejects it

#### Scenario: No common version
- **WHEN** the worker supports only version 1 and the control plane versions 2 to 3
- **THEN** `commonProtocolVersion` returns no version
