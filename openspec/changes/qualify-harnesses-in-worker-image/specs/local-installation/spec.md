## ADDED Requirements

### Requirement: Harness image variant
The worker image SHALL have a separate `worker-harnesses` variant that adds the agent harness packages pinned in the qualification records, installed from a tracked lockfile with every package checked against its integrity hash and no install scripts run. The default worker image SHALL stay without harnesses. Root SHALL own the installed harnesses, and the variant SHALL disable harness self-update.

#### Scenario: Default worker image
- **WHEN** the default `worker` target is built
- **THEN** it contains no harness package

### Requirement: Harness variant checks
`make verify` SHALL check the harness variant's pins without building the image. An opt-in `make` target SHALL build the variant for every Linux architecture of the worker matrix and run the credential-free qualification steps in it.

#### Scenario: Pin drift
- **WHEN** the harness manifest, the harness lockfile, or a qualification record names a version or integrity hash that the others do not
- **THEN** `make verify` fails
