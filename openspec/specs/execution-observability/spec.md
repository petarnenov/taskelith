# execution-observability Specification

## Purpose
Structured logs that correlate commands, attempts, and events without secrets, and the architecture section 12 signals that G2 produces, behind module-owned ports with adapters for Node, PostgreSQL, and NATS.

## Requirements

### Requirement: Correlated structured logs

The observability module SHALL write each log record through a `LogSink` port as a time, a level, a stable event name, a correlation of known identifiers, and scalar fields. A logger derived with a correlation SHALL add it to every record it writes, a later value replacing an earlier one of the same key. A correlation read from a received message SHALL keep only the known identifier keys whose values are strings.

#### Scenario: A record carries its command and attempt

- **WHEN** a logger derived with a command and an attempt identifier writes an event with fields
- **THEN** the sink receives one frozen record with the time of the clock, the level, the event name, both identifiers, and the fields

#### Scenario: A received body adds nothing but identifiers

- **WHEN** a correlation is read from metadata that holds identifiers, a number, and a payload field
- **THEN** only the string identifiers of the known keys remain

### Requirement: Logs without secrets

The logger SHALL replace the value of every field whose name may hold a secret with `[redacted]`, and SHALL remove URL user information, bearer tokens, `key=value` secrets, issued bearer secrets, NKey seeds, NATS JWTs, and `.creds` blocks from text in fields and correlation, in time linear in the text, before any sink receives the record. Adapters SHALL NOT log message bodies or payloads.

#### Scenario: A failure message quotes a connection URL

- **WHEN** a field holds a message with a PostgreSQL URL that carries a user and password, and a bearer token
- **THEN** the record holds the URL without its user information, and the token is replaced

#### Scenario: A field named for a secret

- **WHEN** a field named like a password, token, API key, credential, or authorization is logged
- **THEN** its value is `[redacted]`

#### Scenario: A secret of a known shape in text

- **WHEN** a field or correlation value holds an issued Taskelith secret, an NKey seed, a NATS JWT, or a `.creds` block, even glued to other text
- **THEN** the record holds `[redacted]` in its place

#### Scenario: Pathological log text

- **WHEN** a field or correlation value holds tens of thousands of characters such as `a.`, `proxy-`, or `eyJ` repeated, or `.creds` begin markers without an end
- **THEN** redacting it takes time linear in its length

### Requirement: G2 signal catalogue and metrics port

The observability module SHALL define the G2 signals `outbox.lag`, `outbox.pending`, `inbox.lag`, `assignment.age`, `assignment.offered`, `execution.unknown`, `worker.capacity.slots`, `worker.capacity.held`, `event-loop.lag`, and `database.latency`, each with a kind (gauge or distribution) and a unit, and SHALL record measurements through a `Metrics` port. The in-memory registry SHALL keep a gauge's last value and summarize a distribution's samples per label set.

#### Scenario: A gauge and a distribution

- **WHEN** a gauge is recorded twice and a distribution three times under one label set
- **THEN** the gauge reads its last value, and the distribution reads its count, sum, minimum, maximum, and last sample

### Requirement: Port conformance

Every adapter of the log sink, metrics, and control-plane signal ports SHALL pass the module's shared conformance suite for that port.

#### Scenario: Each adapter passes its suite

- **WHEN** the suites run against the in-memory and discarding adapters, the JSON-lines sink with a working and a failing output, and the PostgreSQL signals over an empty state
- **THEN** none of them reports a problem

### Requirement: Control-plane snapshot from PostgreSQL

The PostgreSQL adapter SHALL read, in one read-only snapshot that takes no part in the writers' serialization checks, the age of the oldest unpublished outbox row and their count, the age of the oldest offered assignment and their count, the unknown executions, the eligible workers' slots, and the held reservations. An age SHALL be the database's now() less the row's stamp, from the database default or, for an assignment, placement's tx.now(), and zero when nothing waits or the stamp is later.

#### Scenario: A snapshot of waiting work

