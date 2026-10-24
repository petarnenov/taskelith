## MODIFIED Requirements

### Requirement: Compatible plugin API only
The plugin SDK SHALL declare the plugin API version it implements as a release version. The registration function SHALL reject a manifest whose caret range excludes that version with a `precondition-failed` failure whose details name the plugin identifier, the range, and the SDK's version.

#### Scenario: Incompatible range
- **WHEN** the SDK implements plugin API `0.2.0` and a manifest declares `^1.0.0`, `^0.3.0`, or `^0.0.1`
- **THEN** registration returns a `precondition-failed` failure

## ADDED Requirements

### Requirement: Frozen port types from the plugin SDK
The plugin SDK SHALL re-export the types of each frozen port type-only from its root export, so that a plugin implements a port with the type from the SDK, and SHALL record the port versions its plugin API version carries. A new major port version SHALL come with a breaking plugin API version.

#### Scenario: Plugin written for the draft SDLC framework port
- **WHEN** the SDK implements plugin API `0.2.0`, which carries version `1.0.0` of the `SdlcFramework` port, and a manifest declares `^0.1.0`
- **THEN** registration returns a `precondition-failed` failure

#### Scenario: Port version record
- **WHEN** the recorded `SdlcFramework` version differs from the port's own version constant
- **THEN** the plugin SDK does not compile
