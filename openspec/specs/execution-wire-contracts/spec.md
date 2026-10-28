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
The AsyncAPI document SHALL define observations for assignment acceptance and refusal, command rejection, non-retryable launch rejection, and the supervisor facts. The facts are `started`, `exited`, `not-started`, `uncertain`, `termination-unproven`, and `unrecorded-process`. It SHALL also define a cancellation that was not applied, capacity declaration, and admission pressure. Each fact and unapplied cancellation SHALL carry its recovery epoch.

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

#### Scenario: Fact without its epoch
- **WHEN** an exit, `not-started`, `uncertain`, `termination-unproven`, unrecorded process, or unapplied cancellation omits `recoveryEpoch`
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
The OpenAPI document SHALL define `enrollWorker`, `authorizeLaunch`, `requestDelegation`, `readTaskResult`, `publishEvidence`, `readEvidence`, `downloadEvidence`, `readInstallationCa`, and the operations of "G3 execution operations", each with its credential: an enrollment token, the worker credential, the operator credential, or the browser session; only `readInstallationCa`, which answers the public installation CA certificate, SHALL declare none. Errors SHALL use the kernel failure shape.

#### Scenario: Parent in a delegation request
- **WHEN** a delegation request names `parentTaskId`
- **THEN** the request body is invalid

#### Scenario: Worker in a launch request
- **WHEN** a launch authorization request names `workerId`
- **THEN** the request body is invalid

#### Scenario: Key material in the installation CA answer
- **WHEN** an `InstallationCa` answer holds a PEM private-key block
- **THEN** the answer is invalid

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

### Requirement: Recovery termination evidence
In document version 0.5.0, an `execution.exited` observation that is not a spawn failure SHALL also accept the termination evidence `boot-changed` and `namespace-ended`, which only recovery on start proves, with status `unknown`.

#### Scenario: Exit proven by a changed boot
- **WHEN** an exit observation reports `boot-changed` with status `unknown` and an unproven start
- **THEN** validation succeeds

#### Scenario: Recovery evidence with a known status
- **WHEN** an exit observation reports `boot-changed` or `namespace-ended` with an exit code or a signal
- **THEN** validation fails

### Requirement: G3 execution operations
The OpenAPI document, at version 0.6.0, SHALL define `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`. It SHALL reuse the `browserSession` and `csrfToken` schemes and the access failure schemas of the control-plane document unchanged, and every operation with a path parameter SHALL answer 400 to an invalid one.

#### Scenario: Session scheme redefined
- **WHEN** the execution document defines `browserSession` differently from the control-plane document
- **THEN** contract generation fails and names the scheme

#### Scenario: Retirement with a session and no CSRF token
- **WHEN** a principal calls `retireEvidence` with the session cookie and without the `X-CSRF-Token` header
- **THEN** the answer is 403 with reason `csrf-token-invalid` and the record is unchanged

### Requirement: Per-project evidence reads
`readEvidence` and `downloadEvidence` SHALL accept the browser session or the operator bearer and SHALL serve a record only to a `project-viewer` or above on its project or to an `installation-owner`. Any other principal SHALL get the 404 of an unknown record, as SHALL a download whose record was retired between the reads of the record and of its content. The document SHALL declare this narrowing with a new minor version.

#### Scenario: Viewer of another project
- **WHEN** a `project-viewer` of one project reads an evidence record of another project
- **THEN** the answer is 404, as for an unknown record

#### Scenario: Viewer of the record's project
- **WHEN** a `project-viewer` of the record's project downloads its content
- **THEN** the content whose digest is the record's `contentDigest` is served

#### Scenario: Reader without a role
- **WHEN** a principal with no role on any project and no installation role reads an evidence record
- **THEN** the answer is 404, as for an unknown record, and nothing of the record is disclosed

#### Scenario: Download during retirement
- **WHEN** a record is retired after a download read it and before the download read its content
- **THEN** the download answers 404, as for an unknown record, not 500

### Requirement: Evidence retirement
`retireEvidence` SHALL let a `project-maintainer` of the record's project remove a record 365 days after its publication (`publishedAt`), and its content once no record refers to the digest. Before then it SHALL answer 422 `retention-not-elapsed` with the `Instant` `details.retainedUntil` and change nothing; a retired or unknown record SHALL answer 404. Once the record is removed it SHALL answer 204, a failed content removal left to a sweep of unreferenced digests.

#### Scenario: Retirement within the retention
- **WHEN** a maintainer retires a record published 30 days ago
- **THEN** the answer is 422 with reason `retention-not-elapsed` and `details.retainedUntil`, and the record stays

#### Scenario: Old capture published recently
- **WHEN** a maintainer retires a record captured 400 days ago and published 30 days ago
- **THEN** the answer is 422 with reason `retention-not-elapsed` and `details.retainedUntil` 365 days after its publication, and the record stays

