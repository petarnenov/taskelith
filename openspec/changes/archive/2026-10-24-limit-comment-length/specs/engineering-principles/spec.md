## ADDED Requirements

### Requirement: Comment length bound
A code comment SHALL span at most two lines of at most 80 characters each, counting every line of the comment including block-comment delimiters, counting indentation and the comment marker, and counting the whole physical line of a trailing comment.

#### Scenario: New comment too long
- **WHEN** a change adds a comment of three lines, or a line of more than 80 characters
- **THEN** review treats it as a finding, and the author shortens it

#### Scenario: One-line block comment
- **WHEN** a block comment holds one line of text between `/**` and `*/` lines
- **THEN** it counts as three lines and is written as `/** text */` instead

### Requirement: Comment length scope
The comment length bound SHALL apply to every comment whose lines a change's diff adds or edits, in authored source, script, build, and configuration files; generated files, meaning files a tool writes and no one edits by hand, lockfiles, and captured third-party artifacts under `docs/qualification/` SHALL be exempt.

#### Scenario: Existing long comment touched
- **WHEN** a change's diff edits a line of an existing comment that exceeds the bound
- **THEN** the change shortens that comment to the bound

#### Scenario: Generated file
- **WHEN** a generated file or lockfile, such as `tools/speckit/requirements.txt`, contains a longer comment
- **THEN** the bound does not apply to it

#### Scenario: Captured evidence
- **WHEN** a captured third-party file under `docs/qualification/` contains a longer comment
- **THEN** the bound does not apply to it
