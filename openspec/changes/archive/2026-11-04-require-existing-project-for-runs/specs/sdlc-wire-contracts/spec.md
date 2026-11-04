## ADDED Requirements

### Requirement: Run project refusals on the wire
`sdlc.openapi.json` SHALL declare, from version 0.5.0, a 404 `Failure` on `createRun` for a project that does not exist, a `submitTask` 404 for an unknown stage only, and 403 descriptions of `createRun`, `submitTask`, and `readAdmission` that name the required role with no G2 bridge. `breaking-changes.json` SHALL declare, as a behavior change, that the operator bearer is refused on `createRun` and `submitTask` without a project role, and an unknown run of `submitTask` with 403.

#### Scenario: Unknown project in the document
- **WHEN** the `createRun` responses of `sdlc.openapi.json` are read
- **THEN** they include a 404 with the `Failure` schema, and no 403 description names the G2 bridge

#### Scenario: Unknown run of a submission
- **WHEN** the `submitTask` responses of `sdlc.openapi.json` are read
- **THEN** the 404 names only an unknown stage of a run that the caller may command, and the 403 covers an unknown run

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

### Requirement: Declared breaking changes listed
When the head `info.version` of a document present at the merge base declares a breaking change over its merge-base version, the check SHALL fail unless the found breaking changes equal, as a set, the `breakingChanges` of the file's entry for that path and version, and SHALL name each found change the entry lacks and each listed one not found. When it finds none, no entry SHALL be required and each listed breaking change SHALL count as stale. The check SHALL not compare `behaviorChanges`.

#### Scenario: Undeclared change under a minor bump
- **WHEN** a document goes from 0.4.0 to 0.5.0 and removes a message that no entry for 0.5.0 lists
- **THEN** the check fails and names the removed message

#### Scenario: Stale listed change
- **WHEN** the entry for 0.5.0 lists a change that the check does not find
- **THEN** the check fails and names the listed change

#### Scenario: Matching entry
- **WHEN** the file's entry for 0.5.0 is valid, so its changes are sorted, and lists exactly the found changes, whatever order the check finds them in
- **THEN** the check passes

#### Scenario: Bump without found changes
- **WHEN** a document goes from 0.4.0 to 0.5.0 and the check finds no breaking change
- **THEN** the check passes without an entry for 0.5.0, and fails and names each breaking change that such an entry lists

#### Scenario: Declared behavior changes
- **WHEN** the entry for 0.5.0 lists behavior changes and no breaking change, and the check finds none
- **THEN** the check passes and names no behavior change
