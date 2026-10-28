## MODIFIED Requirements

### Requirement: Operation roles
Each operation SHALL require the role that `docs/contracts/control-plane-wire-contracts.md` section 3 names: `installation-owner` for project creation, members, workers, enrollment tokens, account slots, SCM integration changes, and the installation inbox and stream; `project-maintainer` for project changes, defaults, auto-merge, and the binding; `project-operator` or above for turns, responses, and inbox answers; and `project-viewer` or above, or `installation-owner`, for a project's reads.

#### Scenario: Maintainer assigns a member
- **WHEN** a `project-maintainer` without `installation-owner` assigns a role on its project
- **THEN** the answer is 403 with reason `role-required`

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` submits a turn to a session of its project
- **THEN** the answer is 403 with reason `role-required` and no turn is recorded

### Requirement: Identifiers and pages
An identifier that the control plane mints for a project, principal, enrollment token, slot, SCM integration, or turn SHALL be one lowercase letter and 32 lowercase hexadecimal digits from 128 random bits; on the wire it SHALL be an `Identifier`. Every list other than `listWorkers` SHALL return at most 100 items in the order of its key, the identifier or, for turns and native requests, the position, and a `next` key while more remain.

#### Scenario: Next page
- **WHEN** a list other than `listWorkers` has more than 100 items
- **THEN** the first page returns 100 and a `next` key that, passed as `after`, starts the next page

## ADDED Requirements

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
`respondToNativeRequest` SHALL consume a person's permission or input answer naming the request key, the attempt, and the ownership generation, answering 404 for an unknown, expired, or unresolved request, 409 for an answered one, 422 `attempt-not-current` for an attempt that is not the active bound one, and 400 for an answer of the wrong kind. It and `answerInboxItem` SHALL reach one source, which consumes one answer.

#### Scenario: Inbox answer and session response race
- **WHEN** a person answers a permission request through the inbox while another responds to it in the session
- **THEN** exactly one answer is consumed, and the other answers 409 with reason `already-answered`

#### Scenario: Response for a replaced attempt
- **WHEN** a response names an attempt or ownership generation other than the session's active bound one
- **THEN** the answer is 422 with reason `attempt-not-current`, and the request stays open

### Requirement: Output after a cursor on the wire
`readAgentSessionOutput` SHALL return at most 100 retained entries after its cursor in position order with a `next` position while more remain, `cursor-expired` with the earliest retained position for a cursor older than the retained window, and 400 for a cursor after the last position.

#### Scenario: Expired output cursor
- **WHEN** a client reads output after a position that left the retained window
- **THEN** the answer is `cursor-expired` with the earliest retained position

### Requirement: Event streams
`streamProjectEvents` and `streamInstallationEvents` SHALL answer `text/event-stream` with `Cache-Control: no-store`, each event a frame whose `id` is its position, whose `event` is its type, and whose `data` matches `ProjectEvent` or `InstallationEvent`; a project stream SHALL carry only its project's events, and the installation stream only installation-scoped inbox events.

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
`Last-Event-ID` SHALL be the durable cursor and win over the `after` query parameter, and a stream SHALL resume after it with every retained event of its scope in order. A cursor older than the retention SHALL get a `resync` event with reason `cursor-expired`, and one that is no position of the stream `cursor-unknown`, in a 200 response whose frame has no `id`, after which the stream ends.

#### Scenario: Reconnect
- **WHEN** a browser reconnects with the `Last-Event-ID` of the last event it received
- **THEN** the stream sends the retained events after it in order, without that event

#### Scenario: Expired cursor falls back to snapshots
- **WHEN** a client reconnects with a cursor older than the stream's retention
- **THEN** it receives `resync` with `cursor-expired`, the stream ends, and the client reads its views and opens a new stream after the lowest of their positions

### Requirement: Slow stream consumers
Each stream SHALL have a bounded buffer and SHALL be ended rather than waited on when the buffer is full, so that a slow consumer never blocks a command or a cancellation; a stream SHALL also end when its login session ends or its principal loses the role.

#### Scenario: Slow consumer
- **WHEN** a client stops reading its stream while commands keep committing
- **THEN** its stream is ended when its buffer is full, the commands complete, and the client reconnects with `Last-Event-ID`

### Requirement: Event payloads and agent text
An event's data SHALL be the record that the corresponding read returns for the same state, and the control plane SHALL redact agent text with `@taskelith/secrets` before it records it, so that a read and an event carry the same redacted text.

#### Scenario: Secret in agent output
- **WHEN** a harness writes output that holds a credential of a known shape
- **THEN** neither the output read nor its `output-appended` event carries the credential

### Requirement: Session schemas shared with the worker messages
The session schemas that the worker messages of sub-change 9d reuse, `AgentSessionId`, `AgentSessionGeneration`, `TurnId`, `TurnText`, `TurnOutcome`, `HarnessFailure`, `NativeRequestId`, `NativeRequestKey`, `NativeRequestKind`, `HarnessText`, `NativeAnswer`, `PermissionDecision`, `DelegationResultOutcome`, and `IdempotencyKey`, SHALL use only keywords that JSON Schema draft-07 reads as 2020-12 does.

#### Scenario: Keyword of 2020-12 only
- **WHEN** one of these schemas reaches a keyword such as `prefixItems` or `$defs`
- **THEN** the contract tests fail
