## ADDED Requirements

### Requirement: Initial worker matrix
The initial worker matrix SHALL be Linux on Ubuntu 24.04 LTS inside the worker container image for x86_64 and arm64, and macOS 26 natively on both Apple Silicon (arm64) and Intel (x86_64); each entry SHALL pass native acceptance before Taskelith claims support for it.

#### Scenario: Matrix recorded
- **WHEN** the worker platform contract and ADR 0007 are read
- **THEN** both Linux entries and both macOS entries, including Intel, are listed as required targets

#### Scenario: Support claim
- **WHEN** documentation or a release claims support for a matrix entry
- **THEN** that entry's native acceptance evidence exists; until then the entry is described as a target, not as supported
