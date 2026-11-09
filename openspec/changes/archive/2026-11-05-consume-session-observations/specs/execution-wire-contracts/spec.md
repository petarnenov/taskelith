## MODIFIED Requirements

### Requirement: Protocol version
Every execution command, observation, and report SHALL carry a positive integer protocol version. `VersionedCommand` SHALL accept every command whose metadata is valid and whose payload names a version. The package SHALL export `EXECUTION_PROTOCOL_VERSION`, `SESSION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, the worker's window, `CONTROL_PLANE_PROTOCOL_VERSIONS`, the control plane's window of versions 1 to 2, `supportsProtocolVersion`, and `commonProtocolVersion`.

#### Scenario: Later version
- **WHEN** a worker supporting version 1 receives an offer of version 2 with unknown payload fields
- **THEN** `VersionedCommand` accepts it, the version is unsupported, the offer schema rejects it, and a command rejection naming only its `commandId` and type is valid

#### Scenario: No common version
- **WHEN** the worker supports only version 1 and the control plane versions 2 to 3
- **THEN** `commonProtocolVersion` returns no version

#### Scenario: Control plane window
- **WHEN** the common version of `CONTROL_PLANE_PROTOCOL_VERSIONS` is taken with `SUPPORTED_PROTOCOL_VERSIONS`, with a window of versions 1 to 2, and with a window of version 3 only
- **THEN** it is 1, then 2, then no version
