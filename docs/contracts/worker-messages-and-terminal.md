# Worker messages and terminal wire contracts

Date: 2026-10-28. Status: proposed wire contract for G3 ([G3 work plan](../g3-plan.md) item 9, sub-change 9d `define-worker-messages-and-terminal-contracts`), under independent review. It states the rules of the execution protocol version 2 messages, the notice of a refreshed per-run SCM credential, and the web terminal that the documents' schemas cannot express. The documents are the source of the field definitions; this page never repeats a field list. This sub-change adds no adapter, handler, or runtime: items 13, 18, 21, 38, 39, and 40 implement it.

## 1. Documents

| Document | Version | What 9d adds |
| --- | --- | --- |
| [`execution.asyncapi.json`](../../packages/contracts/documents/execution.asyncapi.json) | 0.8.0 | The session commands, the refreshed SCM credential notice, and the offer's session binding on the worker's command subject; the session observations and the adoption confirmation on its observation subject (sections 3 to 6) |
| [`terminal.asyncapi.json`](../../packages/contracts/documents/terminal.asyncapi.json) | 0.1.0 | New: the frames of the browser terminal WebSocket and of the worker relay connection (sections 7 and 8) |
| [`control-plane.openapi.json`](../../packages/contracts/documents/control-plane.openapi.json) | 0.3.0 | `openTerminal`, the terminal WebSocket upgrade, with `TerminalRefusal` (section 7) |
| [`execution.openapi.json`](../../packages/contracts/documents/execution.openapi.json) | 0.7.0 | `openWorkerRelay`, the worker's relay upgrade, with `RelayRefusal` (section 8) |

The build generates `terminal.asyncapi.json` with the other documents. The messages reuse, unchanged, the session schemas that [control-plane wire contracts](control-plane-wire-contracts.md) section 9 names, `Responder`, `TurnAuthor`, `TimelinePosition`, and `ExternalId` of the control-plane document, and `DelegationResult` and `DelegationSummary` of the execution document ([execution wire contracts](execution-wire-contracts.md) section 8.3); the terminal frames reuse `Identifier`, `Generation`, `AgentSessionId`, `AgentSessionGeneration`, and `CsrfToken`. A name that several documents define names the same schema, which the generator and the package tests check. The terminal channels have no address: each names the HTTP operation that upgrades it, so no path is defined in two documents. No document carries an example, so no example can hold a secret.

## 2. Protocol version 2

[Execution wire contracts](execution-wire-contracts.md) section 3 requires the next protocol version for a change that a worker of the current version could not execute. The session commands, the notice, and the session observations are such a change, so they are execution protocol version 2 (`SESSION_PROTOCOL_VERSION`).

- **Version 1 stays accepted.** The control plane supports versions 1 and 2, its current and its previous version (section 3 there, "Compatibility window"), and keeps sending the G2 commands to a worker whose common version is 1 (architect, 2026-10-28).
- **Session work only to version 2.** The control plane writes a session command or a notice only for a worker whose common version (`commonProtocolVersion`) is 2 or later, and places an assignment whose attempt runs an agent session only on such a worker. Each session command, notice, and session observation requires a protocol version of at least 2 (`SessionProtocolVersion`), so a version 1 worker that receives one by mistake reads it as `VersionedCommand`, fails closed, and rejects it with `execution.command.rejected`.
- **Session binding of the offer.** From protocol version 2 an assignment offer binds its attempt to its agent session (`AssignmentSessionBinding`), and at version 1 it carries none (architect, 2026-10-28). The binding names the session by `sessionId`, the stable identity that [ADR 0013](../decisions/0013-intents-campaigns-and-proposal-graphs.md) "Forward-compatibility obligations" keeps the read models on; the harness plugin, which never changes for the session; and the model and effort the session runs with, which [ADR 0014](../decisions/0014-decision-council-and-delegated-approval.md) "Forward-compatibility obligations" requires per session and [G3 plan](../g3-plan.md) items 18 and 19 implement; the port's start and resume requests do not take them yet. A `resume` names the native session ID and the next generation of an ended session, as `resumeSession` takes them ([agent harness port](agent-harness-port.md) section 5); without it the attempt starts a new session at generation 1. The binding carries no credential (section 10). Item 18 implements it on the worker.
- **The build.** `EXECUTION_PROTOCOL_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` stay at 1 until the worker executes version 2: item 18 raises the worker's window to 1 to 2, and item 13 the control plane's, so that no build declares a version it cannot execute.

