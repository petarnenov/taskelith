## ADDED Requirements

### Requirement: Docker slot lock
`make test` SHALL hold a host-wide, per-user Docker slot while its integration services run: a first-in, first-out queue of ticket directories in `${XDG_STATE_HOME:-$HOME/.local/state}/taskelith/docker-slot.lock`, created with `mkdir`, no `flock`, never reusing a ticket path. A waiter SHALL remove a ticket only when its holder's process and process group are gone, print the holder, and log wait and hold times in `docker-slot.log`.

#### Scenario: Two runs at once
- **WHEN** `make test` runs in two worktrees of one user at the same time
- **THEN** the later run waits, prints the holder's process and worktree, and starts its services after the earlier run releases the slot

#### Scenario: Holder killed
- **WHEN** the process that holds the slot dies without releasing it, and its command has ended
- **THEN** the next waiter removes its ticket and takes the slot

#### Scenario: Command outlives its holder
- **WHEN** the holder process is killed while its command still runs
- **THEN** the next waiter keeps waiting until every process of that command has ended

#### Scenario: Interrupted wait
- **WHEN** a waiting run is interrupted
- **THEN** it removes its own ticket and exits without starting services

## MODIFIED Requirements

### Requirement: Integration tests in verification
`make verify` of the full profile SHALL run `npm test` through `make test`, which starts the services in its own Compose project named from the worktree path, passes their URLs, and stops only that project, also when tests fail. Integration tests SHALL be named `*.integration.test.ts` in a package's `test/`, run under the coverage gate, and fail with a remedy when the URLs are unset or a service is unreachable.

#### Scenario: Services reachable
- **WHEN** `make verify` of the full profile runs with Docker available
- **THEN** an integration test confirms PostgreSQL `server_version_num` 180006, and NATS version 2.15.1 with JetStream enabled

#### Scenario: Services not started
- **WHEN** `npm test` runs without the service URLs or the integration services
- **THEN** the integration tests fail and name `make test`, `make verify`, or the URLs of `make services-up` as the remedy

#### Scenario: Parallel worktrees
- **WHEN** `make verify` of the full profile runs in two worktrees at the same time
- **THEN** each uses its own Compose project and host ports and stops only its own project, so neither run's services are stopped by the other
