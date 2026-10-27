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

### Requirement: Host side-effect check
A harness qualification SHALL name in its record the host directories it compares (at least the harness's default home and the directory of installed harness binaries), compare SHA-256 listings of their files and listings of their symlinks and directories before and after the series, and record every difference as proven to come from the qualified harness, attributed to another named process, or unexplained.

#### Scenario: Harness writes outside its dedicated directories
- **WHEN** a difference is proven to come from the qualified harness
- **THEN** the record describes the change, its timing, its cleanup, and the consequence for worker isolation

#### Scenario: Concurrent host processes
- **WHEN** other processes that use the same directories were running during the series
- **THEN** each difference attributed to them is marked as attributed, not proven

### Requirement: Provider terms review
Before a harness is admitted, its qualification record SHALL review the provider's current terms that govern how Taskelith uses the harness, including automated use and pooled subscriptions (ADR 0005), quoting each relevant clause briefly with its URL, effective date, and access date, stating where the text is ambiguous for Taskelith's use, and leaving the acceptance of any remaining risk to the owner.

#### Scenario: Terms reviewed
- **WHEN** a harness qualification records its provider's terms
- **THEN** each finding quotes the clause, names its source and access date, and separates what the text says from where it is ambiguous

#### Scenario: Remaining risk
- **WHEN** the terms leave a risk for pooled or automated subscription use
- **THEN** the record or the design of the change that records the terms states the options and any recommendation as the author's proposal, and the owner decides

### Requirement: Linux qualification in the worker image
A harness qualification on Linux SHALL run inside the worker image's harness variant on each architecture of the worker matrix that the qualification host or an authorized runner provides. It SHALL record every architecture of the matrix as native, emulated, or not run, with the reason, and SHALL list each architecture without native evidence among the gates before admission.

#### Scenario: Emulated architecture
- **WHEN** an architecture runs only under emulation on the qualification host
- **THEN** its results are labeled emulated, and native evidence for it stays open

### Requirement: Credential-gated qualification scenarios
A harness qualification SHALL separate the steps that need no credentials from the scenarios that need a provider login. A scenario that needs a login SHALL run only with credentials that the owner has authorized; otherwise the record marks it as not run and lists it among the gates before admission. No credential SHALL be built into an image.

#### Scenario: No authorized login
- **WHEN** no provider login is authorized for a qualification run
- **THEN** only the credential-free steps run, and every scenario that needs a login is recorded as not run with that reason