## 3. Session commands

Each command is a `CommandMetadata` envelope with its attempt, worker, and ownership generation, as every execution command ([execution wire contracts](execution-wire-contracts.md) section 4). The worker journals it in its inbox and acknowledges it only after its outcome observation committed ([worker journal](worker-journal.md) W1).

| Command | `commandType` | Written by | Outcome observation |
| --- | --- | --- | --- |
| Turn delivery | `session.turn.deliver` | The session timeline service (item 13), for the turn that `nextDeliverableTurn` returns, in the running generation | `session.turn.delivered` or `session.turn.not-delivered` |
| Response delivery | `session.response.deliver` | The transaction that consumes a person's or a standing rule's answer (`consumeResponse`, [session timeline](session-timeline.md) section 5.2) | `session.response.delivery-reported` |
| Delegation result delivery | `session.delegation-result.deliver` | The transaction that consumes the host's answer to an open delegation request when its delegation result became `ended`, also when `requestDelegation` rejected it (item 38) | `session.response.delivery-reported` |
| Refreshed SCM credential notice | `execution.scm-credential.refreshed` | The refresh of a run's credential (item 21), once per attempt of the run that a version 2 worker holds | `execution.scm-credential.adopted` or `execution.scm-credential.not-adopted` |

- **Serialized delivery.** The control plane sends a turn delivery only for the turn that `nextDeliverableTurn` returns, so at most one turn per session is in flight, in position order ([session timeline](session-timeline.md) section 4.2). The command names the generation it is sent for; the host delivers the turn only in that generation while it runs, and otherwise reports `session.turn.not-delivered` with `generation-not-running`. A port refusal reports `port-refused`. Either way the turn stays `queued`, and the control plane sends it again in the next generation with a new command.
- **Stable identities.** A turn travels with its `turnId`, position, author, and recorded text, which never change (session timeline section 4.1); a response and a delegation result name their request by `NativeRequestKey`, its generation and native request ID, so an answer never reaches a later generation's request that reuses the ID (section 5.3 there). The control plane mints one `commandId` per turn and generation, and per consumed response, stores it with the record, and reuses it when it sends the same command again, so that the worker's inbox makes a resend idempotent; the port's turn ID and single response make a second delivery a `conflict` that changes nothing ([agent harness port](agent-harness-port.md) sections 6 and 7.3).
- **Text.** A command carries the turn's or the answer's recorded text, which the control plane redacted before it recorded it ([control-plane wire contracts](control-plane-wire-contracts.md) section 7), never the text as typed.

## 4. Responses come from an approver

- **Responder.** A response delivery names who answered with the timeline's `Responder`: a principal or a standing rule, never the host; a standing rule gives only a permission answer ([product ports](product-ports.md) section 5), and the schema rejects any other combination. The worker passes the answer to the port and never decides one itself. This keeps runtime approval behind the approver of [ADR 0013](../decisions/0013-intents-campaigns-and-proposal-graphs.md) ("Approval of a stage runs through an approver port or decision body, not a hard-coded human call") and [ADR 0014](../decisions/0014-decision-council-and-delegated-approval.md): a later kind of responder, such as a council decision, is a new `Responder` variant in a later protocol version, not a new command.
- **No delegation answer from a person.** The response command rejects a `delegation-result` answer; only the delegation result command carries one.

## 5. Delegation results

The read `readDelegationResult` is 9c's ([execution wire contracts](execution-wire-contracts.md) section 8.3); the response command is this one.

- **Command.** When a delegation result becomes `ended`, because its child task ended or because `requestDelegation` rejected the delegation with the outcome `rejected` and no child ran ([execution wire contracts](execution-wire-contracts.md) section 8.3), item 38 consumes the host's answer to the parent's open delegation request (responder `host`, answer `delegation-result`) and writes `session.delegation-result.deliver` with the ended `DelegationResult`, unchanged from 9c, to the worker that holds the parent's active attempt. The schema admits only an `ended` result. The host passes `delegationId`, `outcome`, and `summary` to the port's `respond` and reports the delivery once, as for any response.
- **Expired or unresolved.** When the parent's request is `expired` or `unresolved`, and only then, the result goes to the resumed session as a host turn instead (session timeline section 4.1; agent harness port section 7.4): a `session.turn.deliver` whose author is the host with the delegation request.
- **Already answered.** When the request is `answered`, whatever its delivery report, `delivery-uncertain` included, a result for it is a repeat: `consumeResponse` fails with `conflict` and the first response stays (session timeline section 5.2), so item 38 writes no command and no host turn, and nothing is resent (section 5.4 there).
- **After a restart.** The host learns a result it missed through the 9c read and never answers a request that the timeline did not mark answered.

