## ADDED Requirements

### Requirement: Installation broker TLS
The installation's broker SHALL require TLS on its installation certificate. Without `TASKELITH_NATS_CA`, the control plane and the administrative entry SHALL trust the installation CA of their data root, read under the control-plane namespace's checks. Before initialization they connect without a CA; an initialized installation without its CA SHALL fail before any broker connection.

#### Scenario: Default trust
- **WHEN** an initialized installation's control plane starts without `TASKELITH_NATS_CA`
- **THEN** its broker connection trusts the installation CA of its data root

#### Scenario: Before initialization
- **WHEN** the data root has no installation CA and `TASKELITH_NATS_CA` is not set
- **THEN** the settings name no broker CA

#### Scenario: Lost installation CA
- **WHEN** an initialized installation's `installation-ca.pem` is missing, a symbolic link, readable by others, or owned by another user, and `TASKELITH_NATS_CA` is not set
- **THEN** the control plane and the broker commands of the administrative entry fail with the file's path before connecting
