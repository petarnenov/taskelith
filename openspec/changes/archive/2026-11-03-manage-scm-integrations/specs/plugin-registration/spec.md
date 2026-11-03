## MODIFIED Requirements

### Requirement: Compatible plugin API only
The plugin SDK SHALL declare the plugin API version it implements as a release version. The registration function SHALL reject a manifest whose caret range excludes that version with a `precondition-failed` failure whose details name the plugin identifier, the range, and the SDK's version.

#### Scenario: Incompatible range
- **WHEN** the SDK implements plugin API `0.4.0` and a manifest declares `^1.0.0`, `^0.3.0`, `^0.5.0`, or `^0.0.1`
- **THEN** registration returns a `precondition-failed` failure

### Requirement: Frozen port types from the plugin SDK
The plugin SDK SHALL re-export the types of each frozen port type-only from its root export, so that a plugin implements a port with the type from the SDK, and SHALL record the port versions its plugin API version carries. A new major port version SHALL come with a breaking plugin API version. The SDK SHALL re-export no draft port, except the SCM port as the requirement Draft SCM port from the plugin SDK allows.

#### Scenario: Plugin written for the draft SDLC framework port
- **WHEN** the SDK implements plugin API `0.4.0`, which carries version `1.0.0` of the `SdlcFramework` port, and a manifest declares `^0.1.0`
- **THEN** registration returns a `precondition-failed` failure

#### Scenario: Port version record
- **WHEN** the recorded `SdlcFramework` version differs from the port's own version constant
- **THEN** the plugin SDK does not compile

### Requirement: Draft SCM port from the plugin SDK
The plugin SDK SHALL re-export the types of the draft `SourceControlProvider` port and the draft `SourceControlPlugin` descriptor, type-only, in a `draft` namespace and not from its root export, so that the SCM plugin builds against them while the port stays a draft. A change to the draft port SHALL come with a new plugin API minor version. The port SHALL move to the root export, with a recorded version, only when a second SCM maps onto it and it is frozen.

#### Scenario: Draft port at the root
- **WHEN** a plugin imports `SourceControlProvider` from the SDK's root export
- **THEN** the plugin does not compile, and `draft.SourceControlProvider` is the integrations module's port type

#### Scenario: No runtime draft surface
- **WHEN** the SDK's root export is loaded
- **THEN** it holds only the frozen surface's values, and no draft value

#### Scenario: Plugin built before the descriptor
- **WHEN** the SDK implements plugin API `0.4.0`, which adds the descriptor, and a manifest declares `^0.3.0`
- **THEN** registration returns a `precondition-failed` failure
