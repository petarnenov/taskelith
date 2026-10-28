# control-plane-wire-contracts Specification

## Purpose
Define the contract-first control-plane access API of G3 item 9a: an OpenAPI 3.1 document for login and sessions, project setup, the workers view, enrollment tokens, account slots, SCM integrations, and the webhook receiver, with its security schemes, failures, roles, and secret handling, before items 10 to 15 implement it.

## Requirements

### Requirement: Control-plane document
`@taskelith/contracts` SHALL hold `documents/control-plane.openapi.json` (OpenAPI 3.1.0) with a semantic `info.version`, starting at 0.1.0, and the build SHALL generate its types and validators with the other documents'. The rules that its schemas cannot express SHALL be stated in `docs/contracts/control-plane-wire-contracts.md`. A breaking change SHALL need a higher minor version while the major version is 0.

#### Scenario: Document generated
- **WHEN** the build generates the contract types
- **THEN** they include every schema and operation of the control-plane document

#### Scenario: Shared schema reused
- **WHEN** the control-plane document defines a schema whose name another document defines
- **THEN** both definitions are identical

### Requirement: Browser session and CSRF schemes
The document SHALL define `browserSession`, a cookie under the `__Host-` prefix that is `HttpOnly`, `Secure`, and `SameSite=Strict`; `csrfToken`, the `X-CSRF-Token` header; and the other documents' `operatorToken`. Every operation other than GET, except the webhook receiver, SHALL accept the cookie together with the CSRF header, every such operation other than `logIn` and `logOut` SHALL also accept the operator bearer alone, and none SHALL accept another credential.

#### Scenario: Mutation without the CSRF header
- **WHEN** a request authenticated by the session cookie changes state without the session's CSRF token
- **THEN** it is refused with 403 and reason `csrf-token-invalid`, and nothing takes effect

#### Scenario: Mutation with the operator bearer
- **WHEN** the CLI sends a mutation that declares the operator bearer, with that bearer and no CSRF header
- **THEN** the request is authenticated as the bearer's principal

### Requirement: Login session
`readSession` SHALL need no credential and, when no valid session is presented, SHALL start an anonymous server-side session and return its CSRF token. `logIn` SHALL need that session's cookie and token, and on success SHALL give the session a new identifier and a new CSRF token. `logOut` SHALL end the session.

#### Scenario: Session fixation
- **WHEN** a login succeeds on an anonymous session
- **THEN** the session identifier and CSRF token from before the login no longer authenticate

#### Scenario: Wrong password
- **WHEN** a login name and password do not match
- **THEN** the answer is 401 with reason `login-failed` and does not say which is wrong

### Requirement: Access failures
Authentication, CSRF, and authorization failures SHALL be distinct kernel failures with code `forbidden`: 401 `AuthenticationFailure` (`unauthenticated` or `login-failed`), except the webhook receiver's 401 `WebhookRejection` (`signature-invalid`), 403 `CsrfRejection` (`csrf-token-invalid`), and 403 `AccessDenial` (`role-required`). An operation with a session or bearer requirement SHALL authenticate, then check the CSRF token, then the role, before it reads the body.

#### Scenario: CSRF rejection is not an access denial
- **WHEN** a body with reason `csrf-token-invalid` is checked against `AccessDenial`
- **THEN** it is invalid, and it is valid as a `CsrfRejection`

### Requirement: Operation roles
Each operation SHALL require the role of control-plane wire contracts section 3: `installation-owner` for project creation, members, workers, enrollment tokens, account slots, SCM integration edits, and the installation inbox and stream; `project-maintainer` for project edits, defaults, auto-merge, and the binding; `project-operator` or above for turns, responses, terminals, and inbox answers; `project-viewer` or above, or `installation-owner`, for project reads.

