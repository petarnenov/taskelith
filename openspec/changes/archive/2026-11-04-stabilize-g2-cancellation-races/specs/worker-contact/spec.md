## MODIFIED Requirements

### Requirement: Lost contact
The control plane SHALL mark unreachable each reachable worker whose last recorded contact is more than `30s` before the database time. Contact SHALL be recorded from an authenticated heartbeat, inventory report, or observation, a duplicate included; an observation's contact is best effort and follows it (`observation-consumption` "First contact"). Any later recorded contact SHALL make the worker reachable again. Marking a worker unreachable SHALL change no attempt, assignment, or reservation.

#### Scenario: Silent worker
- **WHEN** a worker has had no contact for more than the timeout
- **THEN** the next check marks it unreachable, and placement no longer chooses it

#### Scenario: Within the timeout
- **WHEN** a worker's last contact is exactly the timeout before the database time
- **THEN** the check keeps it reachable

#### Scenario: Contact again
- **WHEN** a worker marked unreachable sends a heartbeat or an observation, and its contact is recorded
- **THEN** it is reachable again, and the next check keeps it so

#### Scenario: Observation contact fails
- **WHEN** a worker marked unreachable sends an observation that is consumed, and the observation's contact fails
- **THEN** the observation stays consumed, the failure is logged as `execution.observation.contact-unrecorded`, and the worker stays unreachable until a later contact
