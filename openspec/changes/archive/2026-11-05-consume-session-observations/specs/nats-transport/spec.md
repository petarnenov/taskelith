## ADDED Requirements

### Requirement: Session messages in the schema tables
The schema tables SHALL name the schema of every message of the execution channels except the command subject notices and the inventory report, which have their own schemas; the commands `session.turn.deliver` and `session.response.deliver` and the ten `session.*` observations are included. Only `execution.scm-credential.refreshed`, `session.delegation-result.deliver`, `execution.scm-credential.adopted`, and `execution.scm-credential.not-adopted` SHALL stay out, until G3 items 21 and 38.

#### Scenario: Every message of the channels
- **WHEN** the schemas of the messages of the worker command and observation channels of the AsyncAPI document are listed
- **THEN** they are the schemas of the tables, of the command subject notices, of the inventory report, and of the four messages left out, and each table key is the message type its schema names

#### Scenario: Session observation
- **WHEN** a valid observation of each `session.*` type is read from the observation subject
- **THEN** it passes with its type and its `observationId` as identity

#### Scenario: Malformed session observation
- **WHEN** a session observation lacks its `recoveryEpoch`, or names protocol version 1
- **THEN** it is refused with the reason that names its schema

#### Scenario: Observation of item 21
- **WHEN** `execution.scm-credential.adopted` or `execution.scm-credential.not-adopted` is read from the observation subject
- **THEN** it is refused as an unknown observation type, which quarantines it

#### Scenario: Command of items 21 and 38
- **WHEN** a worker whose window is version 1 reads `execution.scm-credential.refreshed` or `session.delegation-result.deliver`
- **THEN** one of version 2 passes with its type and `commandId` only, so that the worker rejects it, and one of version 1 is refused as an unknown command type, which quarantines it

#### Scenario: Session command at a worker of version 1
- **WHEN** a worker whose window is version 1 reads a session command of version 2
- **THEN** the command passes with its type and `commandId` only, unchecked against its schema, so that the worker rejects it
