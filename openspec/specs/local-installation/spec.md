# local-installation Specification

## Purpose
The packaged minimal local installation of Taskelith: the control-plane and Linux worker images, their Docker Compose composition with PostgreSQL and NATS, and the `make` targets that operate it.

## Requirements

### Requirement: Pinned image inputs
The control-plane and worker images SHALL build from the digest-pinned Ubuntu 24.04 base and SHALL install Node.js only from a release tarball verified against a pinned SHA-256. Every image the composition pulls SHALL be pinned by digest.

#### Scenario: Unpinned or altered input
- **WHEN** a pulled image lacks a digest or a Node.js tarball does not match its checksum
- **THEN** `make verify` or the image build fails

### Requirement: Unprivileged services with volume data
The control plane, the worker, and NATS SHALL run as non-root users, and the data of PostgreSQL, NATS, the control plane, and the worker SHALL live on named volumes. The images SHALL contain no credentials and no data-root state, and SHALL be built only from tracked files.

#### Scenario: Fresh image
- **WHEN** the control-plane or worker image is built
- **THEN** it runs as `taskelith`, its data root is empty, and an untracked file of the checkout is absent

### Requirement: Make-driven operation
`make` targets SHALL build the images, bootstrap the installation, start and stop it, enroll the Linux worker container, and issue an enrollment token for a native worker. Bootstrap SHALL initialize the installation before the broker starts with the authority it wrote. Secrets SHALL come from the environment, never from the repository or the images.

#### Scenario: Restart
- **WHEN** an enrolled installation is stopped and started
- **THEN** the services and the worker run again with their volumes, without a new enrollment

### Requirement: Opt-in bring-up check
`make verify-installation` SHALL build the images, bootstrap, start, enroll, and restart a throwaway installation with random secrets, and remove it with its volumes. `make verify` SHALL check the composition and the Dockerfile without building or starting them.

#### Scenario: Successful check
- **WHEN** `make verify-installation` runs on a Docker host
- **THEN** the worker enrolls, every service runs after the restart, and the project is removed

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
