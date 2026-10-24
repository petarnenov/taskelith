## ADDED Requirements

### Requirement: Reproducible retained inventory
The development inventory command SHALL use the pinned CI Node/npm versions, retain a normalized npm-generated CycloneDX SBOM and per-installation license evidence, and detect drift without overwriting evidence in check mode.

#### Scenario: Dependency inputs change
- **WHEN** the lockfile or installed license evidence differs from retained inventory
- **THEN** check mode fails and requires explicit regeneration and review

### Requirement: Honest bundled coverage
The inventory SHALL include bundled lockfile paths and legacy license declarations, hash discovered license/notice text, and list missing declarations or local texts as unresolved coverage.

#### Scenario: Package has only legacy license metadata
- **WHEN** a bundled package declares licenses through its legacy manifest field
- **THEN** the inventory preserves the declaration and available text evidence without reporting complete license compliance

### Requirement: No local secrets in evidence
The retained evidence SHALL contain dependency identities, public package metadata, relative dependency paths, hashes, and tool versions, without environment values, credentials, or absolute workstation paths.

#### Scenario: Inventory runs on another workstation
- **WHEN** identical supported inputs and package contents are inspected under another checkout path
- **THEN** retained dependency evidence remains independent of the workstation path