## 6. Refreshed SCM credential

The architect decided on 2026-10-28 that a refreshed per-run SCM credential travels as a notice only, and [account pool contract](account-pool.md) section 7 already requires that a credential never travels in a broker message or stream, which would keep it at rest in the broker.

- **Notice.** `execution.scm-credential.refreshed` names the run, the credential, and the version, exactly what `fetchRunScmCredential` takes ([execution wire contracts](execution-wire-contracts.md) section 8.7), and nothing else; no message of the document reaches a secret schema, which a test checks.
- **Fetch.** On the notice the worker fetches that version over HTTPS with its worker credential and the attempt it holds; the fetch makes the ownership checks and the remote re-check of section 8.7 there.
- **Adoption.** Once the fetch returned the version, the worker passes it to every later workspace operation of the attempt ([git workspace contract](git-workspace.md) section 7) and reports `execution.scm-credential.adopted` with the run, credential, and version. Item 21 ends the previous secret only after the run confirmed adoption, under the port revision of item 20 ([source control contract](source-control.md) section 3).
- **Run-wide end.** A run's credential belongs to the run, so the attempts of its tasks share it (execution wire contracts section 8.7), and one attempt's confirmation never ends a version another attempt still holds. Item 21 ends a version only once every attempt of the run that held it confirmed `adopted` for that version or a later one, or no longer holds its ownership: it ended, was cancelled, or a later ownership generation replaced it. An attempt that starts after the refresh gets the current version from `issueRunScmCredential` and never held the previous one. Item 21 decides it serialized per run, by the lock or unique key of the run's credential that the first issue takes (section 8.7 there), after each refresh, adoption, attempt end, and ownership change of the run, so that none of them interleaves with the decision.
- **No adoption.** The worker reports `execution.scm-credential.not-adopted` and keeps its current version when the fetch is refused (`fetch-refused`), when it adopted a later version first (`superseded`), or when it no longer holds the attempt (`attempt-not-held`). A transport failure of the fetch is retried with the same notice until the attempt ends.

## 7. Terminal WebSocket

`openTerminal` upgrades `GET /projects/{projectId}/agent-sessions/{sessionId}/terminal` to a WebSocket with the subprotocol `taskelith.terminal.v1` (architect, 2026-10-28: the upgrade in OpenAPI, the frames in `terminal.asyncapi.json`). It attaches to the terminal of the session's active bound attempt, the D18 (a) terminal that item 39 runs with node-pty inside the attempt's process set.

