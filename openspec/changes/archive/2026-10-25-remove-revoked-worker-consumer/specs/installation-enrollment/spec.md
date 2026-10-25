## ADDED Requirements

### Requirement: Revoked worker command consumer
A revocation SHALL remove the worker's command consumer after the revocation commits, and SHALL report a failed removal without failing the revocation. A control-plane start SHALL remove the consumers of the most recently revoked workers, up to the bound of the operational targets, and SHALL log a failure without failing the start. A missing consumer SHALL count as removed.

#### Scenario: Revoked worker's consumer
- **WHEN** a worker is revoked
- **THEN** its command consumer is removed, and the consumers of the active workers are untouched

#### Scenario: Consumer that cannot be removed at revocation
- **WHEN** the broker refuses the removal of a revoked worker's consumer
- **THEN** the worker stays revoked, the revocation reports the consumer as not removed, and the next start that reaches the broker removes it while the worker is among the most recently revoked

#### Scenario: Consumer already removed
- **WHEN** the consumer of a revoked worker is removed again
- **THEN** the removal succeeds
