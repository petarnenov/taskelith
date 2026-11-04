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

### Requirement: Shared result helpers
The harness SHALL provide `value`, which returns the value of a successful result and fails the test with the failure as JSON otherwise, `failed`, which returns the error of a failed result and fails the test otherwise, and `id`, which parses an identifier through the kernel's `parseIdentifier` and `value`. The harness SHALL depend on no workspace package but the kernel, so that the tests of every package share these helpers instead of defining their own copies.

#### Scenario: Successful result
- **WHEN** a test passes a successful result to `value`
- **THEN** `value` returns the result's value

#### Scenario: Failed result
- **WHEN** a test passes a failed result to `value`, or text that the kernel rejects to `id`
- **THEN** the call throws an assertion error that contains the failure

#### Scenario: Expected failure
- **WHEN** a test passes a failed result to `failed`
- **THEN** `failed` returns the result's error, and for a successful result it throws an assertion error

#### Scenario: Harness manifest names another workspace package
- **WHEN** any dependency field of the `@taskelith/testing` manifest names a workspace package other than `@taskelith/kernel`
- **THEN** the boundary check reports a violation naming that package

### Requirement: Scenario result records
The harness SHALL build a scenario's result with `scenario`, `seed`, `rerunHint`, `host`, `arch`, `commit`, `target`, `outcome`, an optional `detail`, and `recordedAt`, where `target` is `harness-composition`, `compose-installation`, `host-test-suite`, or `linux-test-container` and `outcome` is `passed` or `failed`, and SHALL reject a malformed scenario name (not lowercase words joined by hyphens), a seed that is not an integer from 0 to 2^32 − 1, and any other target or outcome.

#### Scenario: Record a result
- **WHEN** a file recorder with host `Darwin 25.6.0`, architecture `arm64`, and commit `f9ba7a5` records the run `worker-disk-loss` with seed 1234, target `compose-installation`, and outcome `passed`
- **THEN** the file gains one JSON line with those values, `rerunHint` `rerun with TASKELITH_TEST_SEED=1234`, and the recording time

#### Scenario: Malformed run
- **WHEN** a run has the outcome `uncertain` or the seed −1
- **THEN** recording it fails and nothing is written

#### Scenario: Result without an acceptance context
- **WHEN** the run environment has no acceptance context
- **THEN** the result has no `acceptance` field, as before this change

### Requirement: Opt-in scenario results file
`scenarioRecorderFromEnvironment` SHALL append each result as one JSON line to the file that `TASKELITH_SCENARIO_RESULTS` names, resolved against the working directory, with the commit from `git rev-parse HEAD`, and SHALL record nothing when the variable is unset or empty.

#### Scenario: Evidence run
- **WHEN** `TASKELITH_SCENARIO_RESULTS` is `results.jsonl` and a scenario records a run
- **THEN** `results.jsonl` in the working directory gains one line whose `commit` is the `HEAD` commit

#### Scenario: Ordinary test run
- **WHEN** `TASKELITH_SCENARIO_RESULTS` is unset and a scenario records a valid run
- **THEN** no file is written

### Requirement: Acceptance context from the environment
`runEnvironment` SHALL read `TASKELITH_ACCEPTANCE`, when set and nonempty, as a JSON acceptance context, SHALL fail on a malformed one, and every result recorded with that environment SHALL carry the context as `acceptance`.

#### Scenario: Acceptance run
- **WHEN** `TASKELITH_ACCEPTANCE` holds a valid context and a scenario records a run
- **THEN** its result carries that context as `acceptance`

### Requirement: Acceptance context fields
An acceptance context SHALL name a matrix entry (`linux-ubuntu-24.04-x86_64`, `linux-ubuntu-24.04-arm64`, `macos-26-x86_64`, or `macos-26-arm64`), a G2 acceptance row (`service-lifecycle`, `process-ownership`, `journal-and-storage`, `cancellation`, or `connectivity`), a nonempty `proof`, and a `platform` with nonempty `os`, `architecture`, `kernel`, `filesystem`, `node`, and `docker`.

