## MODIFIED Requirements

### Requirement: Integration services
The integration services SHALL be PostgreSQL, NATS, and the Toxiproxy partition proxy in Docker Compose, pinned by the digests the G2 infrastructure evaluation records, with waited-for health checks, data only in memory, JetStream enabled by a mounted configuration, Toxiproxy routes to PostgreSQL and NATS from a mounted configuration, and ephemeral localhost ports. `make services-up` SHALL start them in a per-worktree project and print their URLs; `make services-down` SHALL remove that project with its data. Without Docker, `make services-up` and `make test` SHALL fail naming Docker.

#### Scenario: Services start
- **WHEN** Docker is available and `make services-up` runs
- **THEN** PostgreSQL 18.6, NATS 2.15.1 with JetStream, and Toxiproxy 2.13.0 run, healthy, on `127.0.0.1`, and the command prints `TASKELITH_POSTGRES_URL`, `TASKELITH_NATS_URL`, `TASKELITH_TOXIPROXY_URL`, `TASKELITH_POSTGRES_PROXY_URL`, and `TASKELITH_NATS_PROXY_URL` with their ports

#### Scenario: Docker unavailable
- **WHEN** the Docker daemon cannot be reached
- **THEN** `make services-up`, `make test`, and therefore `make verify`, fail before running tests and say that Docker is needed
