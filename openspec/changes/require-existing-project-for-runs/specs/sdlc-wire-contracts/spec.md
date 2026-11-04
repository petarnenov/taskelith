## ADDED Requirements

### Requirement: Run project refusals on the wire
`sdlc.openapi.json` SHALL declare, from version 0.5.0, a 404 `Failure` on `createRun` for a project that does not exist, and 403 descriptions of `createRun`, `submitTask`, and `readAdmission` that name the required role with no G2 bridge. `breaking-changes.json` SHALL declare, as a behavior change, that the operator bearer is refused on `createRun` and `submitTask` without a project role.

#### Scenario: Unknown project in the document
- **WHEN** the `createRun` responses of `sdlc.openapi.json` are read
- **THEN** they include a 404 with the `Failure` schema, and no 403 description names the G2 bridge
