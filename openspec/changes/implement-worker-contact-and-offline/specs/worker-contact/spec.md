## ADDED Requirements

### Requirement: Worker heartbeat
A connected worker SHALL publish `worker.heartbeat` with its `workerId`, its `journalId`, and `sentAt` from its own clock on its own heartbeat subject over core NATS, at once on each connection and then every `10s`. It SHALL send none while its connection is down, and a heartbeat it cannot send SHALL be logged and replaced by the next.

#### Scenario: Connected worker
- **WHEN** a worker's broker connection is up
- **THEN** a heartbeat that matches `WorkerHeartbeat` goes out at once on `taskelith.<installationId>.workers.<workerId>.heartbeats`, and another one every `10s`

#### Scenario: Disconnected worker
- **WHEN** the connection is down at a heartbeat interval
- **THEN** no heartbeat is sent or buffered for that interval

### Requirement: Worker-side lost contact
A worker SHALL be offline from its start until its first broker connection is up, and once a connection has stayed down for the lost-contact timeout of `30s`, until one is up again. It SHALL log `worker.contact.offline` and `worker.contact.online` at each change. A connection restored within the timeout SHALL leave it online.

#### Scenario: Short disconnect
- **WHEN** the connection drops and is restored within `30s`
- **THEN** the worker stays online, and no change is logged

#### Scenario: Long disconnect
- **WHEN** the connection stays down for `30s`
- **THEN** the worker is offline and logs `worker.contact.offline`; the next connection makes it online and logs `worker.contact.online`
