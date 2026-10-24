# contract-tooling Specification

## Purpose
Record a pinned, source-cited evaluation of the tools for contract-first OpenAPI and AsyncAPI documents, so that contract tooling is selected through the dependency policy before it is installed.

## Requirements

### Requirement: Contract tooling evaluation
`docs/contract-tooling.md` SHALL evaluate, at exact versions, the runtime schema validator, type generators, AsyncAPI parsing, document linters, and breaking-change checkers for both document-first and code-first schemas, and SHALL state the JSON Schema dialects each contract document type supports and how schemas can be shared between them.

#### Scenario: Dialects differ between document types
- **WHEN** OpenAPI 3.1 and AsyncAPI 3 support different JSON Schema dialects
- **THEN** the evaluation lists the options for shared schemas and their consequences

#### Scenario: Recommendation recorded
- **WHEN** the evaluation recommends a tool or an option for an open owner decision
- **THEN** it labels the recommendation as the author's proposal, not a decision

### Requirement: Contract tooling evidence
The evaluation SHALL cite sources pinned to a tag, commit, or exact package version, or labeled as unversioned services, mark runtime claims that were not exercised as unverified, and name a digest for every container image it proposes.

#### Scenario: Claim taken from documentation
- **WHEN** a tool's runtime behaviour is described only from its documentation or source
- **THEN** the evaluation marks that claim, or the whole section that contains it, as unverified

#### Scenario: Containerized tool proposed
- **WHEN** the evaluation proposes a tool that runs as a container image
- **THEN** it names the image by digest

### Requirement: SDLC framework JSON output
The evaluation SHALL record which machine-readable outputs of the pinned OpenSpec CLI an adapter can read, from commands run at that version, including the output shape on failure, and SHALL mark any listed output that was not run as unverified.

#### Scenario: Output option not exercised
- **WHEN** the CLI help lists a JSON option for a command that was not run with it
- **THEN** the evaluation marks that command's JSON output as unverified

### Requirement: Contract tooling candidates
Every tool the evaluation proposes SHALL appear in the dependency register's "Contract tooling" section with status `candidate`, exact version, license, Node engine or runtime, upstream, and remaining admission evidence, until a separate change installs and qualifies it.

#### Scenario: Proposed tool not yet installed
- **WHEN** a proposed tool has not been installed or qualified
- **THEN** the register lists it as a candidate and does not report it as accepted