- **WHEN** two outbox rows were stamped 30 seconds ago and an offered assignment 90 seconds ago, on a database clock that has not stepped back since, a task holds an uncertain execution, and one of two workers is eligible
- **THEN** the snapshot reads two pending rows with a lag of at least 30 seconds, one offered assignment aged at least 90 seconds, one unknown execution, the eligible worker's slots, and one held slot

#### Scenario: A later position appended earlier

- **WHEN** a row at a later outbox position has the older append time
- **THEN** the outbox lag reads the age of that older append

#### Scenario: Accepted and published work stops waiting

- **WHEN** the assignment is accepted and the outbox row is marked published
- **THEN** the snapshot reads no outbox lag, no offered assignment, and the held slot only

#### Scenario: Placement under a skewed application clock

- **WHEN** a task is placed while the application clock runs six hours behind the database clock
- **THEN** the assignment's change time is the database time of the placement transaction, within a second of its offer's append time

#### Scenario: A stamp later than the read

- **WHEN** an outbox row and an offered assignment carry stamps later than the database's now(), as after that clock stepped back
- **THEN** both ages read zero

### Requirement: Unknown executions and query columns

An unknown execution SHALL be one that is not terminal and carries evidence beside its state. The task repository SHALL store each task's count of unknown executions, and the assignment repository each assignment's state and change time, in query columns written with the record. The migration that adds the columns SHALL copy them from the records stored before it.

#### Scenario: Evidence makes an execution unknown until it ends

- **WHEN** a running execution receives uncertain evidence and is later resolved by an operator
- **THEN** the task counts one unknown execution in between and none after

#### Scenario: Stored records are backfilled

- **WHEN** the migration runs over an assignment and tasks stored before it, whose records hold the escapes of a lone surrogate and of NUL
- **THEN** the assignment's state and change time, and each task's count of unknown executions, are copied from their records

### Requirement: Database latency and logs

The PostgreSQL adapter SHALL time each transaction attempt, its connection checkout included, as `database.latency`. It SHALL log a broken idle connection, a commit with an unknown outcome, and exhausted serialization retries.

#### Scenario: Each attempt is timed

- **WHEN** two transactions run
- **THEN** two `database.latency` samples are recorded

#### Scenario: A commit without an answer

- **WHEN** the connection is lost during a commit
- **THEN** an error record `postgres.commit.unknown` is written, and no record holds the database password

### Requirement: Transport lag and logs

The NATS consumer SHALL record `inbox.lag` from the stream append to the receiver's commit per stream and consumer. It SHALL log a quarantined message, a redelivery after a failed commit with the message's correlation, and a failed pull. The outbox publisher SHALL log a failed publication with its event identity.

#### Scenario: A commit records the inbox lag

- **WHEN** a consumer commits and acknowledges a message
- **THEN** one `inbox.lag` sample is recorded under its stream and consumer

#### Scenario: A failed commit is redelivered

- **WHEN** a handler fails to commit an assignment offer
- **THEN** a warning carries the command, attempt, task, worker, and correlation identifiers of the offer, the delivery count, and the redacted failure

#### Scenario: A publication fails

- **WHEN** the broker rejects an outbox row
- **THEN** a warning carries the row's event identity, its subject, and the failure count

### Requirement: Event-loop lag and JSON lines

The Node adapter SHALL report the p99 event-loop delay of each sample window with Node's built-in histogram, less the histogram's resolution, and SHALL write log records as one JSON object per line. A sink that cannot write, synchronously or later, SHALL drop records without throwing or ending the process, and a full output SHALL drop records until it drains.

#### Scenario: A blocked event loop

- **WHEN** the event loop is blocked for 60 ms within a sample window
- **THEN** that window's `event-loop.lag` reads at least 30 ms

#### Scenario: An idle event loop

- **WHEN** the event loop idles through a sample window
- **THEN** that window's `event-loop.lag` reads below the resolution

#### Scenario: A full output

- **WHEN** a thousand records meet an output that accepts one and has not drained
- **THEN** the rest are dropped and counted, and a record after the drain is written

#### Scenario: A closed output

- **WHEN** the output throws on write, or fails a write after it returned
- **THEN** the logger's caller and the process continue, and later records are dropped
