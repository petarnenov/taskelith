## Purpose

Define the minimum plugin registration path of the microkernel: the manifest subset a plugin declares and the rules the plugin SDK applies before a plugin is admitted.

## ADDED Requirements

### Requirement: Plugin manifest subset
A plugin manifest SHALL be a JSON object with exactly the fields `id`, `version`, `pluginApiRange`, `port`, and `capabilities`, described by a JSON Schema document in the plugin SDK package that is compiled as JSON Schema 2020-12, declares no `$schema`, and uses only keywords with the same meaning in JSON Schema draft-07.

#### Scenario: Valid manifest
- **WHEN** a manifest declares `id` `sdlc-example`, `version` `1.4.0-rc.1+build.7`, a `pluginApiRange` that accepts the SDK's plugin API version, `port` `SdlcFramework`, and two distinct capabilities, and the host offers `SdlcFramework`
- **THEN** registration succeeds and returns a frozen copy of the manifest

#### Scenario: Unknown field
- **WHEN** a manifest contains a field outside the subset
- **THEN** registration returns an `invalid` failure whose message names the field

### Requirement: Manifest field formats
In a plugin manifest, `id` and each capability SHALL be 1 to 64 lowercase letters, digits, and inner hyphens, starting with a letter; `version` SHALL be a semantic version; `pluginApiRange` SHALL be a caret range `^MAJOR.MINOR.PATCH`; `port` SHALL be a PascalCase name of at most 64 characters; and capabilities SHALL be unique.

#### Scenario: Field formats
- **WHEN** `id` is `Sdlc_Example`, `version` is `1.4`, `pluginApiRange` is `0.1.0`, `port` is `sdlcFramework`, or a capability is repeated
- **THEN** registration returns an `invalid` failure that locates the field

### Requirement: Schema validation before admission
The registration function SHALL validate every manifest against the manifest schema with the selected validator before any other check, and SHALL return an `invalid` failure whose message lists each schema error with its location.

#### Scenario: Several missing fields
- **WHEN** an empty object is registered
- **THEN** the failure has code `invalid` and its message names every missing required field

#### Scenario: Malformed value
- **WHEN** a field has the wrong type or format, for example `pluginApiRange` `>=0.1.0` or a repeated capability
- **THEN** the failure has code `invalid` and its message names the field's location

### Requirement: Known ports only
The registration function SHALL receive the ports the host offers and SHALL reject a valid manifest whose port is not among them with a `not-found` failure whose details name the plugin identifier and the port, before checking the plugin API range.

#### Scenario: Unknown port
- **WHEN** a valid manifest declares port `AgentHarness` and the host offers only `SdlcFramework`
- **THEN** registration returns a `not-found` failure with the plugin identifier and `AgentHarness` in its details

### Requirement: Compatible plugin API only
The plugin SDK SHALL declare the plugin API version it implements as a release version. The registration function SHALL reject a manifest whose caret range excludes that version with a `precondition-failed` failure whose details name the plugin identifier, the range, and the SDK's version.

#### Scenario: Incompatible range
- **WHEN** the SDK implements plugin API `0.1.0` and a manifest declares `^1.0.0`, `^0.2.0`, or `^0.0.1`
- **THEN** registration returns a `precondition-failed` failure

### Requirement: Caret range semantics
A caret range SHALL accept versions from its minimum with the same major version when the major is at least 1, with the same minor version when the major is 0 and the minor at least 1, and only its exact version otherwise; a version or range in any other form SHALL NOT satisfy the check.

#### Scenario: Caret semantics
- **WHEN** `1.9.0` is checked against `^1.2.3`, `0.3.0` against `^0.2.3`, and `0.0.4` against `^0.0.3`
- **THEN** the first is accepted and the other two are rejected

#### Scenario: Unsupported forms
- **WHEN** `1.2.3-beta` or `1.2` is checked against `^1.2.3`, or `1.2.3` against `1.2.3` or `>=1.2.3`
- **THEN** none is accepted

### Requirement: Library-level registration
Registration SHALL be a library function of the `@taskelith/plugin-sdk` package that returns a kernel `Result`, holds no state, and starts no process; the package SHALL be private, and the published `taskelith` package SHALL NOT include it.

#### Scenario: Package tests
- **WHEN** `make verify` runs
- **THEN** the plugin SDK tests import `@taskelith/plugin-sdk` by name and the coverage report lists every compiled plugin SDK module
