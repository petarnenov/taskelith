## ADDED Requirements

### Requirement: Credential end propagation window
An adoption confirmation or a revocation SHALL request the end of its versions before it returns, and every surface of the service, Git's smart HTTP included, SHALL refuse an ended version within `REVOCATION_PROPAGATION_SECONDS`, 30 seconds. The conformance suite SHALL repeat such an attempt until it is refused or the window has passed, and SHALL record each latency. No consumer SHALL rely on an end alone to isolate runs.

#### Scenario: Refusal within the window
- **WHEN** a revoked version is still accepted for a few seconds and then refused with `forbidden`
- **THEN** the suite reports no finding and records the latency of the refusal

#### Scenario: Version accepted past the window
- **WHEN** a revoked version is still accepted when the window has passed
- **THEN** the conformance report has a finding for that case
