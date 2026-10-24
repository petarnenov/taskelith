## Purpose

Define the first wire contracts of the SDLC module: an OpenAPI 3.1 document for creating runs, submitting tasks, and reading admissions, an AsyncAPI 3.0 document for command and event envelopes and admission and gate events, the types and validators generated from them, and the check that rejects an undeclared breaking change.

## ADDED Requirements

### Requirement: Contracts package and documents
The private workspace package `@taskelith/contracts` SHALL hold the documents `documents/sdlc.openapi.json` (OpenAPI 3.1.0) and `documents/sdlc.asyncapi.json` (AsyncAPI 3.0.0), each with a semantic `info.version`. Each document SHALL be self-contained, and every schema that both documents define under the same component name SHALL be identical.

#### Scenario: Shared schema drifts
- **WHEN** the admission schema of one document differs from the admission schema of the other
- **THEN** the package tests fail and name the schema

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

### Requirement: SDLC HTTP operations
The OpenAPI document SHALL define `createRun` (`POST /runs`), `submitTask` (`POST /runs/{runId}/tasks`), and `readAdmission` (`GET /runs/{runId}/admissions/{admissionId}`), with client-chosen run and task identifiers, the admission as the result of a submitted task, and the kernel failure shape for errors, using 422 for a task that cannot be admitted.

#### Scenario: Unknown task kind
- **WHEN** a task is submitted with a kind other than planning or implementation
- **THEN** the request body is invalid

### Requirement: Generated types
The build that `make verify` runs SHALL validate the AsyncAPI document with `@asyncapi/parser`, failing on errors and warnings, and SHALL generate the TypeScript types of both documents and their schema bundles under `packages/contracts/src/generated/`, which is not committed.

#### Scenario: Invalid AsyncAPI document
- **WHEN** the parser reports an error or a warning for the AsyncAPI document
- **THEN** generation and the build fail

### Requirement: Generated validators
The package SHALL export `checkHttpSchema` and `checkMessageSchema`, which validate an input against a named schema of the documents with ajv in strict mode (JSON Schema 2020-12 for HTTP, draft-07 for messages) and return the typed value or readable violations.

#### Scenario: Unknown property
- **WHEN** a gate event payload has a property the schema does not define
- **THEN** the check returns a violation naming the property

### Requirement: Breaking-change check
`make verify` SHALL run `make contract-compatibility`, which compares each document with its version at the merge base of `HEAD` with `origin/dev`, fetching that branch when absent, and SHALL fail when a breaking change is not declared by `info.version`: a higher major version, or a higher minor version while the major version is 0. An `info.version` that does not follow the semantic versioning 2.0.0 grammar SHALL fail, also for a document absent at the merge base, which otherwise passes.

#### Scenario: Undeclared breaking change
- **WHEN** an operation is removed while `info.version` goes from 0.1.0 to 0.1.1
- **THEN** the check fails and names the change

#### Scenario: Declared breaking change
- **WHEN** the same change comes with `info.version` 0.2.0
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
