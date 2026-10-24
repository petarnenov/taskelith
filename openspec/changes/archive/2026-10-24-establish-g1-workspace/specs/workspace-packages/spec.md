## Purpose

Define the npm workspace layout for Taskelith's product packages and how verification builds, tests, measures, and inventories them.

## ADDED Requirements

### Requirement: Workspace package layout
The root manifest SHALL declare the architecture's `packages/` paths as npm workspaces, each workspace package SHALL be private and keep its sources in `src/`, its build output in `dist/`, and its tests in `test/`, and `make verify` SHALL build and test every workspace package that exists and succeed when none exists.

#### Scenario: No workspace package exists
- **WHEN** no directory matching a workspace pattern contains a `package.json`
- **THEN** the build reports that there is nothing to build and `make verify` continues

#### Scenario: A workspace package exists
- **WHEN** a workspace package with sources and tests exists
- **THEN** `make verify` compiles it with its own `tsconfig.json`, runs its tests, and measures the coverage of its `dist/`

#### Scenario: A package depends on another package
- **WHEN** a workspace package depends on another workspace package and no build output exists
- **THEN** the build compiles the dependency first and the dependent package resolves its types

### Requirement: Workspace package contract
Before building, `make verify` SHALL check that each workspace package is private, is named `@taskelith/<directory name>`, has `type: module`, exposes exactly one root export with types, declares no `imports` aliases, has a `tsconfig.json` that extends the shared `tsconfig.package.json` without overriding its layout, and references exactly the workspace packages it depends on in any dependency section, and it SHALL fail on any deviation.

#### Scenario: Missing project reference
- **WHEN** a workspace package depends on another workspace package without referencing it in its `tsconfig.json`
- **THEN** the build fails and names the package and the expected references

#### Scenario: Additional export entry
- **WHEN** a workspace package declares an export other than its root entry
- **THEN** the build fails and names the package

### Requirement: Workspace packages in the dependency inventory
The dependency inventory SHALL treat workspace packages as first-party code: it SHALL skip their link and directory entries, reject links to anything other than a relative path under `packages/`, and still inventory packages installed inside a workspace package.

#### Scenario: Workspace link in the lockfile
- **WHEN** the lockfile links `node_modules/@taskelith/<name>` to a directory under `packages/`
- **THEN** the inventory omits the link and the package directory, and inventories the third-party packages installed under that directory's `node_modules`

#### Scenario: Link outside the workspace
- **WHEN** the lockfile contains a link whose target is not a declared workspace package with the link's name
- **THEN** inventory generation fails
