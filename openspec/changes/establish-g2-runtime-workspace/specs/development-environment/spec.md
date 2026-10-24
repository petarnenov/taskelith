## ADDED Requirements

### Requirement: Integration services
`make services-up` SHALL start PostgreSQL and NATS through Docker Compose with the image digests that the G2 infrastructure evaluation records, a fixed project name, health checks it waits for, data only in container memory, NATS JetStream enabled by its mounted configuration, and ports bound to localhost; `make services-down` SHALL remove them with their data. Without Docker, `make services-up` SHALL fail with a message naming Docker.

#### Scenario: Services start
- **WHEN** Docker is available and `make services-up` runs
- **THEN** PostgreSQL 18.6 and NATS 2.15.1 with JetStream run, healthy, on `127.0.0.1` ports 55432 and 54222

#### Scenario: Docker unavailable
- **WHEN** the Docker daemon cannot be reached
- **THEN** `make services-up`, and therefore `make test` and `make verify`, fail before running tests and say that Docker is needed

### Requirement: Integration tests in verification
`make verify` SHALL run `npm test` through `make test`, which starts the integration services first and stops them afterwards, also when tests fail. Integration tests SHALL be named `*.integration.test.ts` in a package's `test/` directory, run with every other test under the coverage gate, and fail with a remedy naming `make services-up` when a service is unreachable.

#### Scenario: Services reachable
- **WHEN** `make verify` runs with Docker available
- **THEN** an integration test confirms PostgreSQL `server_version_num` 180006, and NATS version 2.15.1 with JetStream enabled

#### Scenario: Services not started
- **WHEN** `npm test` runs without the integration services
- **THEN** the integration tests fail and name `make services-up`, `make test`, or `make verify` as the remedy
