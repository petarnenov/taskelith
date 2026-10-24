## MODIFIED Requirements

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
