## ADDED Requirements

### Requirement: Breaking-change declarations
`packages/contracts/breaking-changes.json` SHALL list, per contract document path and per version that declared breaking changes, the version, a non-blank English reason, and the breaking changes the check reports, keeping earlier versions as history. `make contract-compatibility` SHALL fail when the file does not match its schema, names an unknown document, has a version that is not semantic, repeats a path and version, or is not sorted.

#### Scenario: Malformed declarations
- **WHEN** an entry has a blank reason, a version `0.4`, or the same path and version as another entry
- **THEN** the check fails and names the entry and the problem

### Requirement: Declared breaking changes listed
When the head `info.version` of a document present at the merge base declares a breaking change over its merge-base version and the check finds breaking changes, the check SHALL fail unless the file has an entry for that path and version whose changes equal the found ones as a set, and SHALL name each found change the entry lacks and each listed change not found.

#### Scenario: Undeclared change under a minor bump
- **WHEN** a document goes from 0.4.0 to 0.5.0 and removes a message that no entry for 0.5.0 lists
- **THEN** the check fails and names the removed message

#### Scenario: Stale listed change
- **WHEN** the entry for 0.5.0 lists a change that the check does not find
- **THEN** the check fails and names the listed change

#### Scenario: Matching entry
- **WHEN** the entry lists exactly the found changes, in any order
- **THEN** the check passes

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
