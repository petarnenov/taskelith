## ADDED Requirements

### Requirement: Worker-only code stays out of API and browser bundles
The boundary checker SHALL treat as worker-only `apps/worker`, every `packages/adapters/worker-*` package, and every product package whose source imports `child_process` or `node-pty` at runtime or, directly or through other packages, a worker-only package. It SHALL fail when source under `apps/control-plane/src/` or `apps/web/src/` imports, other than type-only, a process-launching module or worker-only code.

#### Scenario: Direct import of a worker-only package
- **WHEN** control-plane or web source imports `apps/worker` or a `packages/adapters/worker-*` package by name or relative path
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Process launch in API or browser code
- **WHEN** control-plane or web source imports `child_process`, `node:child_process`, or `node-pty`
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Transitive reach
- **WHEN** control-plane source imports a package that, through its own runtime imports, reaches a package that launches processes
- **THEN** the boundary checker fails and names the import chain

#### Scenario: Types and tests
- **WHEN** control-plane source imports a worker-only package type-only, or a control-plane test imports `node:child_process`
- **THEN** the boundary checker accepts it, because neither enters a bundle

### Requirement: Application boundaries
The boundary checker SHALL apply the product source rules to applications: source under `apps/<name>/src/` SHALL NOT import repository scripts or tests, and a relative import from or into an application that crosses into another product package SHALL fail.

#### Scenario: Application imports another application by path
- **WHEN** a file under `apps/cli/src/` imports `apps/control-plane/src/` by a relative path
- **THEN** the boundary checker fails with the offending file path
