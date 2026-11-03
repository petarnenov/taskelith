## ADDED Requirements

### Requirement: Event streams
The control plane SHALL serve `streamProjectEvents` and `streamInstallationEvents` as `text/event-stream` with `Cache-Control: no-store` after the role check of wire contracts section 3, and SHALL send each event of the stream's scope as a frame with its position as `id`, its type as `event`, and one `data` line valid against `ProjectEvent` or `InstallationEvent`, in position order.

#### Scenario: Event after the open
- **WHEN** a `project-viewer` streams its project's events and a change of that project commits and is numbered
- **THEN** the stream sends the change's event with its position, and no event of another scope

### Requirement: Event stream cursor
A stream SHALL resume after `Last-Event-ID`, else after `after`, else at the head; a cursor below the retention floor SHALL get a `resync` `cursor-expired`, one beyond the head `cursor-unknown`, each with status 200 and no `id`, after which the server ends the stream; only a malformed cursor SHALL answer 400.

#### Scenario: Reconnect after an event
- **WHEN** a client reconnects with `Last-Event-ID` of an event it received, and with an older `after`
- **THEN** the stream sends the retained events after that `Last-Event-ID` and then the live ones

#### Scenario: Pruned cursor
- **WHEN** a client streams after a position below the retention floor
- **THEN** it receives the `resync` frame `cursor-expired` and the stream ends

### Requirement: Event stream ends
A stream SHALL end with `stream-ended` `role-changed` when a change of its principal's roles in its project, or of its `installation-owner` role, commits after it opened, SHALL end without a frame when its login session ends, SHALL be dropped when more than 1 MiB of it is unsent, and SHALL send a keep-alive comment every 15 s.

#### Scenario: Role change
- **WHEN** a member's role in the project changes while it streams the project's events
- **THEN** the stream sends `stream-ended` with reason `role-changed` and ends

#### Scenario: Logout
- **WHEN** a browser logs out while it streams events
- **THEN** its stream ends without a frame, and a bearer's stream goes on

### Requirement: Event retention window
The control plane SHALL keep a numbered event for `TASKELITH_EVENT_RETENTION_HOURS` hours, 24 unless set to a positive whole number, SHALL prune older events by a periodic job that raises the stored retention floor, and SHALL refuse to start with another value of the setting.

#### Scenario: Default window
- **WHEN** the setting is absent
- **THEN** events numbered more than 24 hours ago are pruned and the floor rises to the highest pruned position

### Requirement: View position from the event log
The agent session reads SHALL carry as their view position the head of the event log, read before the view, so that every event at or below it is reflected in the view.

#### Scenario: Read after an event
- **WHEN** a client reads an agent session after events were numbered
- **THEN** the answer's `position` is the head of the event log when the read started

## REMOVED Requirements

### Requirement: View position before the event stream
**Reason**: the event log of this change assigns positions, so a view no longer reads before any event.
**Migration**: "View position from the event log" replaces it; a client compares the position with the events' as before.
