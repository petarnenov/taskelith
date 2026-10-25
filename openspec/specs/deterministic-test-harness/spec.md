# deterministic-test-harness Specification

## Purpose
Define the deterministic test harness, `@taskelith/testing`: simulated clocks, identifier sources, recorded seeds, named crash points, process kills and pauses, and network partitions through Toxiproxy, with which G2 failure scenarios rerun identically against real PostgreSQL and NATS.

## Requirements

### Requirement: Test-only harness package
The harness SHALL be the private workspace package `@taskelith/testing` in `packages/testing`, depending at runtime only on the kernel and Node built-ins, and the boundary check SHALL reject any other runtime import from its sources and an import of it from any file under `src/` of another package, of an application, or of the root package, while tests and scripts MAY import it.

#### Scenario: Product source imports the harness
- **WHEN** a file under the root `src/` or under `src/` of any other workspace package or application, such as `packages/kernel/src/`, `packages/adapters/<name>/src/`, or `apps/<name>/src/`, imports `@taskelith/testing`
- **THEN** the boundary check reports that product code cannot import the test harness

#### Scenario: Harness source imports a driver
- **WHEN** a file under `packages/testing/src/` imports `pg` or `@taskelith/sdlc` at runtime
- **THEN** the boundary check reports that the harness may import only the kernel and Node built-ins

#### Scenario: A test or script imports the harness
- **WHEN** a file under the `test/` directory of a package or application, the root `test/` directory, or `scripts/` imports `@taskelith/testing`
- **THEN** the boundary check reports no violation for that import

### Requirement: Simulated host clocks
`SimulatedHost` SHALL provide a wall clock that returns canonical `Instant` values and matches the SDLC module's `Clock` port, a deadline clock that counts suspended time, and an uptime clock that does not, all advanced only through `elapse`, `suspend`, and `shiftWallClock`, and SHALL reject negative or fractional durations.

#### Scenario: Suspend
- **WHEN** a host elapses 1 s and then suspends for 31 s
- **THEN** the deadline clock reads 32000 ms, the uptime clock reads 1000 ms, and the wall clock is 32 s after the start

#### Scenario: Wrong wall clock
- **WHEN** the wall clock is shifted backward by 6 s
- **THEN** the wall clock reads 6 s earlier and neither monotonic clock changes

### Requirement: Deterministic identifiers and recorded seeds
The harness SHALL provide sequential and seeded identifier sources that create identifiers through the kernel's `parseIdentifier` and fail on an identifier it rejects, and a seeded generator whose sequence depends only on its 32-bit seed; `seedFromEnvironment` SHALL return the seed in `TASKELITH_TEST_SEED` when it is set, reject a value that is not an integer from 0 to 2^32 − 1, and otherwise return a fresh seed, and `rerunHint` SHALL name the variable and the seed.

#### Scenario: Rerun with a recorded seed
- **WHEN** two generators or two seeded identifier sources are created with the same seed
- **THEN** they produce the same sequence

#### Scenario: Seed from the environment
- **WHEN** `TASKELITH_TEST_SEED` is `1234`
- **THEN** `seedFromEnvironment` returns 1234, and for `-1` or `abc` it throws

### Requirement: Named crash points
`CrashPoints` SHALL accept point names of an uppercase letter followed by letters and digits, optionally suffixed by `.before` or `.after`, SHALL record every point reached in order, and SHALL crash at the armed occurrence of the armed point, by throwing `SimulatedCrash` or by `SIGKILL` of its own process; `crashEnvironment` and `crashPointsFromEnvironment` SHALL arm a child process through `TASKELITH_CRASH_POINT` in the form `<point>` or `<point>@<occurrence>`.

#### Scenario: Crash at the second occurrence
- **WHEN** a run armed for `W1.after` at occurrence 2 reaches `W1.before`, `W1.after`, `W1.before`, and `W1.after`
- **THEN** the fourth call throws `SimulatedCrash` for `W1.after`, and the recorded points are those four

#### Scenario: Armed child process
- **WHEN** a child process started with `crashEnvironment('W1.after', 2)` reaches that occurrence
- **THEN** it exits by `SIGKILL` without passing any later point

### Requirement: Process kills and pauses
`ScenarioProcess` SHALL start a child as the leader of a new process group, deliver kill, pause (`SIGSTOP`), and resume (`SIGCONT`) to the whole group, report the exit code and signal, keep stdout and stderr, and reject a wait for output when the process closes without printing it.

#### Scenario: Kill a process tree
- **WHEN** a scenario process that started a child of its own is killed
- **THEN** it exits by `SIGKILL`, and its descendant is gone too

#### Scenario: Pause and resume
- **WHEN** the process group is paused and then resumed
- **THEN** every process of the group is stopped, and then runs again

### Requirement: Network partition through Toxiproxy
The harness SHALL control Toxiproxy through `fetch` without a client package, with operations to address a configured route by name, disconnect it, black-hole both directions, heal it, and reset the server, and SHALL report a failed API call with its method, path, status, and body.

#### Scenario: Partition and reconnect a real service
- **WHEN** an integration test connects to PostgreSQL or NATS through a Toxiproxy route, then disconnects or black-holes the route, then heals it
- **THEN** the client observes the failure while the route is partitioned and succeeds again after the heal

#### Scenario: Failed API call
- **WHEN** a route that the server does not know is disconnected
- **THEN** the call fails with an error naming `POST /proxies/<name>` and status 404

### Requirement: Toxiproxy integration service
The integration services SHALL run `ghcr.io/shopify/toxiproxy:2.13.0` pinned by its index digest, with the routes `postgres` and `nats` to those services from a mounted configuration, and SHALL publish its API and routes only on ephemeral loopback ports, exported as `TASKELITH_TOXIPROXY_URL`, `TASKELITH_POSTGRES_PROXY_URL`, and `TASKELITH_NATS_PROXY_URL`.

#### Scenario: Routes reach the services
- **WHEN** `make test` runs the integration tests
- **THEN** a PostgreSQL session through `TASKELITH_POSTGRES_PROXY_URL` answers queries and a connection through `TASKELITH_NATS_PROXY_URL` receives the NATS INFO greeting
