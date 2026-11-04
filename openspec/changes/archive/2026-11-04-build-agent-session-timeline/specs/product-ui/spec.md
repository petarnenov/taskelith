## MODIFIED Requirements

### Requirement: Web SPA screen routes
Under `/app/` the SPA SHALL route the board, agent sessions, reviews, workers and account pools, SCM integrations, plugins, the "Needs you" inbox, and new task, and SHALL list the first six in its navigation; until its G3 item builds a screen, the screen's page SHALL be empty, name that item, and show no data; the agent sessions page SHALL say that a session opens from its task and list none. No navigation entry SHALL name a screen of a later gate.

#### Scenario: Screen not built yet
- **WHEN** an operator opens a routed screen that its G3 item has not built
- **THEN** the page names the screen and the item that builds it, and shows no data

#### Scenario: Sessions page
- **WHEN** an operator opens `/app/sessions`
- **THEN** the page says that an agent session opens from its task in the task detail, lists no session, and leads to the board

#### Scenario: Unknown address
- **WHEN** an operator opens an address under `/app/` that no route matches
- **THEN** the SPA shows a page saying that no screen lives there, with a link to the board

#### Scenario: Interactive control
- **WHEN** the shell shows a button, link, or menu item
- **THEN** it is focusable and has an accessible name, and no badge is interactive

## ADDED Requirements

### Requirement: Web SPA agent session timeline
The agent session screen SHALL show the session as `readAgentSession` answers it (harness, task, run, running generation, attempt, limit, handoff) and its turns in position order with author, state, outcome or failure, generation, and text, reading first the up to 100 turns ending at `lastTurnPosition`, then each earlier window on demand; it SHALL show loading, a failed read or earlier read with why, the role a 403 names, and a retry, no turn, and no data it did not read.

#### Scenario: Last window first
- **WHEN** `readAgentSession` answers `lastTurnPosition` 250
- **THEN** the screen reads the turns after position 150, shows them, and offers to load the 150 earlier ones

#### Scenario: Earlier window
- **WHEN** the operator loads the earlier turns
- **THEN** the screen reads the turns after position 50, following a short page's `next` cursor up to the shown turns, shows them before the known ones in position order, and offers the next earlier window until the first turn is shown

#### Scenario: Earlier read fails
- **WHEN** a read of the earlier turns gets no answer, a 403, or a 404
- **THEN** the screen says why, with the role a 403 names, keeps the shown turns, and offers a retry of that window

#### Scenario: Turn states
- **WHEN** a turn is queued, delivered, ended with an outcome, ended with a failure, of an unknown outcome, or refused
- **THEN** its entry names that state, the outcome or the harness failure of an ended one, and the generation of every turn but a queued one

#### Scenario: Session read fails
- **WHEN** `readAgentSession` or `listAgentSessionTurns` gets no answer, a 403, a 404, an undocumented status, a body without the fields the screen shows, another session, or a turn at or below the cursor
- **THEN** the screen shows why, with the role a 403 names, and a retry, and no session data

#### Scenario: Session read after the session ended
- **WHEN** a session read answers 401 `unauthenticated`
- **THEN** the SPA shows the sign-in page saying that the session expired, and reads the session again

### Requirement: Web SPA live agent session
While showing an agent session, the SPA SHALL follow `streamProjectEvents` after its reads' lowest position and apply each `turn-changed` and `agent-session-changed` of that session above the read that supplied its record, whole records replacing known ones, so no event is lost, repeated, or shown over a newer read; it SHALL read again and reopen the stream as "Web SPA live board updates" says, show its last known time while updates are lost, and drop an earlier read a new snapshot overtook.

#### Scenario: Turn changes in the SPA
- **WHEN** a `turn-changed` of the shown session arrives above the view's position
- **THEN** the screen shows the turn in its new state, once, in position order

#### Scenario: Event below the read that supplied its record
- **WHEN** the turns were read at position 50, the session at 40, and a `turn-changed` of a read turn arrives at position 45
- **THEN** the turn keeps its read state, and an `agent-session-changed` at position 45 replaces the session

#### Scenario: Event of another session
- **WHEN** a `turn-changed` or `agent-session-changed` of another session arrives
- **THEN** the shown session does not change

#### Scenario: Resync of the session
- **WHEN** the stream sends `resync`
- **THEN** the SPA closes it, reads the session and its last window again, and opens a new stream after the lowest position of the reads

#### Scenario: Live updates lost on the session screen
- **WHEN** the event stream drops
- **THEN** the screen keeps its turns and shows the time of its last known state until the stream opens again

### Requirement: Web SPA agent session activity
The agent session screen SHALL show the session activity indicator of the session's task from `readTaskDetail` of its run, joined by `taskId`, read again on each `card-changed` of that run above the detail's position and on each new session snapshot, with every indicator state, an unreachable worker with its last contact and an uncertain process in the danger color included; it SHALL say when the activity loads, when it cannot be read, with a retry, and when no task of the session is listed.

#### Scenario: Worker unreachable on the session screen
- **WHEN** the task detail answers the session's task with `worker-unreachable` and `lastContactAt`
- **THEN** the indicator is still, and the label says that the worker is unreachable and when it was last in contact

#### Scenario: Process uncertain on the session screen
- **WHEN** the task detail answers the session's task with `process-uncertain`
- **THEN** the indicator is still and drawn in the danger color, and the label says that the process state is uncertain

#### Scenario: Card of the session's run changes
- **WHEN** a `card-changed` of the session's run arrives above the task detail's position
- **THEN** the SPA reads the task detail again and shows the task's new activity

#### Scenario: Activity under reduced motion
- **WHEN** the system asks for reduced motion
- **THEN** no indicator or loader on the session screen spins, and the labels still name each state

### Requirement: Web SPA agent session address
The SPA SHALL route `/app/sessions/{projectId}/{sessionId}`, with each identifier route-safe as in the task detail address, to the agent session screen, outside the navigation; the task detail SHALL list the card's agent sessions through `listAgentSessions` with each task detail it shows and link each task to its sessions, naming the harness and the session, and SHALL show why the sessions could not be listed, with the role a 403 names, and a retry.

#### Scenario: Session link in the task detail
- **WHEN** `listAgentSessions` answers a session of a task of the card
- **THEN** that task links to `/app/sessions/{projectId}/{sessionId}`, and following the link shows the session

#### Scenario: Session identifier with a dot
- **WHEN** a session's identifier is `session.1`
- **THEN** its link ends in `/session~2E1`, and a reload of it shows that session

#### Scenario: Sessions cannot be listed
- **WHEN** `listAgentSessions` answers 403, 404, no answer, or a body without the fields the links show
- **THEN** the task detail shows why and a retry beside its tasks, and no session link
