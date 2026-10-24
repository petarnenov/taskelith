# sdlc-framework-port Specification

## Purpose
Define the draft `SdlcFramework` port of the SDLC module, its capability declaration, and the framework-neutral conformance suite that each framework plugin's tests run with that plugin's fixtures.

## Requirements

### Requirement: Draft framework port
The SDLC module SHALL export a draft `SdlcFramework` port with the asynchronous operations `discoverWorkItems`, `resolveWorkflow`, `describeArtifacts`, `inspectArtifactRevisions`, `prepareStageInstructions`, `validateStructure`, and `finalize`, each returning a kernel `Result`, with requests and results in plain text shapes that reuse the workflow-model input shapes. The port SHALL live in the module's `ports` layer and SHALL name no specific framework.

#### Scenario: Plugin result parsed by the module
- **WHEN** a plugin returns a resolved workflow
- **THEN** its definition is a workflow definition input that the workflow-model parser accepts or rejects

### Requirement: Explicit work item in requests
Every work-item operation of the port SHALL take the working copy and the work item's native reference, workflow resolution SHALL take an optional work item, and no operation SHALL depend on an implicit current work item kept in the working copy.

#### Scenario: Two work items in one working copy
- **WHEN** artifacts are described for two work items of the same working copy
- **THEN** each request names its own work item and gets that item's result

#### Scenario: Workflow selected per work item
- **WHEN** two work items of one working copy use different workflow versions
- **THEN** resolving the workflow with each work item returns that item's definition and digest

### Requirement: No approval from the port
No port operation SHALL return a semantic approval or decide a gate. Structural validation SHALL return a report with the verdict `valid` or `invalid`, a validator identity, an evidence reference, and its problems.

#### Scenario: Semantic verdict in a structural report
- **WHEN** a plugin's structural report has the verdict `approved`
- **THEN** the conformance suite reports a shape finding

### Requirement: Capability declaration
A plugin SHALL declare the optional operations it supports, from `validateStructure` and `finalize`, and the lifecycle obligations its native stages cover, as two arrays of strings without duplicates; parsing a declaration of another structure or with any other value SHALL fail with `invalid` naming the field. An undeclared optional operation SHALL fail with `unavailable`.

#### Scenario: Framework without finalization
- **WHEN** a plugin does not declare `finalize` and `finalize` is called
- **THEN** it fails with code `unavailable`

### Requirement: Conformance suite
The SDLC module SHALL export a framework-neutral conformance suite that takes a plugin and cases of an operation, a request, and an expected outcome, and returns a frozen report of findings. It SHALL report invalid capabilities without running any case, an operation that throws, an undeclared optional operation that does not fail with `unavailable`, and an outcome that differs from the expected one.

#### Scenario: Conforming plugin
- **WHEN** a plugin returns the expected outcome for every case with valid results
- **THEN** the report has no findings

#### Scenario: Throwing operation
- **WHEN** an operation throws instead of returning a result
- **THEN** the report has a finding for that case and the suite continues with the next case

### Requirement: Runtime checks of plugin results
The conformance suite SHALL report a value that is not a well-formed kernel `Result`, and a successful result that lacks its operation's runtime structure, has a field the port does not define, or is rejected by the domain parsers.

#### Scenario: Value of the wrong runtime type
- **WHEN** a plugin returns an artifact requirement whose `present` field is the string `yes`
- **THEN** the report has a shape finding for that field

### Requirement: Native obligations match the workflow
The conformance suite SHALL report a resolved workflow whose native stages do not cover exactly the native obligations the plugin declares.

#### Scenario: Declared obligation without a native stage
- **WHEN** a plugin declares `review` as a native obligation but its workflow covers review only with a platform-managed stage
- **THEN** the report has a shape finding naming `review`
