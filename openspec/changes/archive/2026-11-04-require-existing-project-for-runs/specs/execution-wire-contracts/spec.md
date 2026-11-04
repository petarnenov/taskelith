## ADDED Requirements

### Requirement: Task result role denial
`execution.openapi.json` SHALL describe, from version 0.10.0, the 403 `AccessDenial` of `readTaskResult` as a principal that lacks `project-viewer` or above on the run's project and is not an `installation-owner`, with no G2 bridge.

#### Scenario: Task result denial in the document
- **WHEN** the `readTaskResult` 403 response of `execution.openapi.json` is read
- **THEN** its schema is `AccessDenial` and its description names no G2 bridge
