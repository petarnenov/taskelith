## MODIFIED Requirements

### Requirement: Environment check
`make doctor` SHALL run with the `.nvmrc` Node.js when nvm has it installed and the shell uses another version, and otherwise with the shell's Node.js; it SHALL check git, that Node.js matches `.nvmrc` and npm the CI pin, that `npm ls --all` passes, that the hooks and the inventory merge driver are configured, and that the Docker daemon and Compose are reachable; it SHALL print each result with a remedy for each failure, exit non-zero when any check fails, and change nothing.

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

#### Scenario: Another Node.js earlier in PATH
- **WHEN** nvm has the pinned version installed and a Node.js outside nvm comes before nvm's directory in `PATH`
- **THEN** `make doctor` puts the pinned version's directory first in `PATH` for its run, runs its checks with the pinned version, and reports the Node.js check as passed

#### Scenario: Shell on another Node.js
- **WHEN** the shell uses a Node.js other than `.nvmrc` and nvm is missing or does not have the pinned version
- **THEN** the Node.js remedy names `make setup` with nvm and a manual install without it, and the npm remedy says to fix the Node.js check first instead of naming `make setup`

#### Scenario: Pinned Node.js without npm
- **WHEN** the selected Node.js matches `.nvmrc` but npm is not on `PATH`
- **THEN** the npm remedy names a reinstall of the pinned Node.js, which includes npm, and the dependency remedy says to fix the npm check first instead of naming `make setup`

#### Scenario: Merge driver missing
- **WHEN** git is available and `merge.dependency-inventory.driver` is not set to `true`
- **THEN** `make doctor` reports the merge driver check as failed with the remedy `make setup` and exits non-zero

#### Scenario: Docker unavailable
- **WHEN** `docker info` or `docker compose version` fails
- **THEN** `make doctor` reports the Docker check as failed with a remedy to install and start Docker with the Compose plugin, and exits non-zero
