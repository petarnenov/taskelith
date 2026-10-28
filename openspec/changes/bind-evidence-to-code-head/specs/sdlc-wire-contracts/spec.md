## ADDED Requirements

### Requirement: Code head on the wire
The SDLC AsyncAPI document SHALL define `CodeHeadIdentity` with a repository identifier and commit and tree names of 40 or 64 lowercase hexadecimal characters, rejecting other properties, and the gate and each of the three evidence kinds SHALL carry it as the optional property `codeHead`.

#### Scenario: Head-bound gate event
- **WHEN** a head-bound gate decided by evidence at its code head is serialized as JSON in a decided event
- **THEN** the event is valid, and the gate with an abbreviated commit name is not
