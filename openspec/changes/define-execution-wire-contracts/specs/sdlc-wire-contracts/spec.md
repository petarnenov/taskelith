## MODIFIED Requirements

### Requirement: Contracts package and documents
The private workspace package `@taskelith/contracts` SHALL hold `documents/sdlc.openapi.json` (OpenAPI 3.1.0), `documents/sdlc.asyncapi.json` (AsyncAPI 3.0.0), and the execution documents, each with a semantic `info.version`. Each document SHALL be self-contained, and every schema that several documents define under the same component name SHALL be identical.

#### Scenario: Shared schema drifts
- **WHEN** the admission schema of one document differs from the admission schema of the other
- **THEN** the package tests fail and name the schema

#### Scenario: Name with two meanings
- **WHEN** two documents define different schemas under one component name
- **THEN** generation fails and names the schema and both documents

### Requirement: Generated types
The build that `make verify` runs SHALL validate every AsyncAPI document with `@asyncapi/parser`, failing on errors and warnings. It SHALL generate the TypeScript types of all documents and one HTTP and one message schema bundle under `packages/contracts/src/generated/`, which is not committed, and SHALL fail when two OpenAPI documents define the same path.

#### Scenario: Invalid AsyncAPI document
- **WHEN** the parser reports an error or a warning for an AsyncAPI document
- **THEN** generation and the build fail

#### Scenario: Path defined twice
- **WHEN** two OpenAPI documents define the same path
- **THEN** generation fails and names the path
