## ADDED Requirements

### Requirement: Inbox answer tables
Migration `1792934200000` SHALL add `inbox_answer_keys`, keyed by item and idempotency key, and `reconciliation_answers`, keyed by item, whose rows a trigger refuses to update or delete; its down migration SHALL drop both tables and the trigger's function.

#### Scenario: A reconciliation answer is changed
- **WHEN** a statement updates or deletes a row of `reconciliation_answers`
- **THEN** the statement fails and the row stays

#### Scenario: The migration goes down
- **WHEN** the migrations go down past `1792934200000`
- **THEN** neither table nor the function remains