- **Credentials.** The session cookie `browserSession` or the operator bearer `operatorToken`, the schemes of [control-plane wire contracts](control-plane-wire-contracts.md) section 2. A browser cannot send the `X-CSRF-Token` header on a WebSocket handshake, so CSRF protection takes two parts: a cookie-authenticated upgrade whose `Origin` is not the installation's origin answers 403 `CsrfRejection` with `csrf-token-invalid`, and its first frame, `terminal.attach`, carries the session's CSRF token (`CsrfToken`), compared in constant time; a wrong or missing token closes the connection with `csrf-token-invalid` before anything is relayed. A bearer connection sends no token.
- **Order.** The control plane authenticates (401 `AuthenticationFailure`), checks the `Origin` of a cookie upgrade (403 `CsrfRejection`), and checks the role before it reads the session (403 `AccessDenial`, `role-required`), so a caller without the role learns nothing about the session. Then a session that is not of the project answers 404, and 422 `TerminalRefusal` answers `attempt-not-current` when the attempt, ownership generation, or session generation in the query is not the session's active bound attempt and running generation, and then `terminal-not-offered` when the harness declares no terminal, the worker runs on macOS, where no terminal is offered yet ([agent harness port](agent-harness-port.md) section 8), or the worker's common protocol version is below 2. 503 answers when the worker's relay connection is not open. 400 answers an invalid path or query parameter or handshake header. No revision can conflict, so there is no 409.
- **Role.** `project-operator` or above on the project, as for turns ([trust model](../trust-model.md#3-project-scoped-authorization-roles) section 3, "interact with sessions/turns"); an `installation-owner` needs a project role, as for `submitTurn` (control-plane section 3).
- **One terminal per attempt, one client.** The attempt has at most one terminal, which the first attach opens; a later attach reattaches to it. At most one client is attached: a new attach closes the previous connection with `superseded`. `terminal.attached` names the terminal, the attempt, its ownership generation, the session generation, and the output it retains; an attach with `after` receives the retained output chunks after that sequence, and a gap in `sequence` is output that a bounded buffer dropped.
- **Lifetime.** Closing or losing the browser connection ends neither the execution nor the terminal: the terminal ends when its program exits, a client sends `terminal.close`, no client was attached for the idle timeout, the attempt ends or is cancelled, its session generation ends, the worker refuses to open it or cannot start it, or the worker's relay is lost. `terminal.ended` names that reason, with the worker's refusal reason exactly when it was refused. A terminal is never recovered after a restart (agent harness port section 8).
- **Login and roles.** The connection closes with `unauthenticated` when its login session ends and with `role-changed` on any change of its principal's roles in the project, as the event streams end (control-plane section 10); the next upgrade is authorized anew.
- **Limits.** A frame is one JSON text message: at most 4,096 characters of input or 65,536 of output per frame. Item 39 sets the input rate limit, the attach timeout, and the idle timeout; a connection over its rate closes with `rate-limited`, and one whose first frame is not `terminal.attach`, or that sends a malformed frame, with `invalid-frame`.

The control plane closes a connection with these codes, and the close frame's reason is the `TerminalCloseReason` text:

| Code | Reason | When |
| --- | --- | --- |
| 4400 | `invalid-frame` | A malformed frame, a frame over its bound, or a first frame other than `terminal.attach` |
| 4401 | `unauthenticated` | The login session ended, or the worker credential of a relay was revoked or rotated |
| 4402 | `csrf-token-invalid` | A cookie connection's attach without its session's CSRF token |
| 4403 | `role-changed` | The principal's roles in the project changed |
| 4408 | `attach-timeout` | No `terminal.attach` within the attach timeout |
| 4409 | `superseded` | Another client attached, or the worker opened a newer relay |
| 4410 | `terminal-ended` | After `terminal.ended` |
| 4429 | `rate-limited` | Input over the rate limit |
| 4503 | `relay-unavailable` | The worker's relay connection closed while the client was attached |

## 8. Worker relay

The terminal is relayed over the worker's outbound connection (G3 plan row 39; the "Outbound relay connection" of [architecture section 8](../architecture.md#8-deployment-and-data-ownership)), never over the broker, so terminal traffic never blocks a command or a cancellation, which travel on the worker's command subject, and terminal text is never kept at rest in a stream.

- **Connection.** `openWorkerRelay` upgrades `GET /workers/relay` with the worker credential and the subprotocol `taskelith.relay.v1`; 401 answers a missing, unknown, revoked, or retired credential, and 422 `RelayRefusal` `protocol-not-supported` a worker whose common protocol version is below 2. A worker holds one relay: a new one replaces the older, which the control plane closes with `superseded`. The control plane closes it with `unauthenticated` when the worker's credential is revoked or rotated. The relay carries only terminal frames, never a command, an observation, or a credential.
- **Open.** `relay.terminal.open` names the terminal, the attempt with its ownership generation, the owning execution, the session, and its running generation. The worker opens the terminal only when it holds the attempt at that ownership generation (`attempt-not-held`), the execution is the attempt's running, owning execution (`execution-not-running`), the session generation runs (`generation-not-running`), and its harness and platform offer a terminal (`terminal-not-offered`). After these checks it asks the port for `terminalProgram`, which fails with `precondition-failed` when the generation is no longer current (`generation-not-running`), and starts the program in a pseudo-terminal; when `terminalProgram` fails with `internal` or `unavailable`, or the pseudo-terminal does not start, the reason is `terminal-start-failed` ([agent harness port](agent-harness-port.md) sections 8 and 9.3), which names no error text. On any of these it answers `relay.terminal.refused` with that reason and opens nothing, and the control plane ends the client's terminal with `terminal.ended`, reason `refused` and the worker's reason, and closes the connection with `terminal-ended`.
- **Frames.** Input, resize, and close go to the worker; opened, output, and ended come back, each naming its `terminalId`. The worker numbers a terminal's output chunks from 1 without gaps (`TerminalSequence`); `relay.terminal.ended` follows only once every process of the pseudo-terminal is gone.
- **Bounded buffers.** Neither side waits for a slow peer. The worker drops output chunks that its relay cannot send, and the control plane keeps at most the live relay buffer of the [operational targets](../operational-targets.md), `10 MiB` per active attempt, dropping the oldest chunks, so a reader sees a gap in `sequence` and execution never waits.
- **Relay loss.** When the relay closes, the worker ends every terminal of that relay, and the control plane ends each with `relay-lost` and closes its client with `relay-unavailable`.

## 9. Session observations

Each observation is an `ObservationMetadata` envelope with its attempt and ownership generation and a protocol version of at least 2, in the worker's journal sequence ([execution wire contracts](execution-wire-contracts.md) section 5), and its payload carries a `recoveryEpoch`. The control plane applies each through the session timeline function that section 1 of the [session timeline](session-timeline.md) assigns to the host's reports, and treats the domain's refusal of a repeat as applied.

| Observation | `observationType` | Timeline function | `observationId` derived from |
| --- | --- | --- | --- |
| Generation started | `session.generation.started` | `startGeneration` | The session, the generation, and the fact |
| Generation ended | `session.generation.ended` | `endGeneration` | The session, the generation, and the fact |
| Turn delivered | `session.turn.delivered` | `deliverTurn` | The turn, the generation, and the fact |
| Turn not delivered | `session.turn.not-delivered` | None; the turn stays queued | The command's `commandId` |
| Turn ended | `session.turn.ended` | `recordTurnOutcome` | The turn and the fact |
| Request recorded | `session.request.recorded` | `recordRequest` | The session and the request key |
| Response delivery reported | `session.response.delivery-reported` | `recordDeliveryReport` | The session and the request key |
| Output appended | `session.output.appended` | `appendOutput` | The session, the generation, and the chunk number |
| Limit signaled | `session.limit.signaled` | `recordLimitSignal` | The session, the generation, and a counter of the generation's signals |
| SCM credential adopted, not adopted | `execution.scm-credential.adopted`, `execution.scm-credential.not-adopted` | None; item 21 ends the previous secret by the run-wide rule of section 6 | The run, the credential, the version, and the attempt |

- **Recovery epoch.** A session observation carries the recovery epoch of the launch intent of the execution that runs the session, and an adoption or non-adoption the epoch that the worker's fetch named. Before its effect is decided, one whose epoch differs from the current epoch (older or newer), or received in restore quarantine, is kept as evidence for quarantine reconciliation and changes no current state: no timeline, inbox, output, or credential state, and it ends no secret. This is the rule of [launch authorization](launch-authorization.md) section 7 for the other execution observations, because an observation from before a restore could otherwise match a restored attempt and generation. One at the current epoch outside quarantine is applied as the table states.
- **Classified operation.** `session.request.recorded` of a permission request carries the plugin's `operation` when the port classified it ([agent harness port](agent-harness-port.md) section 7.2), with the full branch ref of a `push`; no other request kind carries one. The control plane matches a standing rule for `push-to-task-branch` only when the operation is a `push` whose ref is `refs/heads/` and the branch of the task's change, checked in the use transaction ([product ports](product-ports.md) section 5); an unclassified request, or a push to another ref, matches no rule and waits for a person.
- **Before display.** A request's observation is applied, and its record committed, before any read or event shows it (control-plane section 10, "Commit before display").
- **A turn's failure.** `session.turn.ended` carries a failure exactly when its outcome is `failed`, as `recordTurnOutcome` requires.
- **Output.** `chunk` numbers a generation's output chunks from 1 without gaps; the control plane redacts a generation's output across chunks before it records it (control-plane section 7, "Output across chunks").

## 10. Redaction rule

This contract's redaction rule, named **no secret on the worker wire**:

1. **No credential in a message or frame.** No command, observation, or frame carries a credential, a secret, or an `Authorization` value; a credential travels only in an HTTPS response of 9c ([account pool](account-pool.md) section 7; execution wire contracts section 8.8). The notice names identifiers and a version only, and the offer's session binding names the session, harness, model, effort, and resume point only: the slot credential keeps its own channel, the HTTPS fetch of 9c, which a test checks.
2. **Run text redacted on the worker.** Every session text and terminal output that leaves the harness host is first redacted by value with the run's revealed credentials and by the shape rules over a sliding window, as account pool section 7.4 requires of every text of the run, its terminal stream included.
3. **Session text redacted again before it is recorded.** The control plane redacts session text with `@taskelith/secrets` before it records it, and a command carries only the recorded text (control-plane section 7).
4. **Terminal traffic never kept.** Terminal input, terminal output, and the CSRF token of an attach are never logged, recorded, journaled, published to the broker, or sent on an event stream; terminal output is held only in the bounded relay buffer of section 8.
5. **Logs and failures.** A log of a message, a frame, or an upgrade holds only its type, identifiers, generations, versions, sequence numbers, and status, never a payload text, the `Cookie` or `Authorization` header, or a token, and what it holds is still redacted with `@taskelith/secrets`. A refusal or a close reason names only its reason and identifiers.
6. **No examples.** No contract document carries an example, so none can hold a secret; a test checks the two message documents.

## 11. Compare-and-set and checks

- `openTerminal` names the attempt, its ownership generation, and the session generation the caller read, and answers 422 `attempt-not-current` when any moved, so a terminal never attaches to an attempt the caller did not see.
- `session.turn.deliver` names its generation, and the host delivers in no other.
- `session.response.deliver` and `session.delegation-result.deliver` follow a response that the control plane consumed once with its attempt and ownership generation check (session timeline section 5.2; control-plane section 9).
- `relay.terminal.open` names the attempt and ownership generation the worker must hold.
- A refreshed version is fetched with the attempt and ownership generation, which `fetchRunScmCredential` checks (execution wire contracts section 8.7), and ends only by the run-wide rule of section 6, serialized per run.
- Every observation of section 9 names its recovery epoch, which the control plane compares with the current epoch and the quarantine state before its effect.

## 12. Obligations on other items

- **Item 13:** the session messages in the NATS adapter's schema tables (`COMMAND_SCHEMAS` and `OBSERVATION_SCHEMAS`), whose test covers only the protocol version 1 messages until then, the session commands of section 3 written in the transactions that make them due, their `commandId` stored and reused, the observations of section 9 applied through the timeline after their recovery epoch check, the classified operation checked against the task's branch before a standing rule answers, and the control plane's protocol window raised to 1 to 2.
- **Item 18:** the offer's session binding of section 2, starting or resuming the bound session with its harness, model, and effort, the host side of sections 3 to 6 and 9 on the worker, the redaction of section 10 before a text leaves the host, and the worker's protocol window raised to 1 to 2.
- **Item 19:** the Claude Code plugin runs a session with the model and effort of its binding.
- **Item 21:** the notice of section 6 on each refresh, and the end of a version only by the run-wide rule of section 6, serialized per run.
- **Item 38:** the delegation result command of section 5 when a delegation result becomes `ended`, a rejected delegation included, and no command or host turn for an `answered` request.
- **Item 39:** `openTerminal`, `openWorkerRelay`, and the frames of sections 7 and 8, the refusal `terminal-start-failed` included, with the rate limit, the attach timeout, the idle timeout, and the bounded buffers.
- **Item 40:** the terminal view: attach with the CSRF token, reattach with `after`, and the reasons of section 7 shown to the user.

## 13. Versioning

`execution.asyncapi.json` goes from 0.7.0 to 0.8.0. The asyncapi diff of `make contract-compatibility` lists its added messages, schemas, and operation entries, and the offer's added `session`, `if`, `then`, and `else`, as unclassified changes, which `packages/contracts/breaking-changes.json` declares; no other existing message changed, and an offer of version 1 is valid exactly as before. `control-plane.openapi.json` goes to 0.3.0 and `execution.openapi.json` to 0.7.0 with an added operation each, which the check reports as no breaking change; `terminal.asyncapi.json` starts at 0.1.0.
