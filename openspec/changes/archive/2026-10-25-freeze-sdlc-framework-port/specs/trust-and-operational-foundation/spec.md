## MODIFIED Requirements

### Requirement: Automated hexagonal boundary and TypeScript checks
The project SHALL typecheck all repository TypeScript files (`src/`, `scripts/`, `test/`, and each workspace package's `src/` and `test/`) and enforce hexagonal import boundaries and the TypeScript-only product code rule in automated tests and CI. The boundary checker SHALL run its checks whenever it is started as a script, including through a symlinked path.

#### Scenario: Domain or application code imports an adapter or cross-module internal file
- **WHEN** a file in a `domain` or `application` layer imports a concrete adapter, infrastructure SDK, or another module's internal path, or a product-owned Go file is introduced
- **THEN** the boundary checker fails with the offending file path and rule violation

#### Scenario: Checker is started through a symlinked path
- **WHEN** the boundary checker script is started through a path that contains a symlink, in a workspace with a boundary violation
- **THEN** it runs the checks and fails with the violation instead of exiting successfully without checking

#### Scenario: Layer rules inside a workspace package
- **WHEN** a file under a module package's `src/domain/` imports that module's `src/application/` or `src/ports/`
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Kernel imports beyond itself
- **WHEN** a file under `packages/kernel/src/` imports a workspace package, a path outside `packages/kernel/`, or an infrastructure SDK
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Plugin imports beyond the plugin SDK
- **WHEN** a file under a plugin package's `src/` imports a workspace package other than the kernel, plugin SDK, or contracts packages, or product code outside its own package
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Subpath import of a workspace package
- **WHEN** product code imports a subpath of a `@taskelith/` workspace package other than a module package's port entry `port`, instead of its root export
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Plugin SDK imports beyond a port entry
- **WHEN** a file under `packages/plugin-sdk/src/` imports a module package other than with `import type` or `export type` through its port entry
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Named import of a forbidden package
- **WHEN** module source imports an adapter or plugin package by its `@taskelith/` name, or web application code imports a module, adapter, or plugin package by name
- **THEN** the boundary checker applies the same rule as for a relative import and fails with the offending file path

#### Scenario: Relative import across packages
- **WHEN** a file imports a file of another product package by a relative path
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Package source imports development code
- **WHEN** a file under any product package's `src/` imports repository scripts or tests, including its own package's tests
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Published root package imports a workspace package
- **WHEN** a file under the root `src/` imports a `@taskelith/` workspace package
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Package imports alias
- **WHEN** product code imports a `#` package imports alias
- **THEN** the boundary checker fails with the offending file path, because an alias hides the imported package from the other rules

#### Scenario: Relative import of installed or built code
- **WHEN** product code imports a path under `node_modules/` or `dist/` by a relative path
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Dynamic import or require of a forbidden package
- **WHEN** product code imports a forbidden package with `import()`, including with an options argument, or with `require()`, using a string or a template literal without substitutions
- **THEN** the boundary checker applies the same rules as for a static import

#### Scenario: Module tests use adapters
- **WHEN** a file under a module package's `test/` imports an infrastructure SDK or an adapter package
- **THEN** the boundary checker accepts it
