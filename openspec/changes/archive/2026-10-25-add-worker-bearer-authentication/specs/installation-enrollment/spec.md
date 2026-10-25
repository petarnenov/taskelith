## ADDED Requirements

### Requirement: Worker bearer authentication
A worker's control-plane secret SHALL authenticate without its worker identifier, by the hash of the secret, and SHALL name the worker and the generation it is of. A predecessor SHALL authenticate only within its grace window. An unknown secret, a revoked worker, and a secret past the grace window SHALL fail alike with `forbidden` and reason `worker-not-authorized`.

#### Scenario: Predecessor within the grace window
- **WHEN** a worker's credentials are rotated and the previous control-plane secret is presented within the grace window
- **THEN** it authenticates as that worker with the previous generation

#### Scenario: Revoked worker
- **WHEN** a revoked worker presents its current control-plane secret
- **THEN** authentication fails with `forbidden` and reason `worker-not-authorized`
