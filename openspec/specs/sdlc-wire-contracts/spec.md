# sdlc-wire-contracts Specification

## Purpose
Define the first wire contracts of the SDLC module: an OpenAPI 3.1 document for creating runs, submitting tasks, and reading admissions, an AsyncAPI 3.0 document for command and event envelopes and admission and gate events, the types and validators generated from them, and the check that rejects an undeclared breaking change.

## Requirements

### Requirement: Contracts package and documents
The private workspace package `@taskelith/contracts` SHALL hold `documents/sdlc.openapi.json` (OpenAPI 3.1.0), `documents/sdlc.asyncapi.json` (AsyncAPI 3.0.0), and the execution documents, each with a semantic `info.version`. Each document SHALL be self-contained, and every schema that several documents define under the same component name SHALL be identical.

#### Scenario: Shared schema drifts
- **WHEN** the admission schema of one document differs from the admission schema of the other
- **THEN** the package tests fail and name the schema

#### Scenario: Name with two meanings
- **WHEN** two documents define different schemas under one component name
- **THEN** generation fails and names the schema and both documents

### Requirement: Command envelope
A command SHALL be an object of `metadata` and `payload`, whose metadata requires the command identifier and type, schema version, issue time, correlation identifier, project and task identity, and the SDLC run, stage, admission, and admission generation, and allows causation, expiry, attempt, worker, and ownership generation. It SHALL reject properties it does not define.

#### Scenario: Command without admission revision
- **WHEN** a command names the run, stage, and admission but not the admission generation
- **THEN** validation fails and names the missing field

### Requirement: Event envelope
An event SHALL be an object of `metadata` and `payload`, whose metadata requires the event identifier and type, schema version, occurrence time, correlation identifier, producer identity, and a per-producer sequence, and allows causation, attempt, and ownership generation. It SHALL reject properties it does not define.

#### Scenario: Event without producer sequence
- **WHEN** an event omits the per-producer sequence
- **THEN** validation fails and names the missing field

### Requirement: Admission and gate events
The AsyncAPI document SHALL define the admission events `sdlc.admission.admitted`, `sdlc.admission.used`, and `sdlc.admission.invalidated` with the run identifier and the admission record, and the gate events `sdlc.gate.opened`, `sdlc.gate.decided`, `sdlc.gate.blocked`, `sdlc.gate.stale`, and `sdlc.gate.reopened` with the run identifier and the gate. Each event message SHALL fix its event type, and the wire records SHALL accept those the SDLC domain produces.

#### Scenario: Domain admission on the wire
- **WHEN** an admission record of the SDLC domain is serialized as JSON
- **THEN** it is valid against the admission schema of both documents

#### Scenario: Event type of another event
- **WHEN** an admitted-event body is validated as an invalidated event
- **THEN** validation fails at the metadata event type

#### Scenario: Used admission on the wire
- **WHEN** a used admission with its ownership generation is serialized as JSON
- **THEN** it is valid against the admission schema of every document that defines it

### Requirement: SDLC HTTP operations
The OpenAPI document SHALL define `createRun` (`POST /runs`), `submitTask` (`POST /runs/{runId}/tasks`), and `readAdmission` (`GET /runs/{runId}/admissions/{admissionId}`), with client-chosen run and task identifiers, the admission as the result of a submitted task, and the kernel failure shape for errors, using 422 for a task that cannot be admitted.

#### Scenario: Unknown task kind
- **WHEN** a task is submitted with a kind other than planning or implementation
- **THEN** the request body is invalid

### Requirement: Generated types
The build that `make verify` runs SHALL validate every AsyncAPI document with `@asyncapi/parser`, failing on errors and warnings. It SHALL generate the TypeScript types of all documents and one HTTP and one message schema bundle under `packages/contracts/src/generated/`, which is not committed, and SHALL fail when two OpenAPI documents define the same path or define one security scheme name differently.

#### Scenario: Invalid AsyncAPI document
- **WHEN** the parser reports an error or a warning for an AsyncAPI document
- **THEN** generation and the build fail

#### Scenario: Path defined twice
- **WHEN** two OpenAPI documents define the same path
- **THEN** generation fails and names the path

#### Scenario: Security scheme with two meanings
- **WHEN** two OpenAPI documents define different security schemes under one name
- **THEN** generation fails and names the scheme and both documents

### Requirement: Generated validators
The package SHALL export `checkHttpSchema` and `checkMessageSchema`, which validate an input against a named schema of the documents with ajv in strict mode (JSON Schema 2020-12 for HTTP, draft-07 for messages) and return the typed value or readable violations.

#### Scenario: Unknown property
- **WHEN** a gate event payload has a property the schema does not define
- **THEN** the check returns a violation naming the property

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

### Requirement: Breaking-change detectors
OpenAPI documents SHALL be compared by oasdiff run only as its digest-pinned container without network access and with external references disallowed, counting ERR-level changes as breaking. AsyncAPI documents SHALL be compared by `@asyncapi/diff`, counting its breaking and unclassified changes as breaking, except the change of `info.version` itself and the parser's `x-parser-*` annotations.

#### Scenario: Optional payload field added
- **WHEN** an optional property is added to an AsyncAPI payload schema, which `@asyncapi/diff` leaves unclassified
- **THEN** it counts as a breaking change that `info.version` must declare

#### Scenario: Version-only release
- **WHEN** only `info.version` of the AsyncAPI document changes from 0.1.0 to 0.1.1
- **THEN** the check passes

### Requirement: Reserved parser prefix
Because the AsyncAPI parser reserves the prefix `x-parser-` for its annotations, the check SHALL fail for an AsyncAPI document that uses it for any key.

#### Scenario: Reserved prefix
- **WHEN** the AsyncAPI document names an operation or a property `x-parser-user`
- **THEN** the check fails and names the key

### Requirement: Code head on the wire
The SDLC AsyncAPI document SHALL define `CodeHeadIdentity` with a repository identifier and commit and tree names of 40 or 64 lowercase hexadecimal characters, rejecting other properties, and the gate and each of the three evidence kinds SHALL carry it as the optional property `codeHead`; each evidence kind SHALL carry the optional `gateId`, an identifier, and the optional `gateGeneration`, a generation.

#### Scenario: Head-bound gate event
- **WHEN** a head-bound gate decided by evidence at its code head is serialized as JSON in a decided event
- **THEN** the event is valid, and the gate with an abbreviated commit name is not

### Requirement: Breaking-change declarations
`packages/contracts/breaking-changes.json` SHALL list, per contract document path and per version that declared breaking changes, the version, a non-blank English reason, and the breaking changes the check reports, keeping earlier versions as history. `make contract-compatibility` SHALL fail when the file does not match its schema, names an unknown document, has a version that is not semantic, repeats a path and version, or is not sorted by path, version precedence, then version text.

#### Scenario: Malformed declarations
- **WHEN** an entry has a blank reason, a version `0.4`, changes not sorted and unique, or the same path and version as another entry
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
