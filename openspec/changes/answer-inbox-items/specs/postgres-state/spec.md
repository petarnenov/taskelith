## ADDED Requirements

### Requirement: Inbox answer tables
Migration `1792934200000` SHALL add `inbox_answer_keys`, keyed by item and key, `reconciliation_answers`, keyed by item, whose rows a trigger refuses to update or delete, `reconciliation_item_projections`, and an `unrecorded-process` card touch that a trigger writes per new unrecorded process; its down migration SHALL drop the tables, the touches, and the functions.

#### Scenario: A reconciliation answer is changed
- **WHEN** a statement updates or deletes a row of `reconciliation_answers`
- **THEN** the statement fails and the row stays

#### Scenario: The migration goes down
- **WHEN** the migrations go down past `1792934200000`
- **THEN** none of its tables, functions, or `unrecorded-process` touches remains

#### Scenario: An unrecorded process is recorded
- **WHEN** a row is inserted into `unrecorded_processes`
- **THEN** the same transaction writes an `unrecorded-process` touch naming its worker