#### Scenario: Maintainer assigns a member
- **WHEN** a `project-maintainer` without `installation-owner` assigns a role on its project
- **THEN** the answer is 403 with reason `role-required`

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` submits a turn to a session of its project
- **THEN** the answer is 403 with reason `role-required` and no turn is recorded

#### Scenario: Viewer opens the terminal
- **WHEN** a `project-viewer` opens the terminal of a session of its project
- **THEN** the answer is 403 with reason `role-required` and no terminal is opened

### Requirement: Project setup operations
The document SHALL define creating, reading, listing, and renaming projects, assigning and removing a principal's one role on a project, the project defaults, the auto-merge setting, and the repository binding. `updateProject`, `updateProjectDefaults`, `updateAutoMergeSetting`, and `bindRepository` on a bound project SHALL name the revision they read and fail with 409 `conflict` when it moved. A first binding and a member assignment or removal SHALL name none.

#### Scenario: Concurrent default changes
- **WHEN** two maintainers replace a project's defaults from the same revision
- **THEN** one succeeds and the other fails with 409

#### Scenario: Concurrent member assignments
- **WHEN** two installation owners assign different roles to the same principal on one project
- **THEN** both succeed and the role of the assignment serialized last stays

### Requirement: Remote origin of a binding
An integration's allowed origin, https with a host and an optional port, SHALL be set only by an `installation-owner` and stored with a lower-case host and an explicit port, 443 by default. `bindRepository` SHALL refuse with 422 a remote URL that is not HTTPS, holds user information, a query, or a fragment, or whose origin, normalized the same way, is not that origin.

#### Scenario: Remote URL outside the integration's origin
- **WHEN** a maintainer binds a remote URL whose host is not that of the integration's allowed origin
- **THEN** the answer is 422 with reason `remote-origin-mismatch` and the binding is unchanged

### Requirement: Remote origin at credential issue
Each issue or re-delivery of a per-run SCM credential SHALL first re-check the bound remote URL against the integration's current allowed origin, so that narrowing the origin covers existing bindings. On a mismatch the control plane SHALL issue no credential and record the reason `remote-origin-mismatch`.

#### Scenario: Credential issue after the origin changes
- **WHEN** an installation owner changes an integration's allowed origin so that a bound remote URL lies outside it, and a run of that project then needs its per-run SCM credential
- **THEN** the control plane issues no credential and records the reason `remote-origin-mismatch`

### Requirement: Workers view operation
`listWorkers` SHALL return the worker admission view: every enrolled worker that is not revoked, in identifier order, with its host, enrollment time, admission state, last report time, and stored self-check results, and no credential or credential hash. When a source cannot be read it SHALL answer 503 with no partial data.

#### Scenario: Credential field in the view
- **WHEN** a workers view entry carries a credential generation
- **THEN** the entry is invalid

### Requirement: Enrollment token operations
The document SHALL define listing pending enrollment tokens without their secrets, issuing a token, rotating a pending token into a new one with its constraints, and revoking a pending token. Only the 201 response of issuing or rotating SHALL carry the token's secret. A rotation or revocation SHALL serialize with a redemption of the same token, so that exactly one of them succeeds.

#### Scenario: Revocation races a redemption
- **WHEN** a token is revoked while a worker redeems it
- **THEN** either the worker is enrolled and the revocation fails with 422, or the revocation succeeds and the redemption fails with `token-invalid`

### Requirement: Account slot operations
The document SHALL define listing, adding, changing, revoking, reinstating, and removing account slots, and rotating a slot's credential; changing, revoking, reinstating, removing, and rotating SHALL compare-and-set the slot's revision. A slot credential SHALL be write-only. A project member's view of its pools SHALL say whether a slot also serves other projects without naming them.

#### Scenario: Slot in a project's view
- **WHEN** a slot serves the project and another project
- **THEN** the project's view shows it as shared and names neither its allowed projects nor its credential

### Requirement: SCM integration setup
The document SHALL define listing, reading, creating, and changing SCM integrations, each with an SCM plugin, a label, an allowed origin, plugin-defined settings, and plugin-defined write-only secrets. A change SHALL compare-and-set the integration's revision. A response SHALL name the stored secrets and never carry their values, and no schema SHALL name an SCM.

#### Scenario: Secrets in a response
- **WHEN** an integration record carries its secrets' values
- **THEN** the record is invalid

### Requirement: Webhook receiver
`receiveScmWebhook` SHALL need no session, CSRF token, or operator credential. It SHALL read at most its limit of raw bytes of any media type, then have the integration's plugin verify the signature over those exact bytes, and only then read the payload. An unknown integration and a failed verification SHALL answer the same 401; a verified delivery and a repeat of a recorded one SHALL answer 202.

#### Scenario: Unsigned delivery
- **WHEN** a delivery arrives without a valid signature
- **THEN** the answer is 401 `WebhookRejection` and nothing is recorded

### Requirement: Secrets in responses
No response schema SHALL reach a `writeOnly` value: a password, a slot credential, or SCM secrets. Besides a CSRF token, a new enrollment token's secret SHALL be the only secret in a response body; a response with either SHALL send `Cache-Control: no-store`. The session identifier SHALL travel only in `Set-Cookie`. A request log SHALL hold only allowlisted parts, never a body with a `writeOnly` value or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Write-only value in a response
- **WHEN** any operation's response schema reaches a schema marked `writeOnly`
- **THEN** the contract tests fail

#### Scenario: Logged login request
- **WHEN** the control plane logs a `logIn` request
- **THEN** the log holds neither the password nor the `Cookie` or `X-CSRF-Token` header

### Requirement: Identifiers and pages
An identifier that the control plane mints for a project, principal, enrollment token, slot, SCM integration, or turn SHALL be one lowercase letter and 32 lowercase hexadecimal digits from 128 random bits; on the wire it SHALL be an `Identifier`. Every list other than `listWorkers` SHALL return at most 100 items in the order of its key, the identifier or, for turns and native requests, the position, and a `next` key while more remain.

#### Scenario: Next page
- **WHEN** a list other than `listWorkers` has more than 100 items
- **THEN** the first page returns 100 and a `next` key that, passed as `after`, starts the next page

### Requirement: Board and inbox views
`readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, and the installation inbox reads SHALL map the board read model and the inbox ports one to one, each as one unpaged snapshot with `asOf` and the event stream `position` it reflects, and SHALL answer 503 rather than return partial data.

