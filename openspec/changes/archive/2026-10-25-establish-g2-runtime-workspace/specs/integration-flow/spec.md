## MODIFIED Requirements

### Requirement: Single definition of the checks
The checks SHALL be defined once, as `make verify`, which SHALL run with the `.nvmrc` Node.js when nvm has it and the shell uses another, check Node against `.nvmrc` and npm against the CI pin, then run `make test`, `make contract-compatibility`, `npm run verify:dependencies`, strict OpenSpec validation, `npm run verify:archive`, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run only `make verify`.

#### Scenario: Shell on another Node version
- **WHEN** `make verify` runs from a shell on another Node version and nvm has the `.nvmrc` version installed
- **THEN** it runs every check with the `.nvmrc` version and its npm

#### Scenario: Mismatched Node version
- **WHEN** `make verify` runs with a Node version that differs from `.nvmrc`, or with no Node.js, and nvm is missing or does not have that version
- **THEN** its toolchain check fails before running any other check and names the expected version, `make setup` with nvm, and a manual install without it

#### Scenario: CI verify job
- **WHEN** the GitHub `verify` job runs
- **THEN** its only check step is `make verify`

#### Scenario: Tests run through make test
- **WHEN** `make verify` reaches the tests
- **THEN** it runs `make test`, which runs `npm test` against integration services of its own and removes them afterwards
