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
