## MODIFIED Requirements

### Requirement: Worker channels
The AsyncAPI document SHALL define a command channel, an observation channel, and a heartbeat channel per installation and worker. The command channel SHALL carry the assignment offer, cancellation request, and assignment end commands, the observation confirmation, and the session commands. The observation channel SHALL carry every observation and the inventory report. The heartbeat channel SHALL carry only the worker heartbeat, over core NATS without a stream.

#### Scenario: Channel per worker
- **WHEN** a channel address is resolved
- **THEN** it names the installation and the worker

#### Scenario: Heartbeat channel
- **WHEN** the heartbeat channel address is resolved
- **THEN** it is `taskelith.<installationId>.workers.<workerId>.heartbeats`, and its only message is `worker.heartbeat`

#### Scenario: Session messages on the worker channels
- **WHEN** the channels of `execution.asyncapi.json` 0.8.0 are read
- **THEN** the command channel lists the three session commands and the notice, and the observation channel the twelve session and adoption observations

### Requirement: Protocol version
Every execution command, observation, and report SHALL carry a positive integer protocol version. `VersionedCommand` SHALL accept every command whose metadata is valid and whose payload names a version. The package SHALL export `EXECUTION_PROTOCOL_VERSION`, `SESSION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `supportsProtocolVersion`, and `commonProtocolVersion`.

#### Scenario: Later version
- **WHEN** a worker supporting version 1 receives an offer of version 2 with unknown payload fields
- **THEN** `VersionedCommand` accepts it, the version is unsupported, the offer schema rejects it, and a command rejection naming only its `commandId` and type is valid

#### Scenario: No common version
- **WHEN** the worker supports only version 1 and the control plane versions 2 to 3
- **THEN** `commonProtocolVersion` returns no version

### Requirement: G3 execution operations
The OpenAPI document SHALL define, since version 0.6.0, `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`, and, since 0.7.0, `openWorkerRelay`. It SHALL reuse the control-plane document's `browserSession` and `csrfToken` schemes and access failure schemas unchanged, and every operation with a path parameter SHALL answer 400 to an invalid one.

#### Scenario: Session scheme redefined
- **WHEN** the execution document defines `browserSession` differently from the control-plane document
- **THEN** contract generation fails and names the scheme

#### Scenario: Retirement with a session and no CSRF token
- **WHEN** a principal calls `retireEvidence` with the session cookie and without the `X-CSRF-Token` header
- **THEN** the answer is 403 with reason `csrf-token-invalid` and the record is unchanged

## ADDED Requirements

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
Each session command SHALL have an outcome observation: a turn delivery `session.turn.delivered`, `session.turn.not-delivered` with `generation-not-running` or a `port-refused` that proves non-acceptance, leaving the turn queued, or `session.turn.acceptance-unknown`; a response or delegation result `session.response.delivery-reported`; a notice an adoption or non-adoption. The control plane SHALL mint one `commandId` per turn and generation, and per consumed response.

#### Scenario: Generation ended before delivery
- **WHEN** the host receives a turn delivery for a generation that no longer runs
- **THEN** it reports `session.turn.not-delivered` with `generation-not-running` and the turn stays queued

### Requirement: Turn acceptance unknown report
When the host cannot tell whether the port accepted a turn, it SHALL report `session.turn.acceptance-unknown` at protocol version 2 with the turn's `sessionId`, `turnId`, `generation`, and `recoveryEpoch` and the reason `conflict`, `timeout`, or `crash`, and SHALL never submit the turn again. The control plane SHALL apply it through `recordTurnAcceptanceUnknown`, so that the turn becomes `outcome-unknown`, final and never resent.

#### Scenario: Turn ID already seen by the port
- **WHEN** `submitTurn` answers `conflict` for the delivered turn ID
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
`openWorkerRelay` SHALL upgrade `GET /workers/relay` to the worker's one outbound WebSocket with the worker credential and the subprotocol `taskelith.relay.v1`, answering 422 `protocol-not-supported` below protocol version 2. It SHALL carry only the relay frames of `terminal.asyncapi.json`, multiplexed by `terminalId`, never a command, an observation, or a credential.

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
