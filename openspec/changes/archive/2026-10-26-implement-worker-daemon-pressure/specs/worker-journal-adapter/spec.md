## ADDED Requirements

### Requirement: Writes refused for lack of space
A write that SQLite refuses for lack of space SHALL roll back as a whole, leave the journal usable, fail with the reason `disk-full`, and call the hook the journal and the worker root accept for it, once per refusal.

#### Scenario: Full disk at commit
- **WHEN** the commit of a command is refused with `SQLITE_FULL`
- **THEN** the journal holds no intent, the hook is called once, and the next write commits
