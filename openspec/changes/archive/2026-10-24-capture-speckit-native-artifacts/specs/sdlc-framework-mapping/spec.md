## ADDED Requirements

### Requirement: Reproducible native capture
A framework whose runtime behaviour the mapping verifies by running it SHALL be run through a `make` target in a container pinned by digest, with its packages pinned by exact version and hash and no network access, and SHALL write its captured artifacts and a probe transcript to a committed location, normalized so that repeated runs produce identical output.

#### Scenario: Claim settled by the capture
- **WHEN** the capture exercises a runtime claim of the mapping
- **THEN** the mapping marks the claim as verified, or corrects it, and the capture record cites the probe

#### Scenario: Repeated capture
- **WHEN** the capture target runs again on the same pins
- **THEN** the captured artifacts and transcript are unchanged

#### Scenario: Claim the capture cannot reach
- **WHEN** a claim needs an agent harness that the capture does not run
- **THEN** the mapping keeps the claim marked as unverified
