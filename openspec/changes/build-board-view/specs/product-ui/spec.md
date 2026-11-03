## ADDED Requirements

### Requirement: Web SPA project board
At `/app/` the SPA SHALL show the board of the chosen project as `readBoard` answers it: the six columns in lifecycle order under their short labels, with Accept and integrate as the merge gate between Review and Archived, and each card in its column with its step, stage state, gate, wait, placement obstacle, task end, merge gate state, open inbox items, and session activity indicator. It SHALL show no card data that the control plane did not answer.

#### Scenario: Native and platform-managed steps
- **WHEN** a card's current stage has the origin `native` or `platform-managed`
- **THEN** the card names the stage's identifier, or "platform-managed"

#### Scenario: Card at the merge gate
- **WHEN** a card in Review has a merge gate state other than `not-ready`
- **THEN** the card shows that state, and the Accept and integrate gate lists the card with it

#### Scenario: Reduced motion on the board
- **WHEN** the system asks for reduced motion and a card's session works
- **THEN** its indicator is still, and its label still says that the session works

### Requirement: Web SPA project picker
The header SHALL offer every project that `listProjects` answers, over all its pages, and the board SHALL show the chosen one. The browser SHALL keep the choice, and the SPA SHALL fall back to the first listed project when the kept one is not listed or the browser keeps nothing.

#### Scenario: Another project
- **WHEN** the operator chooses another project in the picker
- **THEN** the board reads and shows that project's board, and a later visit in the same browser starts with it

### Requirement: Web SPA board states
The board SHALL show that it loads until its reads answer; a first-run notice, when `listProjects` lists no project, that says how a project is created today, with no link to an unbuilt screen; a load error with a retry and without task data when a read fails, saying why for a 403 or 404; an empty board without cards; and notices when no worker is online and when `callerMayAct` is false.

#### Scenario: First run in the SPA
- **WHEN** `listProjects` answers no project
- **THEN** the board shows no column but a notice that names the `createProject` operation and that the project setup screen is not built yet, with no link

#### Scenario: Board read fails
- **WHEN** `readBoard` gets no answer, an undocumented status, or a body without the fields the board shows
- **THEN** the board shows no card and no column but an error with a retry, and the retry reads the board again

#### Scenario: Read-only board
- **WHEN** `readBoard` answers `callerMayAct` false
- **THEN** the board says that the operator may view it but not act on its tasks

### Requirement: Web SPA live board updates
While it shows a board, the SPA SHALL follow `streamProjectEvents` after the board's `position` and apply each `card-changed` and `board-changed` event above the board's position. It SHALL read the board again after `resync`, `stream-ended`, an unreadable event, or a stream that closed for good, open a new stream after a resync at once and after a closed stream 10 s later, and keep the events that arrive during a read.

#### Scenario: Live updates lost in the SPA
- **WHEN** the event stream drops and the browser reconnects
- **THEN** the board keeps its cards and shows the time of its last known state until the stream opens again

#### Scenario: Resync in the SPA
- **WHEN** the stream sends `resync`
- **THEN** the SPA closes it, reads the board, and opens a new stream after the new board's position

#### Scenario: Event already in the board
- **WHEN** an event's position is not above the board's position
- **THEN** the board does not change

### Requirement: Web SPA expired session on a request
When a board request answers 401 with the reason `unauthenticated`, the SPA SHALL show the sign-in page with the notice that the session expired, then read the session again for the next login's CSRF token, and take over an authenticated session that another tab logged in meanwhile.

#### Scenario: Board read after the session ended
- **WHEN** `readBoard` or `listProjects` answers 401 `unauthenticated`
- **THEN** the SPA shows the sign-in page saying that the session expired, and reads the session again

### Requirement: Web SPA task detail route
The SPA SHALL route `/app/projects/{projectId}/cards/{runId}` to the task detail, outside the navigation. Until change 29b `build-task-detail` builds it, its page SHALL be empty, name that change, and show no data, and no card SHALL link to it.

#### Scenario: Reserved task detail
- **WHEN** an operator opens a task detail address
- **THEN** the page names the task detail and change `build-task-detail`, and shows no data
