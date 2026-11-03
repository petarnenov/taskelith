## REMOVED Requirements

### Requirement: Web SPA task detail route
**Reason**: It reserved an empty page until change `build-task-detail` built the task detail, and no card linked to it; this change builds it.
**Migration**: Replaced by "Web SPA task detail address", which routes the same address to the task detail Drawer instead of an empty page.

## ADDED Requirements

### Requirement: Web SPA task detail
The task detail SHALL show the card as `readTaskDetail` answers it: each stage in graph order with its column, state, and gates with their state and required evidence; why the card does not move; the requirement traceability with evidence freshness, or that none is recorded; the run binding; and the run's tasks in admission order with admission, ownership generation, delegation, session indicator, obstacle, and task end. Long text SHALL wrap at phone width.

#### Scenario: Stale gate in the SPA
- **WHEN** `readTaskDetail` answers a gate in the state `stale`
- **THEN** the task detail shows that gate as stale beside the evidence kind it needs

#### Scenario: Longest identifiers at phone width
- **WHEN** `readTaskDetail` answers identifiers of 128 characters
- **THEN** the task detail breaks them so that it does not scroll sideways at phone width, and a copy of each stays unchanged

#### Scenario: No traceability yet
- **WHEN** `readTaskDetail` answers an empty `traceability`
- **THEN** the task detail says that the control plane records no requirement traceability for the run yet, and shows no requirement

#### Scenario: Task detail read fails
- **WHEN** `readTaskDetail` gets no answer, a 403, a 404, an undocumented status, or a body without the fields the task detail shows or of another card
- **THEN** the Drawer shows why, with the role a 403 names, and a retry, and no task data

#### Scenario: Task detail read after the session ended
- **WHEN** `readTaskDetail` answers 401 `unauthenticated`
- **THEN** the SPA shows the sign-in page saying that the session expired, and reads the session again

### Requirement: Web SPA live task detail
While the task detail is open over the live board of its project, the SPA SHALL read it again when the board shows a new state of its card above the detail's position or reads a new snapshot at any position, one read at a time and once more after a read for the changes during it; SHALL show the time of the detail's state while the board's live updates are lost; and SHALL drop the detail, with why and a retry, when the board fails.

#### Scenario: Card changes under the task detail
- **WHEN** a `card-changed` event of the open card arrives above the detail's position
- **THEN** the SPA reads the task detail again and shows the new answer

#### Scenario: Another card changes
- **WHEN** a `card-changed` event of another card arrives
- **THEN** the SPA does not read the task detail again

#### Scenario: Resync below the task detail
- **WHEN** a resync after a restore reads a board whose position lies below the detail's, or without the card
- **THEN** the SPA reads the task detail again and shows its answer

#### Scenario: Board fails under the task detail
- **WHEN** the board's read after a stream end or a closed stream answers 403 or no board
- **THEN** the Drawer shows why, with the role a 403 names, and a retry, and no task data

#### Scenario: Live updates lost under the task detail
- **WHEN** the board's event stream drops
- **THEN** the task detail shows the time of its state, its `asOf`, until the stream opens again

### Requirement: Web SPA loading status
Every loading status line of the SPA, the session check included, SHALL name what loads, and SHALL show no spinning loader when the system asks for reduced motion.

#### Scenario: Session check under reduced motion
- **WHEN** the system asks for reduced motion while the SPA checks the session
- **THEN** the page says that it checks the session, and no loader spins

### Requirement: Web SPA task detail address
The SPA SHALL route `/app/projects/{projectId}/cards/{runId}`, with each identifier route-safe, to the task detail, outside the navigation, as a modal Mantine Drawer over the board of that project, so that a reload or a link keeps it. Each board card SHALL link to it; the address SHALL make its project the chosen one; closing the Drawer SHALL lead to the board and return the focus; and choosing another project in it SHALL close it.

#### Scenario: Card link
- **WHEN** an operator follows a card's link
- **THEN** the task detail of that card opens over the board, and the board is not read again

#### Scenario: Identifier with a dot
- **WHEN** a card's run identifier is `run.1`
- **THEN** its link ends in `/cards/run~2E1`, every character other than a letter, a digit, `-`, or `_` written as `~` and two hexadecimal digits, and a reload of it shows that card's task detail

#### Scenario: Closing the task detail
- **WHEN** the operator closes the task detail opened from a card link, with Escape, its close button, or the browser's back
- **THEN** the board shows, and the focus is on that card's link, or on the board's heading for a detail opened from its address

#### Scenario: Task detail address of another project
- **WHEN** an operator opens the task detail address of a project other than the kept one
- **THEN** the picker names that project, the board shows it, and a later visit in the same browser starts with it

#### Scenario: Another project under the task detail
- **WHEN** the operator chooses another project in the Drawer's picker while a task detail is open
- **THEN** the Drawer closes and the board shows the chosen project

#### Scenario: Another project on another page
- **WHEN** the operator chooses another project in the header's picker on a page other than a task detail address
- **THEN** that page stays shown; only a task detail address leads to the board
