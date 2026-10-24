## MODIFIED Requirements

### Requirement: Automated hexagonal boundary and TypeScript checks
The project SHALL typecheck all repository TypeScript files (`src/`, `scripts/`, `test/`) and enforce hexagonal import boundaries and the TypeScript-only product code rule in automated tests and CI. The boundary checker SHALL run its checks whenever it is started as a script, including through a symlinked path.

#### Scenario: Domain or application code imports an adapter or cross-module internal file
- **WHEN** a file in a `domain` or `application` layer imports a concrete adapter, infrastructure SDK, or another module's internal path, or a product-owned Go file is introduced
- **THEN** the boundary checker fails with the offending file path and rule violation

#### Scenario: Checker is started through a symlinked path
- **WHEN** the boundary checker script is started through a path that contains a symlink, in a workspace with a boundary violation
- **THEN** it runs the checks and fails with the violation instead of exiting successfully without checking
