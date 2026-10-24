## ADDED Requirements

### Requirement: Comment length bound
Every code comment that a change adds or edits SHALL span at most two lines of at most 80 characters each, counting indentation and the comment marker; captured third-party artifacts kept as evidence are exempt.

#### Scenario: New comment too long
- **WHEN** a change adds a comment of three lines, or a line of more than 80 characters
- **THEN** review treats it as a finding, and the author shortens it

#### Scenario: Existing long comment touched
- **WHEN** a change edits an existing comment that exceeds the bound
- **THEN** the change shortens it to the bound

#### Scenario: Captured evidence
- **WHEN** a captured third-party file under `docs/qualification/` contains a longer comment
- **THEN** the bound does not apply to it
