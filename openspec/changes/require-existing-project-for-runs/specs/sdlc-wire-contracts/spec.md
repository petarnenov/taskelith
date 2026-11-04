## ADDED Requirements

### Requirement: Run project refusals on the wire
`sdlc.openapi.json` SHALL declare, from version 0.5.0, a 404 `Failure` on `createRun` for a project that does not exist, and 403 descriptions of `createRun`, `submitTask`, and `readAdmission` that name the required role with no G2 bridge. `breaking-changes.json` SHALL declare, as a behavior change, that the operator bearer is refused on `createRun` and `submitTask` without a project role.

#### Scenario: Unknown project in the document
- **WHEN** the `createRun` responses of `sdlc.openapi.json` are read
- **THEN** they include a 404 with the `Failure` schema, and no 403 description names the G2 bridge

## MODIFIED Requirements

### Requirement: Breaking-change declarations
`packages/contracts/breaking-changes.json` SHALL list, per document path and version that declared breaking changes, a non-blank reason and the breaking changes the check reports, the behavior changes it cannot report, or both, keeping earlier versions as history. `make contract-compatibility` SHALL fail when the file does not match its schema, names an unknown document, has a non-semantic version, repeats a path and version, or is unsorted by path, version precedence, then version text.

#### Scenario: Malformed declarations
- **WHEN** an entry has a blank reason, a version `0.4`, changes not sorted and unique, or the same path and version as another entry
- **THEN** the check fails and names the entry and the problem

#### Scenario: Build metadata
- **WHEN** two entries of one path have the versions `0.5.0+linux` and `0.5.0+mac`, in that order
- **THEN** the file is valid

#### Scenario: Behavior change alone
- **WHEN** an entry lists no breaking change and one behavior change, for a version whose check finds no breaking change
- **THEN** the file is valid, and an entry with neither list fails the check
