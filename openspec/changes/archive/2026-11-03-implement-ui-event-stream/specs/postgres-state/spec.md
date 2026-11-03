## ADDED Requirements

### Requirement: Event log tables
The adapter SHALL keep the event log in `ui_events`, whose entries a change's transaction inserts without a position and with its transaction id, and `ui_event_sequence`, its head and retention floor; one assigner SHALL number, under the sequence row's lock and in `entry_id` order, only entries whose transaction id is below the oldest open transaction's or is not of this cluster, never reusing a position; its down migration SHALL remove both tables.

#### Scenario: Crash between commit and numbering
- **WHEN** the process dies after a change committed and before its entries were numbered
- **THEN** the next numbering gives each entry one position, and a rerun numbers nothing

#### Scenario: A later inserter commits while an earlier transaction is open
- **WHEN** a transaction that inserted an entry is still open and a transaction whose first write came after it inserts an entry and commits
- **THEN** no numbering gives the later entry a position until the earlier transaction ends

#### Scenario: An older transaction inserts after a younger one
- **WHEN** a transaction that wrote another table first inserts its entry after a younger transaction inserted one, and commits while the younger one is open
- **THEN** its entry is numbered first, and the younger one's after that transaction ends

#### Scenario: An entry restored from another cluster
- **WHEN** an unnumbered entry's transaction id is not of this cluster, as after a restore
- **THEN** the next numbering gives it a position in `entry_id` order with the other entries
