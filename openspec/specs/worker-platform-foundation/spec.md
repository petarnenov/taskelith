# worker-platform-foundation Specification

## Purpose
Record the owner-selected Linux and macOS worker scope and the separate native acceptance gates each platform must pass before worker support is claimed.

## Requirements

### Requirement: Owner-selected native platform scope
The initial worker scope SHALL include Linux and macOS, with separate native acceptance evidence before either is labeled supported.

#### Scenario: Shared tests pass on a developer machine
- **WHEN** TypeScript tests pass on macOS or Linux without the worker failure/recovery scenarios
- **THEN** neither platform's native worker acceptance is marked passed on that basis

### Requirement: Isolated persistent namespace
Future runtime processes SHALL select a Taskelith-specific absolute data root using explicit configuration before platform defaults and SHALL keep worker and control-plane identity/state distinct.

#### Scenario: Worker is directed at an incompatible identity
- **WHEN** a data root is already bound to another worker or installation
- **THEN** startup refuses implicit reuse and requires an explicit enrollment/reconciliation procedure

### Requirement: Stateful runtime remains unimplemented
The platform foundation documentation SHALL distinguish selected conventions from implemented behavior and SHALL NOT imply new stateful bootstrap CLI commands.

#### Scenario: Owner selects two platforms
- **WHEN** Linux and macOS scope is recorded
- **THEN** the CLI continues exposing only existing bootstrap operations until a separately tracked implementation provides more

### Requirement: Initial worker matrix
The initial worker matrix SHALL be Linux on Ubuntu 24.04 LTS inside the worker container image for x86_64 and arm64, and macOS 26 natively on both Apple Silicon (arm64) and Intel (x86_64); each entry SHALL pass native acceptance before Taskelith claims support for it.

#### Scenario: Matrix recorded
- **WHEN** the worker platform contract and ADR 0007 are read
- **THEN** both Linux entries and both macOS entries, including Intel, are listed as required targets

#### Scenario: Support claim
- **WHEN** documentation or a release claims support for a matrix entry
- **THEN** that entry's native acceptance evidence exists; until then the entry is described as a target, not as supported
