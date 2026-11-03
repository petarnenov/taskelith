## ADDED Requirements

### Requirement: Event log tables
The adapter SHALL keep the event log in `ui_events`, whose entries a change's transaction inserts without a position, and `ui_event_sequence`, its head and retention floor; one assigner SHALL number committed entries after the commit, in commit order under the sequence row's lock, never reusing a position; its down migration SHALL remove both tables.

#### Scenario: Crash between commit and numbering
- **WHEN** the process dies after a change committed and before its entries were numbered
- **THEN** the next numbering gives each entry one position, and a rerun numbers nothing
