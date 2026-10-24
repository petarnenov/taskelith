## ADDED Requirements

### Requirement: Integration services
The integration services SHALL be PostgreSQL and NATS in Docker Compose, pinned by the digests the G2 infrastructure evaluation records, with waited-for health checks, data only in memory, JetStream enabled by a mounted configuration, and ephemeral localhost ports. `make services-up` SHALL start them in a per-worktree project and print their URLs; `make services-down` SHALL remove that project with its data. Without Docker, `make services-up` and `make test` SHALL fail naming Docker.

#### Scenario: Services start
- **WHEN** Docker is available and `make services-up` runs
- **THEN** PostgreSQL 18.6 and NATS 2.15.1 with JetStream run, healthy, on `127.0.0.1`, and the command prints `TASKELITH_POSTGRES_URL` and `TASKELITH_NATS_URL` with their ports

#### Scenario: Docker unavailable
- **WHEN** the Docker daemon cannot be reached
- **THEN** `make services-up`, and therefore `make test` and `make verify`, fail before running tests and say that Docker is needed

### Requirement: Integration tests in verification
`make verify` SHALL run `npm test` through `make test`, which starts the services in its own Compose project named from the worktree path, passes their URLs, and stops only that project, also when tests fail. Integration tests SHALL be named `*.integration.test.ts` in a package's `test/`, run under the coverage gate, and fail with a remedy when the URLs are unset or a service is unreachable.

#### Scenario: Services reachable
- **WHEN** `make verify` runs with Docker available
- **THEN** an integration test confirms PostgreSQL `server_version_num` 180006, and NATS version 2.15.1 with JetStream enabled

#### Scenario: Services not started
- **WHEN** `npm test` runs without the service URLs or the integration services
- **THEN** the integration tests fail and name `make test`, `make verify`, or the URLs of `make services-up` as the remedy

#### Scenario: Parallel worktrees
- **WHEN** `make verify` runs in two worktrees at the same time
- **THEN** each uses its own Compose project and host ports and stops only its own project, so neither run's services are stopped by the other
