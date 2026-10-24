## MODIFIED Requirements

### Requirement: Comment length bound
A code comment SHALL span at most two lines of at most 80 characters each, counting every line of the comment including block-comment delimiters, counting indentation and the comment marker, and counting the whole physical line of a trailing comment.

#### Scenario: New comment too long
- **WHEN** a change adds a comment of three lines, or a line of more than 80 characters
- **THEN** `make verify` fails, and the author shortens it

#### Scenario: One-line block comment
- **WHEN** a block comment holds one line of text between `/**` and `*/` lines
- **THEN** it counts as three lines and is written as `/** text */` instead

### Requirement: Comment length scope
The comment length bound SHALL apply to every comment in tracked authored source, script, build, and configuration files: `*.ts`, `*.js`, `*.sh`, `*.yml`, and `*.yaml` files, files named `Makefile` or `Dockerfile`, and extensionless scripts. Generated files, meaning files a tool writes and no one edits by hand, lockfiles, captured third-party artifacts under `docs/qualification/`, and fixture copies of such captures SHALL be exempt.

#### Scenario: Existing long comment touched
- **WHEN** a change's diff edits a line of an existing comment that exceeds the bound
- **THEN** the change shortens that comment to the bound

#### Scenario: Existing long comment untouched
- **WHEN** a tracked file in scope contains a comment that exceeds the bound and no change's diff touches it
- **THEN** the bound still applies to it

#### Scenario: Generated file
- **WHEN** a generated file or lockfile, such as `tools/speckit/requirements.txt`, contains a longer comment
- **THEN** the bound does not apply to it

#### Scenario: Captured evidence
- **WHEN** a captured third-party file under `docs/qualification/`, or its copy in the SpecKit plugin fixtures, contains a longer comment
- **THEN** the bound does not apply to it

## ADDED Requirements

### Requirement: Comment length check
`make verify` SHALL fail when a comment in a tracked file within the comment length scope exceeds the bound, and SHALL report each violation with the file, the line, and the reason.

#### Scenario: Violation reported
- **WHEN** a tracked script has a comment line of 95 characters
- **THEN** `make verify` fails and prints the file, the line, and that the line is 95 characters with a maximum of 80

#### Scenario: Comment markers in code
- **WHEN** a string, template literal, regular expression, or shell expansion contains `//`, `/*`, or `#`
- **THEN** the check does not treat it as a comment
