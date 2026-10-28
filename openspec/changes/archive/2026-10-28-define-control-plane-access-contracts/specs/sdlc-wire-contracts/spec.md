## MODIFIED Requirements

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