#### Scenario: Malformed context
- **WHEN** `TASKELITH_ACCEPTANCE` names the row `resource-budgets`
- **THEN** building the run environment fails, naming the allowed rows

### Requirement: Coverage kept out of killed processes
`@taskelith/testing` SHALL provide an environment that passes no `NODE_V8_COVERAGE` to a child it starts, and a way for a test process to withhold it from the processes it starts. A test SHALL start without that variable every Node process that it, or the product code it drives, kills as part of the test, so that a kill during exit leaves no empty coverage file, while the test process still writes its own coverage.

#### Scenario: A killed child leaves no coverage file
- **WHEN** a test starts a Node child with the uncovered environment and kills it
- **THEN** the child writes no coverage file, and the coverage report of the run cannot fail on it

#### Scenario: Product spawns inherit no coverage directory
- **WHEN** a test withholds coverage and then drives product code that spawns with a copy of `process.env`
- **THEN** the spawned processes see no `NODE_V8_COVERAGE`, and the test process still writes its own coverage file

### Requirement: Lock-wait barriers
A lock-wait barrier added or modified by a change in a PostgreSQL integration test, which waits until a statement waits for a lock, SHALL poll from a separate observer connection, not from the connection that holds the lock, SHALL match the waiter by its role and statement or by the awaited lock, so that no other waiter satisfies the barrier, and the test SHALL release the held lock and end its connections in cleanup that runs also when a step fails.

#### Scenario: The observer matches the waiter
- **WHEN** a test holds a lock and starts a statement that waits for it
- **THEN** a separate connection polls until a backend of the statement's role waits with that statement, or a backend waits for the lock the test holds, and only then does the test release the lock

#### Scenario: Cleanup after a failed step
- **WHEN** a barrier or an assertion fails while the test holds the lock
- **THEN** the cleanup releases the lock and ends the test's connections, so the waiter and the later tests of the file do not hang

### Requirement: Linear-time assertions
`assertLinearOnRuns` SHALL judge a transform by how its thread's CPU time grows with run length: it SHALL time each unit's run and a quarter run in five alternating samples after a forced garbage collection, double the runs until the short median reaches 20 ms or doubling the long run would pass 2^24 characters, floor medians at 20 ms, and fail, naming the unit, lengths, and medians, when the time grows 2.5 or more times faster than the length. Importing it SHALL NOT expose garbage collection.

#### Scenario: A quadratic redactor fails on runs sized to the host
- **WHEN** a redactor that searches the rest of the text for a revealed value from every position is checked with the thread's CPU time on the unit `a b`, which never holds the value, from the length 1000
- **THEN** the runs double until the short median reaches 20 ms, and the assertion fails with a message that names `"a b"`, both lengths, and both medians

#### Scenario: Growth at the limit
- **WHEN** an injected timer reads 20 ms for each short sample of the unit `a` at the length 4000 and 200 ms for each long sample
- **THEN** the assertion fails with the growth 2.5, while 199.9 ms for each long sample passes, and 25 and 400 ms fail with the growth 4.0

#### Scenario: Runs double to the floor
- **WHEN** an injected timer reads 1 ms per 1000 characters for the unit `a` from the length 4000
- **THEN** the short run doubles from 1000 to 32000 characters and the long run has 128000

#### Scenario: The longest runs
- **WHEN** an injected timer reads 1 ms for each short sample of the unit `a` at the length 2^24
- **THEN** the assertion passes with 79 ms for each long sample, as both medians count as at least 20 ms, and fails with 200 ms

#### Scenario: A pause in one sample passes
- **WHEN** an injected timer reads 30 ms for each short sample and 420 ms for the first long sample and 120 ms for the others
- **THEN** the assertion passes, because the median of the five long samples leaves the pause out

#### Scenario: Both runs of every unit
- **WHEN** a transform is checked on the units `a.` and `abc` with the length 12 and an injected timer that reads 10 ms per character
- **THEN** it receives the runs `a.a.` and `a.` repeated 6 times, and `abc` and `abc` repeated 4 times, and the assertion passes

#### Scenario: Importing the package
- **WHEN** a test process imports `@taskelith/testing` and makes no linear-time assertion
- **THEN** `gc` stays undefined in a new context
