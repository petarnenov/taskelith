# workspace-packages Specification

## Purpose
Define the npm workspace layout for Taskelith's product packages and how verification builds, tests, measures, and inventories them.

## Requirements

### Requirement: Workspace package layout
The root manifest SHALL declare the architecture's `packages/` paths and `apps/*` as npm workspaces, each workspace package SHALL be private and keep its sources in `src/`, its build output in `dist/`, and its tests in `test/`, and `make verify` SHALL build and test every workspace package that exists and succeed when none exists.

#### Scenario: No workspace package exists
- **WHEN** no directory matching a workspace pattern contains a `package.json`
- **THEN** the build reports that there is nothing to build and `make verify` continues

#### Scenario: A workspace package exists
- **WHEN** a workspace package with sources and tests exists
- **THEN** `make verify` compiles it with its own `tsconfig.json`, runs its tests, and measures the coverage of its `dist/`

#### Scenario: A package depends on another package
- **WHEN** a workspace package depends on another workspace package and no build output exists
- **THEN** the build compiles the dependency first and the dependent package resolves its types

#### Scenario: Runtime applications
- **WHEN** `make verify` runs on the repository
- **THEN** it builds, typechecks, tests, and measures the coverage of `apps/control-plane` (`@taskelith/control-plane`) and `apps/worker` (`@taskelith/worker`) like every other workspace package

### Requirement: Workspace package contract
Before building, `make verify` SHALL check that each workspace package is private, is named `@taskelith/<directory name>`, has `type: module`, exposes one root export with types and, only for a module, an optional `./port`, declares no `imports` aliases, has a `tsconfig.json` that extends the shared `tsconfig.package.json` without overriding its layout, and references exactly the workspace packages it depends on in any dependency section, and it SHALL fail on any deviation.

#### Scenario: Missing project reference
- **WHEN** a workspace package depends on another workspace package without referencing it in its `tsconfig.json`
- **THEN** the build fails and names the package and the expected references

#### Scenario: Additional export entry
- **WHEN** a workspace package declares an export other than its root entry and, for a module package, its port entry `./port`
- **THEN** the build fails and names the package

#### Scenario: Module port entry
- **WHEN** a module package exports `./port` with types `./dist/port.d.ts`, or a package that is not a module exports `./port`
- **THEN** the contract accepts the module's entry and requires both port outputs, and fails for the other package

### Requirement: Workspace packages in the dependency inventory
The dependency inventory SHALL treat workspace packages as first-party code: it SHALL skip their link and directory entries, reject links to anything other than a declared workspace package directory, and still inventory packages installed inside a workspace package.

#### Scenario: Workspace link in the lockfile
- **WHEN** the lockfile links `node_modules/@taskelith/<name>` to a declared workspace package directory under `packages/` or `apps/`
- **THEN** the inventory omits the link and the package directory, and inventories the third-party packages installed under that directory's `node_modules`

#### Scenario: Link outside the workspace
- **WHEN** the lockfile contains a link whose target is not a declared workspace package with the link's name
- **THEN** inventory generation fails
