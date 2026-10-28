# trust-and-operational-foundation Specification

## Purpose
Define the identity, enrollment, and trust boundaries and the provisional operational targets and resource budgets that later runtime phases implement and measure.

## Requirements

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

#### Scenario: Application source imports development code or another application
- **WHEN** a file under `apps/<name>/src/` imports repository scripts or tests, or another application's files by a relative path
- **THEN** the boundary checker fails with the offending file path

### Requirement: Worker-only code stays out of API and browser bundles
The boundary checker SHALL treat as worker-only `apps/worker`, each `packages/adapters/worker-*` package, and each product package whose source imports at runtime a process-launching module of a named list (`child_process`, `node-pty`, `execa`, `cross-spawn`, `shelljs`, `zx`) or, transitively, a worker-only package. It SHALL fail when `apps/control-plane/src/` or `apps/web/src/` imports such a module or worker-only code at runtime.

#### Scenario: Direct import of a worker-only package
- **WHEN** control-plane or web source imports `apps/worker` or a `packages/adapters/worker-*` package by name or relative path
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Process launch in API or browser code
- **WHEN** control-plane or web source imports a module of that list, such as `node:child_process` or `execa`, including through `require()` or a re-export
- **THEN** the boundary checker fails with the offending file path

#### Scenario: Transitive reach
- **WHEN** control-plane source imports a package that, through its own runtime imports, reaches a package that launches processes
- **THEN** the boundary checker fails and names the import chain

#### Scenario: Types and tests
- **WHEN** control-plane source imports a worker-only package with `import type` or with only inline `type` bindings, or a control-plane test imports `node:child_process`
- **THEN** the boundary checker accepts it, because neither enters a bundle while no TypeScript configuration enables `verbatimModuleSyntax`, which would keep an inline-type-only import as a side-effect import

### Requirement: Operator principals and roles behind the Access port
The `Access` module SHALL keep operator principals, the `installation-owner` role, and at most one project role per principal and project behind ports with conformance suites, and SHALL check the role that the control-plane wire contracts section 3 names before any other port is called. Roles SHALL be read for every request, so a removed role applies to the next one.

#### Scenario: Role removed
- **WHEN** a principal's project role is removed while it holds a session
- **THEN** its next request on that project answers 403 with reason `role-required`

#### Scenario: Viewer cannot mutate
- **WHEN** a `project-viewer` calls an operation that requires `project-maintainer` on its project
- **THEN** the answer is 403 with reason `role-required` and nothing takes effect

### Requirement: First installation-owner from the bootstrap credential
The principal that the operator credential authenticates SHALL be created exactly once, with the `installation-owner` role, in one transaction with an audit event that names the actor and reason. Every refused or no-op repeat of that bootstrap SHALL write an audit event that holds no secret. A reset of the operator credential SHALL keep that principal.

#### Scenario: Concurrent creation
- **WHEN** two control-plane starts create the owner principal at once
- **THEN** exactly one principal and one creation event exist, and the other start writes a repeat event

#### Scenario: Repeated bootstrap
- **WHEN** the owner principal already exists and the control plane starts again
- **THEN** no principal is added, and a repeat event names the owner, the actor, and the reason

#### Scenario: Refused initialization
- **WHEN** `init` runs again on an initialized installation
- **THEN** it is refused, and a refusal event names the owner, the actor, and the reason, but no secret

#### Scenario: Credential reset
- **WHEN** the operator credential is reset
- **THEN** the new bearer authenticates the same principal

### Requirement: Password storage
Passwords SHALL be normalized to Unicode NFC before the length check and before hashing, set only when their NFD form has at most `Password.maxLength` code points, stored only as argon2id PHC strings with at least m=19456 KiB, t=2, and p=1, verified in constant time, and rehashed at login when stored parameters are weaker. An unknown login name SHALL cost the same hash computation as a wrong password. The control plane SHALL fail its start when `crypto.argon2` is missing.

#### Scenario: Known vector
- **WHEN** the hasher computes the RFC 9106 section 5.3 argon2id test vector
- **THEN** the tag equals the published one

#### Scenario: Normalization
- **WHEN** a password is set in one Unicode normalization form and presented at login in another
- **THEN** the login succeeds

#### Scenario: Decomposed length
- **WHEN** a password is set whose NFC form fits `Password.maxLength` but whose NFD form does not
- **THEN** it is refused as `invalid`

#### Scenario: Weaker stored parameters
- **WHEN** a principal logs in with a hash of weaker parameters
- **THEN** the login succeeds and the stored hash is replaced with the current parameters

### Requirement: Approver port
Approvals SHALL be authorized through an approver port that takes the decision body the gate names, never through a hard-coded human role check, and principals SHALL carry a kind so that a non-human decision body can be added later.

#### Scenario: Maintainer approval
- **WHEN** a `project-maintainer` asks to approve a gate whose decision body is `project-maintainer` on its project
- **THEN** the approver port allows it, and refuses a `project-operator` with reason `role-required`

### Requirement: A password change ends the principal's sessions
Setting a principal's password SHALL end every session of that principal in the same transaction, so that no session authenticated with the earlier password stays usable, and a login verified against the earlier password SHALL fail.

#### Scenario: Sessions after a password change
- **WHEN** the password of a principal with two live sessions is set
- **THEN** both sessions end in the write that stores the new hash

### Requirement: Temporary G2 bridge
Until G3 item 11 lands projects and memberships, an `installation-owner` SHALL also pass the project requirements of the G2 execution and SDLC operator operations, through one requirement kind of the `Access` module named as the bridge. This requirement is temporary; item 11 SHALL remove it.

#### Scenario: Owner on a G2 operation
- **WHEN** an `installation-owner` without a project role calls a G2 operation that requires `project-operator`
- **THEN** the bridge passes it, while another principal without the role is denied with `role-required`
