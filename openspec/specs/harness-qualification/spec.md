# harness-qualification Specification

## Purpose
Qualify each selected agent harness with version-pinned, isolated, reproducible evidence of its terms, network egress, and native capabilities before admission, stated in harness-neutral port terms.

## Requirements

### Requirement: Version-pinned harness qualification
A harness qualification record SHALL pin the exact package version and binary hash, record license, provider, credential, security, and maintenance terms, and state the platform tested.

#### Scenario: Harness upgrade
- **WHEN** the harness version pinned in a plugin's manifest differs from the "Pinned version" row of its qualification record
- **THEN** the plugin is not used until a new record with egress and capability evidence for that version exists

### Requirement: Isolated, reproducible egress measurement
A harness qualification SHALL run each scenario with an allowlisted environment and a dedicated configuration directory, record script hashes and environment in each run's metadata, and measure network requests at host and path level with telemetry enabled and disabled, while detecting sockets that bypass the measuring proxy and stating the measurement's blind spots.

#### Scenario: Telemetry disabled
- **WHEN** the documented telemetry switch is set
- **THEN** the run's proxy log contains no telemetry request, and every remaining request is listed in the record as non-telemetry traffic

### Requirement: Native capability evidence
A harness qualification SHALL give each capability required by architecture section 7 either a result backed by a named run or an explicit `not tested` result with its reason, listed among the gates before admission, and SHALL include the state of a pending permission request across a scripted, timestamped crash of the host and harness.

#### Scenario: Pending approval after a crash
- **WHEN** a permission request is pending and both processes are killed
- **THEN** the record states whether the request is re-delivered, whether its side effect ran, and the reconciliation the plugin must apply

#### Scenario: Harness-neutral consequences
- **WHEN** qualification findings constrain the agent port
- **THEN** they are stated in port terms, and `npm test` boundary checks (`scripts/check-boundaries.ts`) continue to pass with no harness-specific kernel or module code
