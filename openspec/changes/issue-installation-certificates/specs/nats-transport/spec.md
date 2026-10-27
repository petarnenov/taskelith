## ADDED Requirements

### Requirement: Installation broker TLS
The installation's broker SHALL require TLS on its installation certificate. Without `TASKELITH_NATS_CA`, the control plane and the administrative entry SHALL trust the installation CA of their data root once it exists, so their broker connections use TLS.

#### Scenario: Default trust
- **WHEN** an initialized installation's control plane starts without `TASKELITH_NATS_CA`
- **THEN** its broker connection trusts the installation CA of its data root

#### Scenario: Before initialization
- **WHEN** the data root has no installation CA and `TASKELITH_NATS_CA` is not set
- **THEN** the settings name no broker CA
