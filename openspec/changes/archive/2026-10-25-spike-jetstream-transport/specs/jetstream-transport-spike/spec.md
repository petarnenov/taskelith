## Purpose
Records measured NATS JetStream behavior against the pinned broker, so that the broker choice of architecture section 9 and the transport topology of decision D3 rest on reproducible evidence.

## ADDED Requirements

### Requirement: Measured transport behavior
`docs/g2-jetstream-spike.md` SHALL record, with the exact server, client, and Node versions, the measured behavior of addressed per-worker durable pull consumers, explicit acknowledgement and redelivery, outstanding-acknowledgement and payload bounds, the deduplication window, per-worker subject permissions, retention limits, and poison-message quarantine.

#### Scenario: Behavior recorded
- **WHEN** the record states a broker behavior as measured
- **THEN** an integration test against the pinned NATS container asserts it, and `make verify` runs that test

#### Scenario: Behavior not measured
- **WHEN** a behavior the transport depends on was not exercised
- **THEN** the record lists it as not measured and names the item that owns it

### Requirement: Test-only spike
The spike SHALL consist of integration tests, their fixture, and the shared test service configuration only, SHALL add no product code, and SHALL install its NATS clients as exact-pinned development dependencies with refreshed inventory and register rows.

#### Scenario: Spike installed
- **WHEN** the spike adds a package
- **THEN** it is an exact-pinned development dependency recorded in the dependency inventory and register

### Requirement: Spike permissions
The shared NATS configuration SHALL define static per-worker users for the permission measurements and SHALL keep access without credentials for other integration tests. The record SHALL state that decentralized authentication under D9 (a), with issuance and revocation without a reload, was not measured and belongs to item 13.

#### Scenario: Worker reads another worker's commands
- **WHEN** worker A pulls, looks up, or subscribes to the commands of worker B, or publishes on B's subject
- **THEN** the server denies it and B's commands stay pending

#### Scenario: Client without credentials
- **WHEN** an integration test connects without credentials
- **THEN** it connects as the default user and keeps full access to its account

### Requirement: Consequences for later items
The record SHALL state what the measurements imply for the wire contracts, the NATS adapter, broker credentials, and execution reconciliation, naming items 8, 12, 13, and 21.

#### Scenario: Measurement constrains a later item
- **WHEN** a measured behavior constrains a later item
- **THEN** the record names the item and the constraint
