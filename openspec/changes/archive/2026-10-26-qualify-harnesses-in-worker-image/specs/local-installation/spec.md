## ADDED Requirements

### Requirement: Harness image variant
The worker image SHALL have a separate `worker-harnesses` variant that adds the agent harness packages pinned in the qualification records, installed from a tracked lockfile with every package checked against its integrity hash and no install scripts run. The default worker image SHALL stay without harnesses. Root SHALL own the installed harnesses, so that the worker user cannot change them, and the variant SHALL set every self-update switch that a harness reads from the environment.

#### Scenario: Default worker image
- **WHEN** the default `worker` target is built
- **THEN** it contains no harness package

### Requirement: Harness variant checks
`make verify` SHALL check the harness variant's pins without building the image. An opt-in `make` target SHALL build the variant for each selected Linux architecture of the worker matrix, run the credential-free qualification steps in it, and record a failed architecture without stopping the others.

#### Scenario: Pin drift
- **WHEN** the harness manifest, the harness lockfile, or a qualification record names a version or integrity hash that the others do not
- **THEN** `make verify` fails
