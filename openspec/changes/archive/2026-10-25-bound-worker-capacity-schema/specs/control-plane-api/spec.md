## MODIFIED Requirements

### Requirement: Runtime validation
Every request body SHALL be validated against its contract schema before any use case runs, and SHALL be answered 400 when it fails or exceeds 1 MiB.

#### Scenario: Invalid body
- **WHEN** `createRun` receives a body without its binding
- **THEN** the answer is 400 and no run is created

#### Scenario: Enrollment capacity above the bound
- **WHEN** `enrollWorker` receives a capacity value above the schema's maximum
- **THEN** the answer is 400 and the enrollment token is not consumed
