# dependency-register Specification

## Purpose
Keep a dependency decision register that records each tool's exact version, license, upstream, status, and remaining admission evidence, without claiming qualification.

## Requirements

### Requirement: Version-specific decisions
The register SHALL record exact versions, role, upstream license/repository, runtime constraints, evidence, admission status, and unresolved gates for every direct development dependency and separately pinned runtime/release tools.

#### Scenario: Installed tool lacks complete qualification
- **WHEN** an existing tool lacks required maintenance, adoption, security, or recovery evidence
- **THEN** the register marks it as a candidate or replacement-required and distinguishes existing usage from admission

### Requirement: Reproducible dependency evidence
The assessment SHALL document reproducible inventory, audit, and SBOM commands and distinguish development findings from published runtime dependencies.

#### Scenario: Audit finds bundled vulnerabilities
- **WHEN** npm reports vulnerabilities inside a release tool's bundled dependencies
- **THEN** the register records the affected paths and severity without claiming a clean development audit or silently upgrading packages

### Requirement: No implicit infrastructure admission
Planned services and integrations SHALL remain candidates until exact editions, versions, and required qualification evidence are recorded.

#### Scenario: Architecture names a preferred service
- **WHEN** a preferred service appears in the architecture without a qualified deployment version
- **THEN** the register does not report it as accepted or installed
