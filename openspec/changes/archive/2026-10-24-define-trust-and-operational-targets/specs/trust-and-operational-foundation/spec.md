## ADDED Requirements

### Requirement: Explicit identity and trust boundaries
The project SHALL document installation bootstrap/recovery authority, project-scoped roles, per-worker enrollment and revocation, trusted-host execution assumptions, and plugin SDK capability scoping before runtime implementation begins.

#### Scenario: Worker credential is revoked or installation enters restore quarantine
- **WHEN** a worker identity is revoked or the recovery epoch advances
- **THEN** the trust contract requires denying new launch authorizations and stale-generation mutations while preserving audit evidence of in-flight execution

### Requirement: Pre-declared provisional operational targets
The project SHALL define provisional resource budgets, retention horizons, latency bounds, and RPO/RTO targets for the 10, 100, and 1000 machine stages prior to running capacity or recovery benchmarks.

#### Scenario: Delegated child tasks are spawned
- **WHEN** an admitted attempt delegates work to child tasks
- **THEN** the operational budget contract requires child attempts to draw from the shared parent run/project reservation rather than creating independent capacity budgets

### Requirement: Automated hexagonal boundary and TypeScript checks
The project SHALL typecheck all repository TypeScript files (`src/`, `scripts/`, `test/`) and enforce hexagonal import boundaries and the TypeScript-only product code rule in automated tests and CI.

#### Scenario: Domain or application code imports an adapter or cross-module internal file
- **WHEN** a file in a `domain` or `application` layer imports a concrete adapter, infrastructure SDK, or another module's internal path, or a product-owned Go file is introduced
- **THEN** the boundary checker fails with the offending file path and rule violation
