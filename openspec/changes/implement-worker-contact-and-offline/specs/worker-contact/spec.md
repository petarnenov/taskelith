## ADDED Requirements

### Requirement: Worker heartbeat
A connected worker SHALL publish `worker.heartbeat` with its `workerId`, its `journalId`, and `sentAt` from its own clock on its own heartbeat subject over core NATS, at once on each connection and reconnection and then every `10s`. It SHALL send none while it knows its connection is down or after its journal stopped, and a heartbeat it cannot send SHALL be logged and replaced by the next.

#### Scenario: Connected worker
- **WHEN** a worker's broker connection is up
- **THEN** a heartbeat that matches `WorkerHeartbeat` goes out at once on `taskelith.<installationId>.workers.<workerId>.heartbeats`, and another one every `10s`

#### Scenario: Reconnected worker
- **WHEN** the broker connection is restored after a disconnect
- **THEN** a heartbeat goes out at once, without waiting for the rest of the interval

#### Scenario: Disconnected worker
- **WHEN** the worker has seen its connection go down before a heartbeat interval
- **THEN** no heartbeat is sent for that interval

#### Scenario: Disconnect not yet seen
- **WHEN** a heartbeat is published after the connection dropped but before the worker has seen the disconnect
- **THEN** the client may buffer it, and it leaves only on the next successful connection, at most one connection attempt late, followed at once by a fresh heartbeat

#### Scenario: Stopped journal
- **WHEN** the journal stops after a flush failure while the worker is connected
- **THEN** no heartbeat is sent at a later interval or on a reconnect

### Requirement: Worker-side lost contact
A worker SHALL be offline from its start until its first broker connection is up, and once a connection has stayed down for the lost-contact timeout of `30s`, until one is up again. It SHALL log `worker.contact.offline` and `worker.contact.online` at each change. A connection restored within the timeout SHALL leave it online.

#### Scenario: Short disconnect
- **WHEN** the connection drops and is restored within `30s`
- **THEN** the worker stays online, and no change is logged

#### Scenario: Long disconnect
- **WHEN** the connection stays down for `30s`
- **THEN** the worker is offline and logs `worker.contact.offline`; the next connection makes it online and logs `worker.contact.online`