#### Scenario: Refusal without a retention end
- **WHEN** a retention refusal lacks `details.retainedUntil` or holds one that is not an instant
- **THEN** validation fails

#### Scenario: Second retirement
- **WHEN** two retirements of the same record run after its retention
- **THEN** one answers 204 and the other 404

#### Scenario: Content removal fails
- **WHEN** a retirement removes the record and the removal of its unreferenced content then fails
- **THEN** the answer is 204, the record stays retired, and the content is left to the sweep of unreferenced digests

#### Scenario: Reader below maintainer
- **WHEN** a `project-viewer` of the record's project retires it
- **THEN** the answer is 403 with reason `role-required` and the record stays

### Requirement: Delegation result read
`readDelegationResult` SHALL answer `pending` until the delegation ends, then `ended` with its outcome, `completed`, `rejected`, `failed`, or `cancelled`, its summary of at most 65,536 characters, and its end time. Only the worker that holds the active attempt of the parent task at the task's current ownership generation SHALL read it; any other worker SHALL get 404.

#### Scenario: Pending result with an outcome
- **WHEN** a pending delegation result carries an outcome
- **THEN** validation fails

#### Scenario: Another worker reads the result
- **WHEN** a worker that holds no attempt of the parent task reads the delegation result
- **THEN** the answer is 404, as for an unknown delegation

### Requirement: Reconciliation queue reads
`listUnknownExecutions` SHALL list a project's unknown executions, each with all its evidence, to a `project-viewer` or above on it or an `installation-owner`, and `listUnrecordedProcesses` the unrecorded processes to an `installation-owner` only. Each SHALL return at most 100 items with a `next` position while more remain, by task then execution identifier, or by worker then observation identifier.

#### Scenario: Page over the bound
- **WHEN** a page holds 101 unknown executions
- **THEN** validation fails

#### Scenario: Page boundary between equal execution identifiers
- **WHEN** a page ends with execution `e1` of task `t1` and task `t2` also has an unknown execution `e1`
- **THEN** `next` names task `t1` and execution `e1`, and the next page starts with execution `e1` of task `t2`

#### Scenario: Only a cancellation that was not applied
- **WHEN** an unknown execution's evidence holds only `cancellation-not-applied` entries
- **THEN** validation fails

#### Scenario: Long evidence history
- **WHEN** an unknown execution holds 65 evidence entries
- **THEN** the answer lists all 65

#### Scenario: Maintainer reads unrecorded processes
- **WHEN** a `project-maintainer` without an installation role lists the unrecorded processes
- **THEN** the answer is 403 with reason `role-required`

### Requirement: Task re-admission
`readmitTask` SHALL let a `project-operator` or above on the project named in the query, checked before the task is read, re-admit a task at its next ownership generation by compare-and-set on the generation read, answering 409 when it moved. A repeat with the same `readmissionId` and input SHALL return the first 201. It SHALL refuse with 422 `attempt-active`, `admission-not-dispatched`, or `admission-refused`, in that order, and change nothing.

#### Scenario: Attempt with an unknown execution
- **WHEN** an operator re-admits a task whose attempt has an unknown execution
- **THEN** the answer is 422 with reason `attempt-active`

#### Scenario: Concurrent re-admissions
- **WHEN** two operators re-admit the same task with different `readmissionId` values, naming the same generation
- **THEN** exactly one answers 201 and the other 409

#### Scenario: Repeated re-admission
- **WHEN** an operator repeats a re-admission with the same `readmissionId` and input after a lost response
- **THEN** the answer is the first 201 with the same admission, and nothing else changes

#### Scenario: Principal without a role on the project
- **WHEN** a principal without a role on the named project re-admits a task, whether the task exists or not
- **THEN** the answer is 403 with reason `role-required` and nothing of the task is disclosed

### Requirement: Slot credential delivery
`fetchSlotCredential` SHALL deliver the credential of a slot that the reservation of the execution's attempt names, at its first fetch after the launch authorization and at every later one, to the worker that owns the execution. Every delivery SHALL carry the version that the slot record names, and `LaunchGrant` SHALL carry no credential.

#### Scenario: First fetch after the launch authorization
- **WHEN** the owning worker fetches the slot credential of an execution for the first time after its launch authorization
- **THEN** the answer carries the slot's current credential version, and the launch grant carried none

#### Scenario: Later fetch re-delivers the version
- **WHEN** the owning worker fetches the slot credential of the same execution again after it adopted the execution
- **THEN** the answer carries the same credential version as the first fetch

### Requirement: Slot credential delivery checks
A delivery SHALL follow the checks of account pool contract section 7.3, refusing with 422 and the reason of the first failing one, an unknown attempt or execution as `assignment-not-active` after the installation and worker checks. An `authorized` execution with no earlier delivery SHALL also hold a launch grant that is unexpired and not `revoked` (section 7), or be refused with `execution-conflict`; for any other execution the ownership checks of section 7.3 stand in.

