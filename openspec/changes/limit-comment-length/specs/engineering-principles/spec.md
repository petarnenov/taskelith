## ADDED Requirements

### Requirement: Comment length bound
Every code comment whose lines a change's diff adds or edits, in authored source, script, build, and configuration files, SHALL span at most two lines of at most 80 characters each, counting every line of the comment including block-comment delimiters, and counting indentation and the comment marker; generated files, lockfiles, and captured third-party artifacts under `docs/qualification/` are exempt.

#### Scenario: New comment too long
- **WHEN** a change adds a comment of three lines, or a line of more than 80 characters
- **THEN** review treats it as a finding, and the author shortens it

#### Scenario: Existing long comment touched
- **WHEN** a change's diff edits a line of an existing comment that exceeds the bound
- **THEN** the change shortens that comment to the bound

#### Scenario: Generated file
- **WHEN** a generated file or lockfile, such as `tools/speckit/requirements.txt`, contains a longer comment
- **THEN** the bound does not apply to it

#### Scenario: Captured evidence
- **WHEN** a captured third-party file under `docs/qualification/` contains a longer comment
- **THEN** the bound does not apply to it
