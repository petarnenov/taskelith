# engineering-principles Specification

## Purpose
Check every Taskelith design, change, test, and review against the owner's first-class principles in ADR 0004, and keep OpenSpec mandatory for developing Taskelith while managed projects choose their own framework.

## Requirements

### Requirement: First-class principles govern every change
Every design, code change, test, and review of Taskelith SHALL be checked against the eight principles in ADR 0004, and a change that cannot meet one SHALL record the conflict and ask the owner instead of exempting itself.

#### Scenario: Review of a change
- **WHEN** an independent review of a Taskelith change is recorded in its `verification.md`
- **THEN** the review prompt named the ADR 0004 principles as criteria, and every finding against a principle is resolved or recorded as an owner-decided conflict

#### Scenario: A principle cannot be met
- **WHEN** a change cannot meet one of the principles
- **THEN** its `verification.md` records the conflict and the owner's decision

### Requirement: Mandatory OpenSpec for Taskelith development
Every task that develops Taskelith SHALL be bound to an OpenSpec change, while projects managed by Taskelith SHALL be able to select another spec-driven framework through replaceable SDLC plugins.

#### Scenario: Task without a change
- **WHEN** a task changes the Taskelith repository
- **THEN** an OpenSpec change records its scope, verification, and review before integration

#### Scenario: Managed project framework
- **WHEN** a managed project selects SpecKit or another supported framework
- **THEN** Taskelith runs that project's workflows through the selected framework plugin without requiring OpenSpec

### Requirement: Make targets as the operational interface
Once the Makefile exists, documentation and CI SHALL invoke operations through `make` targets, with npm scripts allowed only as their implementation.

#### Scenario: New operation
- **WHEN** a new build, check, container, or qualification operation is added
- **THEN** it is exposed as a `make` target and documented by that target

### Requirement: Architecture principles are enforced
Kernel and module code SHALL depend only on ports, every adapter of a port SHALL pass that port's shared conformance suite, and integrations SHALL be added as plugins without kernel changes.

#### Scenario: Boundary violation
- **WHEN** module code imports an adapter, framework, or vendor package
- **THEN** the boundary check in `npm test` (`scripts/check-boundaries.ts`) fails

#### Scenario: New adapter
- **WHEN** a new adapter for an existing port is added
- **THEN** it passes the port's shared conformance suite before it is registered

### Requirement: Container-first runtime
Every runnable Taskelith component and its infrastructure SHALL ship as an OCI image pinned by digest, with Docker Compose as the primary development and small-installation path and CI checks running in containers; macOS workers SHALL run natively and Kubernetes SHALL stay optional.

#### Scenario: New runnable component
- **WHEN** a runnable component is added
- **THEN** it has a digest-pinned image and a Compose service before it is released

#### Scenario: Linux worker harness
- **WHEN** a harness runs on a Linux worker
- **THEN** it runs inside the worker image, not from a host-wide installation

### Requirement: Contract-first APIs
Every HTTP API SHALL be defined first in a versioned OpenAPI 3.1 document and every broker message in an AsyncAPI document, with types, runtime validation, and clients generated from them.

#### Scenario: New endpoint
- **WHEN** an HTTP endpoint is added or changed
- **THEN** the OpenAPI document changes in the same change, and CI fails on an unversioned breaking change