#### Scenario: Expired grant at the first fetch
- **WHEN** the owning worker first fetches the slot credential of an `authorized` execution after its launch grant expired
- **THEN** the answer is 422 with reason `execution-conflict` and nothing is revealed

#### Scenario: Unknown execution
- **WHEN** an authorized worker at the current recovery epoch fetches a slot credential for an execution that its attempt does not have
- **THEN** the answer is 422 with reason `assignment-not-active`, not 404, and nothing is revealed

#### Scenario: Slot outside the reservation
- **WHEN** the owning worker fetches the credential of a slot that the reservation of the execution's attempt does not name
- **THEN** the answer is 422 with reason `capacity-not-reserved` and nothing is revealed

#### Scenario: Revoked slot
- **WHEN** an adopted `started` execution fetches the credential of its slot after an operator revoked the slot, which cancelled its attempt
- **THEN** the answer is 422 with reason `attempt-not-launchable`, the earlier check of account pool contract section 7.3, and nothing is revealed

### Requirement: Per-run SCM credential delivery
`issueRunScmCredential` SHALL return the run's current SCM credential version, issuing the first, serialized per run, if it has none, or refusing with `credential-ended` when a revocation or expiry ended it; `fetchRunScmCredential` SHALL return the version a refresh notice names, written once. Both SHALL serve only a worker holding an attempt of a task of the run, refusing others, an unknown run included, with 422 and the reason of launch authorization contract section 9.

#### Scenario: Repeated issue
- **WHEN** the worker of an attempt calls `issueRunScmCredential` twice for the same run, with no refresh between
- **THEN** both answers carry the same credential version

#### Scenario: Refresh between two issues
- **WHEN** the run's credential is refreshed between two calls of `issueRunScmCredential`
- **THEN** the second answer carries the refreshed version

#### Scenario: Concurrent first issues
- **WHEN** two workers of the run call `issueRunScmCredential` at once and the run has no credential
- **THEN** one credential is issued, both answers carry its version 1, and no other secret exists

#### Scenario: Unknown run
- **WHEN** an authorized worker at the current recovery epoch asks for the SCM credential of an unknown run
- **THEN** the answer is 422 with reason `assignment-not-active`, not 404, and nothing is issued

#### Scenario: Issue after revocation
- **WHEN** the worker calls `issueRunScmCredential` again after the run's credential was revoked
- **THEN** the answer is 422 with reason `credential-ended` and nothing is issued or revealed

#### Scenario: Ended version
- **WHEN** a worker fetches a version whose secret a refresh ended
- **THEN** the answer is 422 with reason `credential-ended` and nothing is revealed

### Requirement: Remote re-check at SCM credential delivery
Each SCM credential issue and fetch SHALL, after the ownership checks of launch authorization contract section 9, re-check the project's binding against the SCM integration's current allowed origin and refuse with 422 and the first failing reason of `repository-unbound`, `remote-not-https`, `remote-userinfo`, `remote-query`, `remote-fragment`, and `remote-origin-mismatch`, then `credential-ended`, issuing and revealing nothing and recording the reason without a URL or secret.

#### Scenario: Origin narrowed after binding
- **WHEN** an installation owner changes the integration's allowed origin so that the bound remote URL lies outside it, and a worker then fetches the run's credential
- **THEN** the answer is 422 with reason `remote-origin-mismatch`, nothing is revealed, and the reason is recorded

#### Scenario: Project without a binding
- **WHEN** a worker asks for the SCM credential of a run whose project has no repository binding
- **THEN** the answer is 422 with reason `repository-unbound`

#### Scenario: Bound remote not HTTPS
- **WHEN** the stored remote URL of the binding is not HTTPS
- **THEN** the answer is 422 with reason `remote-not-https`

#### Scenario: Bound remote with user information
- **WHEN** the stored remote URL of the binding holds user information
- **THEN** the answer is 422 with reason `remote-userinfo`, and neither its body nor the recorded reason holds the URL or its user information

#### Scenario: Ownership before the binding
- **WHEN** a worker without an attempt of the run asks for its SCM credential while the project has no repository binding
- **THEN** the answer is 422 with reason `assignment-not-active`, not `repository-unbound`

#### Scenario: Bound remote with a query
- **WHEN** the stored remote URL of the binding holds a query
- **THEN** the answer is 422 with reason `remote-query`

#### Scenario: Bound remote with a fragment
- **WHEN** the stored remote URL of the binding holds a fragment
- **THEN** the answer is 422 with reason `remote-fragment`

### Requirement: Credential deliveries never kept
`fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential` SHALL be the only operations of the document whose responses carry a secret. Each SHALL answer with `Cache-Control: no-store`, and no request log SHALL hold their response bodies.

#### Scenario: Cacheable delivery
- **WHEN** a credential delivery response lacks `Cache-Control: no-store`
- **THEN** the package tests fail