#### Scenario: Source unavailable
- **WHEN** one source of the board cannot be read
- **THEN** `readBoard` answers 503 and returns no cards

#### Scenario: Child run is no card
- **WHEN** `readTaskDetail` names the run of a delegated child task
- **THEN** the answer is 404

### Requirement: Inbox answers on the wire
`answerInboxItem` and `answerInstallationInboxItem` SHALL take an idempotency key and an answer of the item's kind, refuse a principal below the item's `answerableBy` role with 403 before reading the body, and have the item's source consume the answer once: the key repeated with the same answer SHALL return the first outcome, and another answer to a resolved item or the key with another answer SHALL answer 409.

#### Scenario: Answer repeated after a lost response
- **WHEN** an operator repeats an answer with the same idempotency key after the first resolved the item
- **THEN** the answer is 200 with the item as the first answer resolved it, and nothing else changes

#### Scenario: Two items of one reused native request ID
- **WHEN** two generations of one session record requests with the same native request ID and both open inbox items
- **THEN** the items' subjects differ in `sessionGeneration`, and each matches one request of `listAgentSessionRequests`

#### Scenario: Operator answers a maintainer item
- **WHEN** a `project-operator` answers a `spec-approval` item
- **THEN** the answer is 403 with reason `role-required`

#### Scenario: Closed item
- **WHEN** an answer arrives for an item that its source closed
- **THEN** the answer is 422 `AnswerRefusal` with reason `item-closed`, and nothing changes

### Requirement: Agent session reads
`listAgentSessions` SHALL list the agent sessions of a card's tasks and their delegated child tasks, `listAgentSessionTurns` a session's turns in position order, and `listAgentSessionRequests` its native requests in recording order, each request at a position that never changes; `readAgentSession` and every page SHALL carry `asOf` and the event stream `position`.

#### Scenario: Request position
- **WHEN** a session records a third native request after two others changed state
- **THEN** the new request is listed at position 3, and the first two keep positions 1 and 2

### Requirement: Turn submission on the wire
`submitTurn` SHALL record a turn of the calling principal with the client's idempotency key and a `TurnId` that the control plane mints, answering 201 for a new turn, 200 with the same turn when the key, author, and text repeat, 409 `idempotency-key-reused` when the key was used for another author or text, and 422 `session-stopped` for a stopped session.

#### Scenario: Retry after a lost response
- **WHEN** a client submits a turn again with the same idempotency key and text
- **THEN** the answer is 200 with `duplicate` and the turn of the first submission, and no second turn exists

#### Scenario: Stopped session
- **WHEN** a turn is submitted to a session stopped by an account limit
- **THEN** the answer is 422 with reason `session-stopped`

### Requirement: Native request responses on the wire
`respondToNativeRequest` SHALL consume a person's permission or input answer naming the request key, attempt, and ownership generation, answering 404 for an unknown, expired, or unresolved request; for an answered one, 200 when the key and response repeat those that answered it, else 409; 422 `attempt-not-current` for an attempt that is not the active bound one; and 400 for an answer of the wrong kind. It and `answerInboxItem` SHALL reach one source, consuming one answer.

