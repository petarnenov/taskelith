## ADDED Requirements

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
