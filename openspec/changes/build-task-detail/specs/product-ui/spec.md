## REMOVED Requirements

### Requirement: Web SPA task detail route
**Reason**: It reserved an empty page until change `build-task-detail` built the task detail, and no card linked to it; this change builds it.
**Migration**: Replaced by "Web SPA task detail address", which routes the same address to the task detail Drawer, and by "Web SPA task detail" and "Web SPA live task detail".

## ADDED Requirements

### Requirement: Web SPA task detail
The task detail SHALL show the card as `readTaskDetail` answers it: each stage in graph order with its column, state, and gates with their state and required evidence; why the card does not move; the requirement traceability with evidence freshness, or that none is recorded; the run binding; and the run's tasks in admission order with admission, ownership generation, delegation, session indicator, obstacle, and task end.

#### Scenario: Stale gate in the SPA
- **WHEN** `readTaskDetail` answers a gate in the state `stale`
- **THEN** the task detail shows that gate as stale beside the evidence kind it needs

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
While the task detail is open over the live board of its project, the SPA SHALL read it again when the board shows a new state of its card at a position above the detail's, one read at a time and once more after a read for the changes during it, and SHALL show the time of the detail's state while the board's live updates are lost.

#### Scenario: Card changes under the task detail
- **WHEN** a `card-changed` event of the open card arrives above the detail's position
- **THEN** the SPA reads the task detail again and shows the new answer

#### Scenario: Another card changes
- **WHEN** a `card-changed` event of another card arrives
- **THEN** the SPA does not read the task detail again

#### Scenario: Live updates lost under the task detail
- **WHEN** the board's event stream drops
- **THEN** the task detail shows the time of its state, its `asOf`, until the stream opens again

### Requirement: Web SPA loading status
Every loading status line of the SPA, the session check included, SHALL name what loads, and SHALL show no spinning loader when the system asks for reduced motion.

#### Scenario: Session check under reduced motion
- **WHEN** the system asks for reduced motion while the SPA checks the session
- **THEN** the page says that it checks the session, and no loader spins

### Requirement: Web SPA task detail address
The SPA SHALL route `/app/projects/{projectId}/cards/{runId}` to the task detail, outside the navigation, as a Mantine Drawer over the board of that project, so that a reload or a link keeps it. Each board card SHALL link to it; the address SHALL make its project the chosen one; closing the Drawer SHALL lead to the board; and choosing another project SHALL close it.

#### Scenario: Card link
- **WHEN** an operator follows a card's link
- **THEN** the task detail of that card opens over the board, and the board is not read again

#### Scenario: Task detail address of another project
- **WHEN** an operator opens the task detail address of a project other than the kept one
- **THEN** the picker names that project, the board shows it, and a later visit in the same browser starts with it

#### Scenario: Another project under the task detail
- **WHEN** the operator chooses another project in the picker while a task detail is open
- **THEN** the Drawer closes and the board shows the chosen project