#### Scenario: Response repeated after a lost response
- **WHEN** a person repeats a response with the idempotency key and response that answered the request
- **THEN** the answer is 200 with the answered request, and nothing else changes

#### Scenario: Response key reused with another response
- **WHEN** a response names the key of the response that answered the request but another decision
- **THEN** the answer is 409 with reason `idempotency-key-reused`, and the first response stays

#### Scenario: Session response resolves the inbox item
- **WHEN** a person answers a permission request through `respondToNativeRequest`
- **THEN** the request's inbox item is resolved in the same transaction, and `inbox-item-changed` reports it

#### Scenario: Inbox answer and session response race
- **WHEN** a person answers a permission request through the inbox while another responds to it in the session
- **THEN** exactly one answer is consumed, and the other answers 409 with reason `already-answered`

#### Scenario: Response for a replaced attempt
- **WHEN** a response names an attempt or ownership generation other than the session's active bound one
- **THEN** the answer is 422 with reason `attempt-not-current`, and the request stays open

### Requirement: Inbox items about native requests
A `permission-request`, `input-request`, or `delivery-acknowledgement` item SHALL name its native request by `sessionId`, `sessionGeneration`, and `nativeRequestId`, because a later generation can reuse a native request ID.

#### Scenario: Request item without its generation
- **WHEN** a `delivery-acknowledgement` item lacks `sessionGeneration`
- **THEN** it does not match `InboxItem`, and the contract tests fail

### Requirement: One bound for an input answer
`answerInboxItem` and `respondToNativeRequest` SHALL bound an input answer alike, at `MAX_INPUT_ANSWER_BYTES`, 65,536 bytes in UTF-8, and SHALL answer 400 beyond it on either path.

#### Scenario: Long Cyrillic answer
- **WHEN** a person answers an input request with 40,000 Cyrillic letters, 80,000 bytes in UTF-8
- **THEN** both `answerInboxItem` and `respondToNativeRequest` answer 400, and the request stays open

### Requirement: Output after a cursor on the wire
`readAgentSessionOutput` SHALL return at most 100 retained entries after its cursor in position order with a `next` position while more remain, `cursor-expired` with the earliest retained position for a cursor older than the retained window, and 400 for a cursor after the last position.

#### Scenario: Expired output cursor
- **WHEN** a client reads output after a position that left the retained window
- **THEN** the answer is `cursor-expired` with the earliest retained position

### Requirement: Event streams
`streamProjectEvents` and `streamInstallationEvents` SHALL answer `text/event-stream` with `Cache-Control: no-store`, each event a frame whose `id` is its position, except `resync` and `stream-ended`, whose frames have none, whose `event` is its type, and whose `data` matches `ProjectEvent` or `InstallationEvent`; a project stream SHALL carry only its project's events, and the installation stream only installation-scoped inbox events.

#### Scenario: First worker online for an empty board
- **WHEN** the number of workers online goes from zero to one while a project has no cards
- **THEN** the project stream carries a `board-changed` event with `workersOnline` 1

#### Scenario: Item opened for a card
- **WHEN** an inbox item that counts toward a card opens
- **THEN** the project stream carries its `inbox-item-changed` event and the card's `card-changed` event with the new `needsYou`

#### Scenario: Another project's event
- **WHEN** a turn of another project changes while a viewer streams its own project
- **THEN** the viewer's stream carries no event of that turn

### Requirement: Event position after commit
An event position SHALL exist only after the change it reports has committed: positions SHALL be assigned in commit order from one installation-wide sequence and never reused, and a stream SHALL send its events in increasing position order, so that no read or event shows an uncommitted native request.

#### Scenario: Aborted request recording
- **WHEN** the transaction that records a native request aborts
- **THEN** no event and no read shows the request, and no position names it

#### Scenario: Order across transactions
- **WHEN** two transactions commit one after the other
- **THEN** the event of the later commit has the higher position and is sent after the other

### Requirement: Event stream cursor and resynchronization
`Last-Event-ID` SHALL be the durable cursor and win over `after`. A cursor SHALL be a boundary of the installation-wide sequence, valid from the stream's retention floor to the sequence's head, and the stream SHALL resume with its scope's retained events above it in order. A cursor below the floor SHALL get a `resync` event with `cursor-expired`, one beyond the head `cursor-unknown`, in a 200 response whose frame has no `id`, after which the stream ends.

