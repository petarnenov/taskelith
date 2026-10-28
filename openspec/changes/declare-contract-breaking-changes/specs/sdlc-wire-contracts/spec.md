## ADDED Requirements

### Requirement: Breaking-change declarations
`packages/contracts/breaking-changes.json` SHALL list, per contract document path and per version that declared breaking changes, the version, a non-blank English reason, and the breaking changes the check reports, keeping earlier versions as history. `make contract-compatibility` SHALL fail when the file does not match its schema, names an unknown document, has a version that is not semantic, repeats a path and version, or is not sorted by path, version precedence, then version text.

#### Scenario: Malformed declarations
- **WHEN** an entry has a blank reason, a version `0.4`, or the same path and version as another entry
- **THEN** the check fails and names the entry and the problem

#### Scenario: Build metadata
- **WHEN** two entries of one path have the versions `0.5.0+linux` and `0.5.0+mac`, in that order
- **THEN** the file is valid

### Requirement: Declared breaking changes listed
When the head `info.version` of a document present at the merge base declares a breaking change over its merge-base version, the check SHALL fail unless the found breaking changes equal, as a set, those of the file's entry for that path and version, and SHALL name each found change the entry lacks and each listed change not found. When the check finds none, no entry SHALL be required and each change an entry lists for that version SHALL count as stale.

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
- **THEN** the check passes without an entry for 0.5.0, and fails and names each change that such an entry lists

### Requirement: Stale and historical declarations
An entry for a version above the merge-base version of its document SHALL fail as stale unless it is the head `info.version` and that version declares a breaking change. Entries for the merge-base version or lower SHALL be history and not compared, and so SHALL entries of a document absent at the merge base. When the head version declares no breaking change, "Breaking-change check" applies unchanged.

#### Scenario: Entry without a bump
- **WHEN** an entry names 0.4.1 while the document goes from 0.4.0 to 0.4.1
- **THEN** the check fails and names the stale entry

#### Scenario: History
- **WHEN** an entry names 0.3.0 or 0.4.0 and the merge-base version is 0.4.0
- **THEN** the check does not compare it

### Requirement: Breaking-change listing
`make contract-breaking-changes` SHALL print, in the file's format, an entry with the head version and the found changes for each document with breaking changes over the merge base, or over `BASE` when given, and SHALL never write the file. The listing and the check SHALL deduplicate changes and sort them by UTF-16 code units, independent of the detectors' order, the locale, and the host.

#### Scenario: Listing a declaration
- **WHEN** an author bumps a document's version and runs `make contract-breaking-changes`
- **THEN** it prints the entry to copy into the file, with an empty reason to fill, and the file is unchanged

## MODIFIED Requirements

### Requirement: Breaking-change check
`make verify` SHALL run `make contract-compatibility`, which compares each document with its version at the merge base of `HEAD` with `origin/dev`, fetching that branch when absent, and SHALL fail when a breaking change is not declared by `info.version` (a higher major version, or minor on 0.x) or not listed as "Declared breaking changes listed" requires. An `info.version` outside semantic versioning 2.0.0 SHALL fail, also for a document absent at the merge base, which otherwise passes.

#### Scenario: Undeclared breaking change
- **WHEN** an operation is removed while `info.version` goes from 0.1.0 to 0.1.1
- **THEN** the check fails and names the change

#### Scenario: Declared breaking change
- **WHEN** the same change comes with `info.version` 0.2.0 and the entry for 0.2.0 lists it
- **THEN** the check passes

#### Scenario: New document
- **WHEN** a document with a semantic `info.version` does not exist at the merge base
- **THEN** the check passes for it

#### Scenario: Malformed version
- **WHEN** `info.version` is `0.2.0-` or `0.2.0-01`
- **THEN** the check fails, also for a new document, and does not accept the version as declaring a breaking change
