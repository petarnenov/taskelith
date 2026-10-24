## MODIFIED Requirements

### Requirement: Environment check
`make doctor` SHALL run with the `.nvmrc` Node.js when nvm has it installed and the shell uses another version, and otherwise with the shell's Node.js; it SHALL check that git is available, that Node.js matches `.nvmrc`, that npm matches the CI pin, that the dependency tree is complete as `npm ls --all` reports it, and that the pre-push hook is enabled; it SHALL print each result with a remedy for each failure, exit non-zero when any check fails, and change nothing.

#### Scenario: Dependencies missing
- **WHEN** a clone has no `node_modules`, or lacks a locked package or workspace link, and npm is on `PATH` or the pinned Node.js is not active
- **THEN** `make doctor` reports the dependency check as failed with the remedy `make setup` and exits non-zero

#### Scenario: Complete environment
- **WHEN** every prerequisite is present
- **THEN** `make doctor` reports every check as passed and exits zero

#### Scenario: Node.js too old for the scripts
- **WHEN** the selected Node.js cannot run the repository's TypeScript scripts, or no Node.js is found
- **THEN** `make doctor` prints that and names `make setup` with nvm and a manual install of the pinned Node.js without it

#### Scenario: Shell on another Node.js after setup
- **WHEN** the shell uses a Node.js other than `.nvmrc` and nvm has the pinned version installed
- **THEN** `make doctor` runs its checks with the pinned version, reports the Node.js check as passed, and says that `nvm use` is needed only for running `npm` or `node` directly in that shell

#### Scenario: Shell on another Node.js
- **WHEN** the shell uses a Node.js other than `.nvmrc` and nvm is missing or does not have the pinned version
- **THEN** the Node.js remedy names `make setup` with nvm and a manual install without it, and the npm remedy says to fix the Node.js check first instead of naming `make setup`

#### Scenario: Pinned Node.js without npm
- **WHEN** the selected Node.js matches `.nvmrc` but npm is not on `PATH`
- **THEN** the npm remedy names a reinstall of the pinned Node.js, which includes npm, and the dependency remedy says to fix the npm check first instead of naming `make setup`

### Requirement: Environment setup
`make setup` SHALL install what is missing and can be installed from the clone: the `.nvmrc` Node.js through nvm when nvm is installed, made nvm's default version, the CI npm pin, the dependencies from `package-lock.json` with `npm ci --ignore-scripts`, and the hook configuration; it SHALL then report the same checks as `make doctor`. It SHALL NOT install git or nvm.

#### Scenario: Fresh worktree
- **WHEN** `make setup` runs in a new worktree without `node_modules`
- **THEN** the dependencies are installed and every check passes

#### Scenario: Shell on another Node.js
- **WHEN** the calling shell uses a Node.js other than `.nvmrc` and nvm is installed
- **THEN** setup installs and uses the pinned version for its own run, makes it nvm's default, says that its checks ran under that version and that `make doctor` and `make verify` select it themselves, and names `nvm use` only for running `npm` or `node` directly in that shell

#### Scenario: npm pin changes
- **WHEN** npm is on `PATH` but does not match the CI pin
- **THEN** setup installs the pinned npm first and then reinstalls the dependencies with it

#### Scenario: npm missing
- **WHEN** setup runs under the pinned Node.js and npm is not on `PATH`
- **THEN** setup runs no npm command, still enables the hook when git is available, and reports the npm check as failed with the reinstall remedy

#### Scenario: System tool missing
- **WHEN** git or nvm is missing
- **THEN** setup does not install it, and the report names what to install

#### Scenario: Pinned Node.js unavailable
- **WHEN** the pinned Node.js cannot be used, for example because nvm is missing
- **THEN** setup installs nothing into the other Node.js and reports the Node.js check as failed