#### Scenario: Cursor of no event of the stream
- **WHEN** a client connects after `0`, or after a view's position that is no event of its stream, within the retention
- **THEN** the stream sends its scope's events above that position in order and no `resync`

#### Scenario: Cursor beyond the head
- **WHEN** a client connects after a position beyond the head of the installation-wide sequence
- **THEN** it receives `resync` with `cursor-unknown`, and the stream ends

#### Scenario: Reconnect
- **WHEN** a browser reconnects with the `Last-Event-ID` of the last event it received
- **THEN** the stream sends the retained events after it in order, without that event

#### Scenario: Expired cursor falls back to snapshots
- **WHEN** a client reconnects with a cursor older than the stream's retention
- **THEN** it receives `resync` with `cursor-expired`, the stream ends, and the client closes its `EventSource`, reads its views, and opens a new stream after the lowest of their positions

### Requirement: Slow stream consumers
Each stream SHALL have a bounded buffer and SHALL be ended rather than waited on when the buffer is full, so that a slow consumer never blocks a command or a cancellation; a stream SHALL also end when its login session ends.

#### Scenario: Slow consumer
- **WHEN** a client stops reading its stream while commands keep committing
- **THEN** its stream is ended when its buffer is full, the commands complete, and the client reconnects with `Last-Event-ID`

### Requirement: Stream end on a role change
A stream SHALL end on any change of its principal's roles in its project, or of its `installation-owner` role, raised or lowered, with a `stream-ended` event of reason `role-changed` and no `id`; the client SHALL read its views again and resume from its durable cursor, and the reconnection SHALL be authorized anew, so that no stream outlives the roles it was authorized with.

#### Scenario: Raised role
- **WHEN** a `project-viewer` streaming its project is made `project-operator`
- **THEN** its stream receives `stream-ended` with `role-changed` and ends, and the client reads the board again, now with `callerMayAct` true, and resumes with its `Last-Event-ID`

#### Scenario: Role removed
- **WHEN** the principal of a project stream, who holds no `installation-owner` role, loses every role on the project
- **THEN** its stream receives `stream-ended` with `role-changed` and ends, and the reconnection is refused with 403

### Requirement: Event payloads and session text
An event's data SHALL be the record, or for `board-changed` the field, that the corresponding read returns for the same state, and the control plane SHALL redact session text with `@taskelith/secrets` before it records it, a generation's output as one text across its chunks, so that a read and an event carry the same redacted text.

#### Scenario: Secret in agent output
- **WHEN** a harness writes output that holds a credential of a known shape
- **THEN** neither the output read nor its `output-appended` event carries the credential

#### Scenario: Secret split across output chunks
- **WHEN** a harness writes a credential of a known shape in two output chunks
- **THEN** neither the output read nor any `output-appended` event carries the credential or a part of it that could rebuild it

### Requirement: Idempotency before redaction
A repeated turn, inbox answer, or native response SHALL be compared by its input before redaction: the control plane SHALL check the key, call the domain or source, and record a keyed digest of the unredacted input in one serializable transaction, the key unique in its scope and a conflict retrying the whole transaction, and return the first outcome for the same digest and 409 `idempotency-key-reused` for another.

#### Scenario: Inputs that redact alike
- **WHEN** a turn repeats an idempotency key with text that holds another credential of the same shape
- **THEN** the answer is 409 with reason `idempotency-key-reused`, though both texts redact to the same text

#### Scenario: Identical retry of a redacted input
- **WHEN** a turn repeats an idempotency key with the same text, which holds a credential
- **THEN** the answer is 200 with `duplicate` and the first turn

#### Scenario: Concurrent repeats with one key
- **WHEN** two turns with one idempotency key and different texts that redact alike are submitted concurrently
- **THEN** exactly one is recorded, and the other, retried after its transaction conflicts, answers 409 `idempotency-key-reused`

### Requirement: Session schemas shared with the worker messages
The session schemas that the worker messages of sub-change 9d reuse, `AgentSessionId`, `AgentSessionGeneration`, `TurnId`, `TurnText`, `TurnOutcome`, `HarnessFailure`, `NativeRequestId`, `NativeRequestKey`, `NativeRequestKind`, `HarnessText`, `NativeAnswer`, `PermissionDecision`, `DelegationResultOutcome`, and `IdempotencyKey`, SHALL use only keywords that JSON Schema draft-07 reads as 2020-12 does.

