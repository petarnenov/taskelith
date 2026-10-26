# worker-contact Specification

## Purpose
How the control plane keeps a worker's reachability current: an authenticated heartbeat records contact, and a periodic, bounded check marks a worker without contact for the timeout unreachable for new placement.

## Requirements

### Requirement: Heartbeat contact
The control plane SHALL record an authenticated heartbeat as contact at the database time, in its own transaction, which makes the worker reachable and never moves its last contact backward. A heartbeat SHALL be authenticated only when the worker its subject names is the body's `workerId`, enrolled, not revoked, and under its enrolled `journalId`, which is not retired; any other heartbeat SHALL change nothing and fail as `forbidden`. A heartbeat SHALL never replace a journal.

#### Scenario: Authenticated heartbeat
- **WHEN** an enrolled worker's heartbeat arrives on its own subject under its enrolled journal
- **THEN** the worker is reachable and its last contact is the database time

#### Scenario: New incarnation
- **WHEN** a worker's heartbeat names a journal never seen, and later an observation of that journal replaces the enrolled one
- **THEN** the first heartbeat fails as `forbidden` and replaces nothing; after the replacement, heartbeats of the new journal record contact and those of the replaced journal fail as `forbidden`

#### Scenario: Revoked or foreign heartbeat
- **WHEN** a heartbeat comes from a revoked worker, names another worker than its subject, names another journal, or names an unknown worker
- **THEN** it fails as `forbidden` and records no contact

### Requirement: Lost contact
The control plane SHALL mark unreachable each reachable worker whose last recorded contact is more than `30s` before the database time. Contact SHALL be recorded from an authenticated heartbeat, observation, a duplicate observation included, or inventory report. Any later contact SHALL make the worker reachable again. Marking a worker unreachable SHALL change no attempt, assignment, or reservation.

#### Scenario: Silent worker
- **WHEN** a worker has had no contact for more than the timeout
- **THEN** the next check marks it unreachable, and placement no longer chooses it

#### Scenario: Within the timeout
- **WHEN** a worker's last contact is exactly the timeout before the database time
- **THEN** the check keeps it reachable

#### Scenario: Contact again
- **WHEN** a worker marked unreachable sends a heartbeat or an observation
- **THEN** it is reachable again, and the next check keeps it so

### Requirement: Bounded lost-contact check
The lost-contact check SHALL run every `10s`, SHALL mark at most `100` workers per run with the oldest contact first, and SHALL log `fleet.worker.contact-lost` for each worker it marks. A failed check SHALL be logged as `fleet.lost-contact.failed` and run again at the next interval.

#### Scenario: Contact while the check runs
- **WHEN** a heartbeat commits while the check marks its worker, or the check runs while the heartbeat's transaction holds the worker
- **THEN** the worker ends reachable, with the heartbeat's contact

#### Scenario: More silent workers than the batch
- **WHEN** more workers are silent than one check marks
- **THEN** the check marks those with the oldest contact, and the next check marks the rest

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
