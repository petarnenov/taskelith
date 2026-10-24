## MODIFIED Requirements

### Requirement: Comment length scope
The comment length bound SHALL apply to every comment in tracked authored source, script, build, and configuration files: `*.ts`, `*.mts`, `*.cts`, `*.js`, `*.mjs`, `*.cjs`, `*.sh`, `*.yml`, and `*.yaml` files, files named `Makefile` or `Dockerfile`, and extensionless scripts. Generated files, meaning files a tool writes and no one edits by hand, lockfiles, captured third-party artifacts under `docs/qualification/`, and fixture copies of such captures SHALL be exempt.

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
