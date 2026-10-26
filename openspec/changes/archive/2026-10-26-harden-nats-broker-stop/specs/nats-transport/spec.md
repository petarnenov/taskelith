## MODIFIED Requirements

### Requirement: Outbox publication
The publisher SHALL publish an outbox row with `Nats-Msg-Id` set to its event identity, and SHALL mark it published only after the broker acknowledged it. A row the broker did not acknowledge SHALL be published again with the same identity. A later row of the same subject SHALL wait until the earlier one is marked. A stop SHALL end the publication loop without waiting for the next poll.

#### Scenario: Killed after the broker acknowledgement
- **WHEN** the publisher is killed after the broker stored a row but before the outbox marked it
- **THEN** a rerun publishes it again under the same identity, the broker reports a duplicate, and the worker receives the command once

#### Scenario: Lost connection
- **WHEN** a publication runs while the connection to the broker is lost
- **THEN** it fails as `unavailable`, and its retry after the heal stores the message once

#### Scenario: Stop during a publication round
- **WHEN** a stop is requested during a publication round
- **THEN** the loop ends after that round without the poll pause
