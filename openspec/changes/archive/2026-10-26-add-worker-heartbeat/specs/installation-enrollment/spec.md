## MODIFIED Requirements

### Requirement: Broker permissions and revocation
A worker's broker user SHALL publish only to its own consumer API, acknowledgements, observation subject, and heartbeat subject, and subscribe only under its own inbox prefix. A revocation SHALL reach the server through the system account without a reload, and SHALL disconnect the user.

#### Scenario: Forged observation
- **WHEN** a worker publishes on another worker's observation subject
- **THEN** the server reports a permissions violation

#### Scenario: Forged heartbeat
- **WHEN** a worker publishes a heartbeat on its own and on another worker's heartbeat subject
- **THEN** only its own heartbeat is delivered, and the server reports a permissions violation for the other

#### Scenario: Revoked worker
- **WHEN** a connected worker is revoked
- **THEN** the server disconnects it and refuses its next connection
