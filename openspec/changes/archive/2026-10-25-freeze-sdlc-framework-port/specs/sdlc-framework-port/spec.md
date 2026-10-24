## RENAMED Requirements

- FROM: `### Requirement: Draft framework port`
- TO: `### Requirement: Frozen framework port`

## MODIFIED Requirements

### Requirement: Frozen framework port
The SDLC module SHALL export the `SdlcFramework` port, frozen as semantic version `1.0.0`, with the asynchronous operations `discoverWorkItems`, `resolveWorkflow`, `describeArtifacts`, `inspectArtifactRevisions`, `prepareStageInstructions`, `validateStructure`, and `finalize`, each returning a kernel `Result`, with requests and results in the port's own plain data shapes. The port SHALL live in the module's `ports` layer and SHALL name no specific framework.

#### Scenario: Plugin result parsed by the module
- **WHEN** a plugin returns a resolved workflow
- **THEN** its definition is a workflow definition input that the workflow-model parser accepts or rejects

#### Scenario: Domain change
- **WHEN** a domain input type gains a field
- **THEN** the port's shapes stay the same and the module fails to compile until its parsers accept them again

## ADDED Requirements

### Requirement: Port entry
The SDLC module SHALL export its frozen port through the port entry `@taskelith/sdlc/port`, which holds only the port's types and constants and no domain or application code.

#### Scenario: Values of the port entry
- **WHEN** the port entry is loaded
- **THEN** its only values are the port version and the optional operations

### Requirement: Breaking port changes
A breaking change to the frozen port SHALL take a new major port version, recorded in an ADR, and SHALL pass both the OpenSpec and the SpecKit fixture sets through the conformance suite before it merges; a compatible change SHALL take a new minor version.

#### Scenario: Removed result field
- **WHEN** a change removes a field from a port result
- **THEN** it raises the port's major version and the plugin API version it is carried by

### Requirement: Conformance on both frameworks' fixtures
The OpenSpec fixtures SHALL pass the conformance suite through the OpenSpec adapter, and the SpecKit fixtures through a test-only normaliser in the SpecKit stub package until the SpecKit adapter replaces it.

#### Scenario: SpecKit fixtures
- **WHEN** the conformance suite runs the SpecKit mapping cases against the normaliser on the fixture working copy
- **THEN** it reports no findings
