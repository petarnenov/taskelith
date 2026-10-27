## ADDED Requirements

### Requirement: Bounded broker storage
The installation's broker SHALL use a fixed JetStream file store of 8 GiB, and the control plane SHALL limit each stream to 1 GiB through `TASKELITH_STREAM_MAX_BYTES`, so that the stream reservations fit the file store whatever the host's free disk. `make verify` SHALL check that the reservations of all streams fit the fixed file store.

#### Scenario: Host with little free disk
- **WHEN** the installation starts on a host whose free disk is below the 10 GiB targets of all streams but holds the 8 GiB file store
- **THEN** the control plane creates its streams and becomes healthy

## MODIFIED Requirements

### Requirement: Make-driven operation
`make` targets SHALL build the images, bootstrap the installation, start and stop it, enroll the Linux worker container, and issue an enrollment token for a native worker. Bootstrap SHALL initialize the installation before the broker starts with the authority it wrote. Secrets SHALL come from the environment, never from the repository or the images. When the control plane does not become healthy, the start SHALL stop it and print its last error.

#### Scenario: Restart
- **WHEN** an enrolled installation is stopped and started
- **THEN** the services and the worker run again with their volumes, without a new enrollment

#### Scenario: Failed start
- **WHEN** the control plane does not become healthy within the start's wait
- **THEN** the target stops the control plane, prints its last error, and fails

### Requirement: Opt-in bring-up check
`make verify-installation` SHALL build the images, bootstrap, start, enroll, and restart a throwaway installation with random secrets, and remove it with its volumes. `make verify` SHALL check the composition and the Dockerfile without building or starting them. A failed check SHALL print the control-plane log before it removes the project.

#### Scenario: Successful check
- **WHEN** `make verify-installation` runs on a Docker host
- **THEN** the worker enrolls, every service runs after the restart, and the project is removed

#### Scenario: Failed check
- **WHEN** a step of `make verify-installation` fails
- **THEN** the control-plane log is printed, and the project is removed
