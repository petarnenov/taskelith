## MODIFIED Requirements

### Requirement: Execution HTTP operations
The OpenAPI document SHALL define `enrollWorker`, `authorizeLaunch`, `requestDelegation`, `readTaskResult`, `publishEvidence`, `readEvidence`, `downloadEvidence`, and `readInstallationCa`. Each SHALL declare its credential: an enrollment token, the worker credential, or the operator credential; only `readInstallationCa`, which answers the public installation CA certificate, SHALL declare none. Errors SHALL use the kernel failure shape.

#### Scenario: Parent in a delegation request
- **WHEN** a delegation request names `parentTaskId`
- **THEN** the request body is invalid

#### Scenario: Worker in a launch request
- **WHEN** a launch authorization request names `workerId`
- **THEN** the request body is invalid

#### Scenario: Key material in the installation CA answer
- **WHEN** an `InstallationCa` answer holds a PEM private-key block
- **THEN** the answer is invalid
