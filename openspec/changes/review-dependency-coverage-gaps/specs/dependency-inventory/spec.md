## ADDED Requirements

### Requirement: Reviewed license coverage gaps
Every inventory path with a license coverage gap SHALL have exactly one retained review keyed by path, version, and installed manifest hash, with a descriptive status, a finding, and at least one evidence source. Inventory generation and check mode SHALL fail when reviews and gaps do not match exactly.

#### Scenario: Gap package manifest changes
- **WHEN** a reviewed gap path's installed manifest hash or version changes
- **THEN** the inventory command fails, reporting the path as unreviewed and the prior review as stale

#### Scenario: Review is incomplete
- **WHEN** a review has an unknown status, no finding, or no evidence
- **THEN** the inventory command fails instead of treating the gap as reviewed

### Requirement: Evidence status is not admission
A license coverage review SHALL describe located evidence only. It SHALL NOT mark a dependency accepted or state legal compliance.

#### Scenario: Only a manifest declaration exists
- **WHEN** no license text is located in the package or in upstream source at the published version
- **THEN** the review records `declaration-only` and the sufficiency decision remains open
