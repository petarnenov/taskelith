## ADDED Requirements

### Requirement: Event log tables
The adapter SHALL keep the event log in `ui_events`, whose entries a change's transaction inserts without a position and with its transaction id, and `ui_event_sequence`, its head and retention floor; one assigner SHALL number, under the sequence row's lock and in insertion order, only entries whose transaction is older than every open transaction, never reusing a position; its down migration SHALL remove both tables.

#### Scenario: Crash between commit and numbering
- **WHEN** the process dies after a change committed and before its entries were numbered
- **THEN** the next numbering gives each entry one position, and a rerun numbers nothing

#### Scenario: A later inserter commits first
- **WHEN** a transaction that inserted an entry is still open and a transaction that inserted after it commits
- **THEN** no numbering gives the later entry a position until the earlier transaction ends, and then both are numbered in insertion order
