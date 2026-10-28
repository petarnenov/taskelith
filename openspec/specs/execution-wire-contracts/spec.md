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
The AsyncAPI document SHALL define a command channel, an observation channel, and a heartbeat channel per installation and worker. The command channel SHALL carry the offer, cancellation, assignment end, and session commands, the observation confirmation, the inventory request, and the credential rotation notice. The observation channel SHALL carry every observation and the inventory report. The heartbeat channel SHALL carry only the worker heartbeat, over core NATS without a stream.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

#### Scenario: Heartbeat channel
- **WHEN** the heartbeat channel address is resolved
- **THEN** it is `taskelith.<installationId>.workers.<workerId>.heartbeats`, and its only message is `worker.heartbeat`

#### Scenario: Session messages on the worker channels
- **WHEN** the channels of `execution.asyncapi.json` 0.9.0 are read
- **THEN** the command channel lists the three session commands and the notice, and the observation channel the twelve session and adoption observations

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
Every execution command, observation, and report SHALL carry a positive integer protocol version. `VersionedCommand` SHALL accept every command whose metadata is valid and whose payload names a version. The package SHALL export `EXECUTION_PROTOCOL_VERSION`, `SESSION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `supportsProtocolVersion`, and `commonProtocolVersion`.

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
The OpenAPI document SHALL define, since version 0.6.0, `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`, and, since 0.8.0, `openWorkerRelay`. It SHALL reuse the control-plane document's `browserSession` and `csrfToken` schemes and access failure schemas unchanged, and every operation with a path parameter SHALL answer 400 to an invalid one.

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

### Requirement: Credential rotation contracts
The AsyncAPI document SHALL define `worker.credentials.rotation-requested` on the command channel with the worker, the requested `credentialGeneration`, and the `deadline`, and no secret. The OpenAPI document SHALL define `renewWorkerCredentials` and `confirmWorkerCredentials` under the worker credential. A renewal request SHALL carry only the NKey public key and the SHA-256 of the bearer secret, and its answer the user JWT and the deadline.

#### Scenario: Notice with a secret
- **WHEN** a rotation notice carries a field beyond its schema, such as a bearer secret
- **THEN** validation fails

#### Scenario: Renewal with a secret
- **WHEN** a renewal request carries the bearer secret instead of its SHA-256
- **THEN** the request body is invalid

### Requirement: Session work at protocol version 2
Every session command, notice, and session observation SHALL require a protocol version of at least 2 (`SESSION_PROTOCOL_VERSION`). The control plane SHALL accept versions 1 and 2, keep sending G2 commands to a worker whose common version is 1, and send session work only to a worker whose common version is 2 or later. `EXECUTION_PROTOCOL_VERSION` SHALL stay 1 until the worker and the control plane execute version 2.

#### Scenario: Session command at version 1
- **WHEN** a turn delivery names protocol version 1
- **THEN** its schema rejects it at `/payload/protocolVersion`

#### Scenario: Version 1 worker receives a session command
- **WHEN** a worker whose window is 1 to 1 reads a turn delivery of version 2
- **THEN** `VersionedCommand` accepts it, the version is unsupported, and the worker rejects it with `execution.command.rejected`

### Requirement: Session binding of an offer
From protocol version 2 (`SessionProtocolVersion`), an assignment offer SHALL carry `session`, an `AssignmentSessionBinding` with the `sessionId`, the harness, the model and effort of the session, and an optional `resume` naming the native session ID and the next generation, absent for a new session; an offer of version 1 SHALL carry none. The binding SHALL carry no credential, which keeps its own HTTPS channel.

#### Scenario: Offer of version 2 without a session
- **WHEN** an assignment offer of protocol version 2 omits `session`
- **THEN** validation fails and names `session`

#### Scenario: Offer of version 1 with a session
- **WHEN** an assignment offer of protocol version 1 carries `session`
- **THEN** validation fails

#### Scenario: Binding with a secret
- **WHEN** a session binding carries a `secret` field
- **THEN** validation fails and names the field

### Requirement: Session commands
The command channel SHALL carry `session.turn.deliver`, `session.response.deliver`, `session.delegation-result.deliver`, and `execution.scm-credential.refreshed`, each in the command envelope with its attempt, worker, and ownership generation. A turn delivery SHALL carry the turn's identity, position, author, and recorded text and name the generation it is sent for; the control plane SHALL send one only for the turn that `nextDeliverableTurn` returns.

#### Scenario: Turn without its identity
- **WHEN** a turn delivery omits `turnId`
- **THEN** validation fails and names the field

#### Scenario: Turn of the host
- **WHEN** a turn delivery's author is the host with a delegation request key
- **THEN** the command is valid

### Requirement: Session command outcomes
Each session command SHALL have an outcome observation: a turn delivery `session.turn.delivered`, `session.turn.not-delivered` with `generation-not-running`, `port-refused`, or `turn-invalid`, or `session.turn.acceptance-unknown`; a response or delegation result `session.response.delivery-reported`; a notice an adoption or non-adoption. The control plane SHALL mint one `commandId` per turn and generation, and per consumed response.

#### Scenario: Generation ended before delivery
- **WHEN** the host receives a turn delivery for a generation that no longer runs
- **THEN** it reports `session.turn.not-delivered` with `generation-not-running` and the turn stays queued

### Requirement: Turn acceptance unknown report
When the host cannot tell whether the port accepted a turn, it SHALL report `session.turn.acceptance-unknown` at protocol version 2 with the turn's `sessionId`, `turnId`, `generation`, and `recoveryEpoch` and the reason `conflict`, `timeout`, or `crash`, and SHALL never submit the turn again. The control plane SHALL apply it through `recordTurnAcceptanceUnknown`, so that the turn becomes `outcome-unknown`, final and never resent.

#### Scenario: Turn ID already seen by the port
- **WHEN** `submitTurn` answers `conflict` for the delivered turn ID, naming no `runningTurnId` or another turn's
- **THEN** the host reports `session.turn.acceptance-unknown` with `conflict`, and the turn is never sent again

#### Scenario: Conflict reported as a refusal
- **WHEN** `session.turn.not-delivered` carries the reason `conflict`
- **THEN** validation fails

### Requirement: Running turn named on a repeated submission
When `submitTurn` fails with `conflict` or `precondition-failed` naming the submitted turn as `runningTurnId`, the harness accepted it, and the host SHALL report `session.turn.delivered`. A `conflict` that names no running turn or another one SHALL be reported as `session.turn.acceptance-unknown` with `conflict`.

#### Scenario: Own turn still running
- **WHEN** a resent turn delivery's `submitTurn` answers `conflict` with `runningTurnId` equal to its turn ID
- **THEN** the host reports `session.turn.delivered`, and the turn's requests and output are recorded

### Requirement: Generation stopped on unknown acceptance
When the host reports `session.turn.acceptance-unknown` while the turn's generation still runs, it SHALL first stop that generation with `closeSession`. No later turn SHALL be delivered in that generation, so no turn is delivered while an earlier turn of the same generation may still run.

#### Scenario: One turn at a time
- **WHEN** `submitTurn` times out while the turn's generation runs
- **THEN** the host closes the generation before it reports `session.turn.acceptance-unknown` with `timeout`, and the next queued turn is delivered only in the next generation

#### Scenario: Crash after the generation ended
- **WHEN** a restarted host finds a turn delivery journaled without its outcome and the generation already ended
- **THEN** it reports `session.turn.acceptance-unknown` with `crash` at once, and closes nothing

### Requirement: Generation stopped on a port refusal
When `submitTurn` fails with `not-found`, `unavailable`, or `precondition-failed` naming another turn as running or none, the host SHALL stop the generation with `closeSession` when it still runs and report `session.turn.not-delivered` with `port-refused`. The turn SHALL stay queued, and the control plane SHALL send it again in the next generation with a new command.

#### Scenario: Another turn running
- **WHEN** `submitTurn` fails with `precondition-failed` whose `runningTurnId` names another turn
- **THEN** the host closes the generation, reports `port-refused`, and the turn is delivered in the next generation

#### Scenario: Harness unavailable
- **WHEN** `submitTurn` fails with `unavailable`
- **THEN** the host closes the generation and reports `port-refused`, and the turn stays queued

### Requirement: Turn refused by the plugin
When the harness plugin returns `invalid` from `submitTurn`, the host SHALL report `session.turn.not-delivered` with `turn-invalid` and leave the generation running. The control plane SHALL apply it through `recordTurnRefused`, so that the turn becomes `refused`, final and never resent, and the next queued turn follows it in the same generation.

#### Scenario: Persistent invalid does not block later turns
- **WHEN** the plugin returns `invalid` for a turn on every submission
- **THEN** the turn is reported once with `turn-invalid`, becomes `refused`, and the session's next queued turn is delivered

### Requirement: Observations the timeline refuses
A session observation that the timeline refuses other than as a repeat, such as the outcome, a request, or the output of an `outcome-unknown` turn, SHALL be applied without effect: confirmed, recorded in the inbox and the cursor, and logged as evidence, so it never holds the producer's sequence.

#### Scenario: Output of a turn whose acceptance is unknown
- **WHEN** `session.output.appended` arrives for a turn that is `outcome-unknown`
- **THEN** it is confirmed and logged as evidence, the timeline is unchanged, and the next observation is applied

### Requirement: Responses from an approver
A response delivery SHALL name its responder with the timeline's `Responder`, a principal or a standing rule and never the host, and a standing rule SHALL give only a permission answer. It SHALL carry no `delegation-result` answer. The worker SHALL pass the answer to the port and decide none itself.

#### Scenario: Host as responder
- **WHEN** a response delivery names the host as responder
- **THEN** validation fails

#### Scenario: Standing rule answers input
- **WHEN** a response delivery carries an input answer from a standing rule
- **THEN** validation fails

### Requirement: Delegation result response command
When a delegation result becomes `ended`, a rejected delegation included, the control plane SHALL return it to the parent's open delegation request with `session.delegation-result.deliver`, carrying the ended `DelegationResult` of `readDelegationResult` unchanged. A result for an `expired` or `unresolved` request SHALL go to the resumed session as a host turn instead; one for an `answered` request SHALL be a repeat that sends nothing.

#### Scenario: Pending result
- **WHEN** a delegation result delivery carries a `pending` result
- **THEN** validation fails

#### Scenario: Rejected delegation
- **WHEN** `requestDelegation` rejects a delegation and its open request awaits the result
- **THEN** the control plane writes `session.delegation-result.deliver` with the `ended` result of outcome `rejected`

#### Scenario: Result for an answered request
- **WHEN** a delegation result arrives for a request that is `answered` with delivery `delivery-uncertain`
- **THEN** the control plane writes no command and no host turn

#### Scenario: Result schema shared with the read
- **WHEN** the execution messages and `execution.openapi.json` both define `DelegationResult`
- **THEN** the two definitions are equal

### Requirement: Refreshed SCM credential notice
A refreshed per-run SCM credential SHALL reach the worker only as `execution.scm-credential.refreshed`, naming the run, the credential, and the version that `fetchRunScmCredential` takes, and nothing else; the worker SHALL fetch that version over HTTPS. No execution message SHALL reach a secret schema.

#### Scenario: Notice with a secret
- **WHEN** a notice carries a `secret` or `authorization` field
- **THEN** validation fails and names the field

### Requirement: SCM credential adoption confirmation
After fetching a notified version, the worker SHALL pass it to every later workspace operation of the attempt and report `execution.scm-credential.adopted`. Item 21 SHALL end a version only once every attempt of the run that held it adopted it or a later one or no longer holds its ownership, decided serialized per run. A worker that keeps its current version SHALL report `execution.scm-credential.not-adopted` with `fetch-refused`, `superseded`, or `attempt-not-held`.

#### Scenario: Refused fetch
- **WHEN** the fetch of a notified version is refused
- **THEN** the worker keeps its current version and reports `execution.scm-credential.not-adopted` with `fetch-refused`

#### Scenario: Second attempt still holds the previous version
- **WHEN** two active attempts of a run hold its previous version and only one reports `execution.scm-credential.adopted`
- **THEN** item 21 keeps the previous version

### Requirement: Session observations
The observation channel SHALL carry, about an attempt, the generation start and end, turn delivered, not delivered, acceptance unknown, and ended, request recorded, response delivery reported, output appended, and limit signaled. Each SHALL have an `observationId` derived from its source, and the control plane SHALL apply each through its session timeline function. A turn's end SHALL carry a failure exactly when its outcome is `failed`.

#### Scenario: Failed turn without a failure
- **WHEN** `session.turn.ended` has outcome `failed` and no failure
- **THEN** validation fails

#### Scenario: Pending delivery report
- **WHEN** `session.response.delivery-reported` reports `pending`
- **THEN** validation fails

### Requirement: Session observation recovery epoch
Each session observation and each adoption or non-adoption SHALL carry `recoveryEpoch`. Before its effect, the control plane SHALL keep one whose epoch differs from the current epoch, or that arrives in restore quarantine, as evidence for quarantine reconciliation only, changing no timeline, inbox, output, or credential state and ending no secret, as launch authorization section 7 states for the other execution observations.

#### Scenario: Observation without its epoch
- **WHEN** `session.turn.delivered` omits `recoveryEpoch`
- **THEN** validation fails and names the field

#### Scenario: Observation from before a restore
- **WHEN** `session.request.recorded` arrives with an epoch older than the current one
- **THEN** the control plane keeps it as evidence and records no request

### Requirement: Classified permission request
`session.request.recorded` SHALL carry the port's optional classified `operation`, a `push` with its full branch ref, only for a permission request. The control plane SHALL match a `push-to-task-branch` standing rule only for a `push` to the task's branch, checked in the use transaction; an unclassified request SHALL match no rule.

#### Scenario: Operation on an input request
- **WHEN** an input request's `session.request.recorded` carries `operation`
- **THEN** validation fails

#### Scenario: Push to another branch
- **WHEN** a permission request is classified as a `push` to a ref other than the task's branch
- **THEN** no standing rule answers it

### Requirement: Worker relay connection
`openWorkerRelay` SHALL upgrade `GET /workers/relay` to the worker's one outbound WebSocket under the worker's own credential, checking no operator role, with the subprotocol `taskelith.relay.v1`, answering 422 `protocol-not-supported` below protocol version 2. It SHALL carry only the relay frames of `terminal.asyncapi.json`, multiplexed by `terminalId`, never a command, an observation, or a credential.

#### Scenario: Relay under the worker credential
- **WHEN** a worker opens the relay with its worker credential
- **THEN** the control plane authenticates that credential and checks no operator role

#### Scenario: Version 1 worker opens the relay
- **WHEN** a worker whose common protocol version is 1 opens the relay
- **THEN** the answer is 422 with reason `protocol-not-supported`

#### Scenario: Refused terminal open
- **WHEN** the worker receives `relay.terminal.open` for an attempt it does not hold at that ownership generation
- **THEN** it answers `relay.terminal.refused` with `attempt-not-held` and opens nothing

### Requirement: Terminal start failure
When its checks pass but `terminalProgram` fails with `internal` or `unavailable`, or the pseudo-terminal does not start, the worker SHALL answer `relay.terminal.refused` with `terminal-start-failed`, naming no error text. The control plane SHALL then end the client's terminal with reason `refused` and that refusal, and close the connection with `terminal-ended`.

#### Scenario: Harness cannot describe the terminal
- **WHEN** `terminalProgram` fails with `unavailable` after the open's checks passed
- **THEN** the worker answers `relay.terminal.refused` with `terminal-start-failed`

### Requirement: Terminal frames document
`@taskelith/contracts` SHALL hold `documents/terminal.asyncapi.json` (AsyncAPI 3.0.0) with the browser terminal and worker relay frames, generated with the other documents. Its channels SHALL have no address and name the HTTP operation that upgrades them, so that no path is defined in two documents.

#### Scenario: Frames generated
- **WHEN** the build generates the contract types
- **THEN** they include every frame schema of the terminal document

### Requirement: No secret on the worker wire
No command, observation, or frame SHALL carry a credential, a secret, or an `Authorization` value, and no contract document SHALL carry an example. Session text and terminal output SHALL be redacted on the worker before they leave the host; terminal input, output, and the attach's CSRF token SHALL never be logged, recorded, journaled, published to the broker, or sent on an event stream.

#### Scenario: Examples in a message document
- **WHEN** the execution or terminal message document is read
- **THEN** it holds no `example` or `examples` keyword
