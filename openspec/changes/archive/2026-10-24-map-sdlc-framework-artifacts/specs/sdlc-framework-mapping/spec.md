## Purpose

Record, for each SDLC framework that Taskelith supports, its native artifacts and their mapping to the framework-neutral lifecycle stages, as input for freezing the framework port.

## ADDED Requirements

### Requirement: Native framework mapping
`docs/sdlc-framework-mapping.md` SHALL describe, for each supported SDLC framework at an exact version, its native artifacts and layout, its command surface and validation, and a mapping of its artifacts to each lifecycle stage named in governance "Lifecycle and records".

#### Scenario: Stage without a native artifact
- **WHEN** a framework has no native artifact or operation for a lifecycle stage
- **THEN** the mapping marks that stage as a gap for that framework

#### Scenario: Every stage mapped
- **WHEN** the mapping is read for a framework
- **THEN** each lifecycle stage has an entry for it, naming a native artifact or operation or marking a gap

### Requirement: Mapping evidence
The mapping SHALL name an exact version and upstream commit for every framework it describes, mark every claim about runtime behaviour that was not exercised as unverified, and cite sources pinned to a tag, commit, or exact package version, or labeled as unversioned pages.

#### Scenario: Runtime claim not exercised
- **WHEN** a statement about a framework's runtime behaviour comes only from reading its source or documentation
- **THEN** the mapping marks that statement as unverified

#### Scenario: Static fact from pinned source
- **WHEN** a statement describes file layout, template sections, or command names read from the pinned source
- **THEN** the mapping cites the source without an unverified marker

#### Scenario: Framework pins
- **WHEN** the mapping is read
- **THEN** it names an exact version and upstream commit for every framework it describes