#### Scenario: Keyword of 2020-12 only
- **WHEN** one of these schemas reaches a keyword such as `prefixItems` or `$defs`
- **THEN** the contract tests fail

### Requirement: Terminal WebSocket upgrade
`openTerminal` SHALL upgrade `GET /projects/{projectId}/agent-sessions/{sessionId}/terminal` to a WebSocket with the subprotocol `taskelith.terminal.v1`, taking the session cookie or the operator bearer. It SHALL authenticate, refuse a cookie upgrade without an origin or from another origin with 403 `csrf-token-invalid`, and check the role before it reads the session; it SHALL answer 400 to an invalid parameter or handshake header.

#### Scenario: Cross-origin upgrade
- **WHEN** a cookie-authenticated upgrade carries an `Origin` other than the installation's
- **THEN** the answer is 403 with reason `csrf-token-invalid` and no terminal is opened

#### Scenario: Offered subprotocol list
- **WHEN** an upgrade offers `Sec-WebSocket-Protocol: chat, taskelith.terminal.v1`
- **THEN** the header is valid, and the 101 answer selects `taskelith.terminal.v1`

#### Scenario: Unknown session without the role
- **WHEN** a principal without a role on the project opens the terminal of an unknown session
- **THEN** the answer is 403 with reason `role-required`, not 404

### Requirement: Terminal refusals
After the role check, `openTerminal` SHALL answer 404 for a session not of the project, then 422 `TerminalRefusal` with `attempt-not-current` when the attempt, ownership generation, or session generation it names is not the session's active bound attempt and running generation, then `terminal-not-offered` when the harness, the platform, or a common protocol version below 2 offers no terminal, and 503 when the worker's relay is not open.

#### Scenario: Attempt moved
- **WHEN** the session's active attempt has a newer ownership generation than the one the upgrade names
- **THEN** the answer is 422 with reason `attempt-not-current`

### Requirement: Terminal attach and CSRF token
The first client frame SHALL be `terminal.attach`; on a cookie-authenticated connection it SHALL carry the session's CSRF token, compared in constant time, and nothing SHALL be relayed before it. A missing or wrong token, or another first frame, SHALL close the connection with `csrf-token-invalid` or `invalid-frame`. An `after` SHALL name its `terminalId` and apply only to that terminal.

#### Scenario: Attach without the token
- **WHEN** a cookie-authenticated connection sends `terminal.attach` without a CSRF token
- **THEN** the control plane closes it with code 4402 and reason `csrf-token-invalid`, and relays nothing

#### Scenario: Cursor of an ended terminal
- **WHEN** a client reattaches with `after` and the `terminalId` of a terminal that ended, and the attach opens a new terminal
- **THEN** `after` is ignored, whatever its value, and the new terminal's output follows from its earliest retained chunk

### Requirement: Terminal lifetime
An attempt SHALL have at most one terminal and one attached client; a new attach SHALL close the previous one with `superseded`. Closing the client SHALL end neither the execution nor the terminal, which SHALL end only when its program exits, a client closes it, the idle timeout passes, the attempt or generation ends, the worker refuses it, or the relay is lost.

#### Scenario: Browser closed
- **WHEN** the attached browser closes its connection
- **THEN** the attempt's execution and the terminal's program go on, and a later attach with the terminal's `terminalId` and `after` receives the retained output after that sequence

### Requirement: Terminal connection end
A terminal connection SHALL close with `unauthenticated` when its login session ends or its operator bearer is revoked, and with `role-changed` on any change of its principal's roles in the project, and each close SHALL use the code and reason of the terminal contract's table. A `terminal.ended` frame SHALL carry the worker's refusal reason exactly when its reason is `refused`.

#### Scenario: Role lowered while attached
- **WHEN** the attached principal's project role changes
- **THEN** the control plane closes the connection with reason `role-changed`

### Requirement: Terminal frame bounds
A terminal frame SHALL be one JSON text message with at most 4,096 characters of input or 65,536 characters of output. Output chunks SHALL carry a sequence from 1 without gaps as the worker sends them, and a bounded buffer that drops output SHALL leave a gap in it rather than wait for a slow reader.

#### Scenario: Oversized input
- **WHEN** a client sends `terminal.input` with 4,097 characters
- **THEN** the frame is invalid and the control plane closes the connection with `invalid-frame`
