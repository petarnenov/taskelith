## MODIFIED Requirements

### Requirement: Environment check
`make doctor` SHALL check that git is available, that Node.js matches `.nvmrc`, that npm matches the CI pin, that the dependency tree is complete as `npm ls --all` reports it, and that the pre-push hook is enabled; it SHALL print each result with a remedy for each failure, exit non-zero when any check fails, and change nothing.

#### Scenario: Dependencies missing
- **WHEN** a clone has no `node_modules`, or lacks a locked package or workspace link, and npm is on `PATH` or the pinned Node.js is not active
- **THEN** `make doctor` reports the dependency check as failed with the remedy `make setup` and exits non-zero

#### Scenario: Complete environment
- **WHEN** every prerequisite is present
- **THEN** `make doctor` reports every check as passed and exits zero

#### Scenario: Node.js too old for the scripts
- **WHEN** the Node.js on `PATH` cannot run the repository's TypeScript scripts
- **THEN** `make doctor` prints that the scripts need a newer Node.js, names `nvm use`, and names `make setup` only for a pinned Node.js that is not installed

#### Scenario: Shell on another Node.js
- **WHEN** the Node.js on `PATH` does not match `.nvmrc`
- **THEN** the Node.js remedy names `nvm use` first and `make setup` only for a pinned Node.js that is not installed, and the npm remedy says to fix the Node.js check first instead of naming `make setup`

#### Scenario: Pinned Node.js without npm
- **WHEN** the Node.js on `PATH` matches `.nvmrc` but npm is not on `PATH`
- **THEN** the npm remedy names a reinstall of the pinned Node.js, which includes npm, and the dependency remedy says to fix the npm check first instead of naming `make setup`

### Requirement: Environment setup
`make setup` SHALL install what is missing and can be installed from the clone: the `.nvmrc` Node.js through nvm when nvm is installed, the CI npm pin, the dependencies from `package-lock.json` with `npm ci --ignore-scripts`, and the hook configuration; it SHALL then report the same checks as `make doctor`. It SHALL NOT install git or nvm.

#### Scenario: Fresh worktree
- **WHEN** `make setup` runs in a new worktree without `node_modules`
- **THEN** the dependencies are installed and every check passes

#### Scenario: Shell on another Node.js
- **WHEN** the calling shell uses a Node.js other than `.nvmrc` and nvm is installed
- **THEN** setup installs and uses the pinned version for its own run, says that its checks ran under that version, and tells the user to run `nvm use` before `make doctor` or `make verify`

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
