## MODIFIED Requirements

### Requirement: Single definition of the checks
The repository checks SHALL be defined once, as the `make verify` target, which SHALL run with the `.nvmrc` Node.js when nvm has it installed and the shell uses another version, and SHALL verify the Node version against `.nvmrc` and the npm version against the CI pin before running `npm test`, `npm run verify:dependencies`, strict validation of all OpenSpec artifacts, and `npm run verify:package`, in that order; the GitHub `verify` job SHALL run `make verify` and no separate list of checks.

#### Scenario: Shell on another Node version
- **WHEN** `make verify` runs from a shell on another Node version and nvm has the `.nvmrc` version installed
- **THEN** it runs every check with the `.nvmrc` version and its npm

#### Scenario: Mismatched Node version
- **WHEN** `make verify` runs with a Node version that differs from `.nvmrc` and nvm is missing or does not have that version
- **THEN** it fails before running any check and names the expected version, `make setup` with nvm, and a manual install without it

#### Scenario: CI verify job
- **WHEN** the GitHub `verify` job runs
- **THEN** its only check step is `make verify`

### Requirement: Local gate before push
`make hooks` SHALL set `core.hooksPath` to `.githooks`, and the `.githooks/pre-push` hook SHALL run `make verify` and block the push when it fails.

#### Scenario: Failing check
- **WHEN** a push is attempted with hooks enabled and a check fails
- **THEN** the push is rejected

#### Scenario: Branch deletion push
- **WHEN** a remote branch is deleted with `git push origin --delete <branch>` with hooks enabled, a Node version that differs from `.nvmrc`, and no `.nvmrc` version available through nvm
- **THEN** the `pre-push` hook runs `make verify`, its toolchain check fails, and the deletion is refused
