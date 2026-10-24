## MODIFIED Requirements

### Requirement: Single definition of the checks
The repository checks SHALL be defined once, as the `make verify` target, which SHALL run with the `.nvmrc` Node.js when nvm has it and the shell uses another version, check Node against `.nvmrc` and npm against the CI pin, and then run `npm test`, `make contract-compatibility`, `npm run verify:dependencies`, strict OpenSpec validation, `npm run verify:archive`, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run only `make verify`.

#### Scenario: Shell on another Node version
- **WHEN** `make verify` runs from a shell on another Node version and nvm has the `.nvmrc` version installed
- **THEN** it runs every check with the `.nvmrc` version and its npm

#### Scenario: Mismatched Node version
- **WHEN** `make verify` runs with a Node version that differs from `.nvmrc`, or with no Node.js, and nvm is missing or does not have that version
- **THEN** its toolchain check fails before running any other check and names the expected version, `make setup` with nvm, and a manual install without it

#### Scenario: CI verify job
- **WHEN** the GitHub `verify` job runs
- **THEN** its only check step is `make verify`

## ADDED Requirements

### Requirement: Archive dry run
`npm run verify:archive` SHALL copy `openspec/` to a temporary directory, archive every active change there in name order with the pinned OpenSpec CLI, its telemetry and update check off, and then run `validate --all --strict` on the copy, failing with the change name and the validator's message. It SHALL pass when no change is active, SHALL not change the repository, and SHALL remove the copy in every case.

#### Scenario: New capability without a Purpose
- **WHEN** an active change creates a capability whose delta has no `## Purpose`
- **THEN** `make verify` fails and names the change, the capability, and the placeholder Purpose issue

#### Scenario: Requirement too long once applied
- **WHEN** an active change's delta makes a main spec fail strict validation once archived
- **THEN** `make verify` fails and names the change and the validator's message

#### Scenario: No active change
- **WHEN** `openspec/changes/` holds only `archive/`
- **THEN** the check passes without archiving anything

#### Scenario: Repository unchanged
- **WHEN** the check finishes, passing or failing, also when `openspec/` holds symbolic links
- **THEN** the repository's files are unchanged and the temporary copy is removed

#### Scenario: Interrupted check
- **WHEN** the check receives SIGINT or SIGTERM
- **THEN** it stops the OpenSpec CLI, removes the temporary copy, and exits nonzero
