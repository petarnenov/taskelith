# engineering-principles Specification

## Purpose
Check every Taskelith design, change, test, and review against the owner's first-class principles in ADR 0004 (principle 8 as amended by ADR 0008), and bind every task to the project's selected SDLC framework, with OpenSpec as the default.

## Requirements

### Requirement: First-class principles govern every change
Every design, code change, test, and review of Taskelith SHALL be checked against the nine principles in ADR 0004, and a change that cannot meet one SHALL record the conflict and ask the owner instead of exempting itself.

#### Scenario: Review of a change
- **WHEN** an independent review of a Taskelith change is recorded in its `verification.md`
- **THEN** the review prompt named the ADR 0004 principles as criteria, and every finding against a principle is resolved or recorded as an owner-decided conflict

#### Scenario: A principle cannot be met
- **WHEN** a change cannot meet one of the principles
- **THEN** its `verification.md` records the conflict and the owner's decision

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

### Requirement: Code coverage threshold
`make verify` SHALL fail when automated tests cover less than 75% of lines, branches, or functions of the compiled product code in `dist/` of the root package and of every workspace package, measured without repository scripts, or of the sources in `src/` of the browser application, or when a product module under `src/` of the root package, of a workspace package, or of the browser application is missing from its coverage report.

#### Scenario: Coverage below the threshold
- **WHEN** a change lowers line, branch, or function coverage below 75%
- **THEN** `make verify` fails locally and in CI

#### Scenario: Untested product module
- **WHEN** a product module under `src/` is not loaded by any test
- **THEN** the coverage scope check names the module and `make verify` fails

#### Scenario: Untested workspace package module
- **WHEN** a module under a workspace package's `src/` is not loaded by any test
- **THEN** the coverage scope check names the module and `make verify` fails

#### Scenario: Untested browser application module
- **WHEN** a module under the browser application's `src/`, a `.tsx` module included, emits code and is missing from the application's Vitest coverage report
- **THEN** the coverage scope check names the module and `make verify` fails

### Requirement: SDLC framework binding with OpenSpec as default
Every task that develops Taskelith SHALL be bound to a change of the project's selected spec-driven framework, without exception; OpenSpec SHALL be the default framework, and every project, Taskelith included, SHALL be able to select another supported framework through replaceable SDLC plugins.

#### Scenario: Task without a change
- **WHEN** a task changes the Taskelith repository
- **THEN** a change of the selected framework records its scope, verification, and review before integration

#### Scenario: Default framework
- **WHEN** no other framework has been selected for a project
- **THEN** its tasks are bound to OpenSpec changes

#### Scenario: Another framework selected
- **WHEN** a project-maintainer selects SpecKit or another supported framework for a project
- **THEN** new tasks bind to that framework through its plugin, and running work keeps its existing binding

#### Scenario: Framework tooling not admitted
- **WHEN** another framework is selected for this repository before its pinned tooling is admitted through the dependency policy
- **THEN** the selection is not applied and tasks keep binding to OpenSpec

### Requirement: Comment length bound
A code comment SHALL span at most two lines of at most 80 characters each, counting every line of the comment including block-comment delimiters, counting indentation and the comment marker, and counting the whole physical line of a trailing comment.

#### Scenario: New comment too long
- **WHEN** a change adds a comment of three lines, or a line of more than 80 characters
- **THEN** `make verify` fails, and the author shortens it

#### Scenario: One-line block comment
- **WHEN** a block comment holds one line of text between `/**` and `*/` lines
- **THEN** it counts as three lines and is written as `/** text */` instead

### Requirement: Comment length scope
The comment length bound SHALL apply to every comment in tracked authored source, script, build, and configuration files: `*.ts`, `*.mts`, `*.cts`, `*.js`, `*.mjs`, `*.cjs`, `*.sh`, `*.yml`, and `*.yaml` files, files named `Makefile` or `Dockerfile`, and extensionless scripts. Generated files, meaning files a tool writes and no one edits by hand, lockfiles, captured third-party artifacts under `docs/qualification/`, and fixture copies of such captures SHALL be exempt.

#### Scenario: Existing long comment touched
- **WHEN** a change's diff edits a line of an existing comment that exceeds the bound
- **THEN** the change shortens that comment to the bound

#### Scenario: Existing long comment untouched
- **WHEN** a tracked file in scope contains a comment that exceeds the bound and no change's diff touches it
- **THEN** the bound still applies to it

#### Scenario: Generated file
- **WHEN** a generated file or lockfile, such as `tools/speckit/requirements.txt`, contains a longer comment
- **THEN** the bound does not apply to it

#### Scenario: Captured evidence
- **WHEN** a captured third-party file under `docs/qualification/`, or its copy in the SpecKit plugin fixtures, contains a longer comment
- **THEN** the bound does not apply to it

### Requirement: Comment length check
`make verify` SHALL fail when a comment in a tracked file within the comment length scope exceeds the bound, and SHALL report each violation with the file, the line, and the reason.

#### Scenario: Violation reported
- **WHEN** a tracked script has a comment line of 95 characters
- **THEN** `make verify` fails and prints the file, the line, and that the line is 95 characters with a maximum of 80

#### Scenario: Comment markers in code
- **WHEN** a string, template literal, regular expression, or shell expansion contains `//`, `/*`, or `#`
- **THEN** the check does not treat it as a comment
