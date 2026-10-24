# sdlc-workflow-model Specification

## Purpose
Define the framework-neutral workflow model of the SDLC module: versioned workflow definitions as stage graphs that cover every lifecycle obligation, the immutable binding of a workflow run to its framework and policy, work-item identity, and artifact revisions.

## Requirements

### Requirement: SDLC module package
The SDLC module SHALL be the workspace package `@taskelith/sdlc`, SHALL depend on no workspace package other than `@taskelith/kernel` and on no runtime dependency, SHALL keep its workflow model in its domain layer, and SHALL name no specific SDLC framework, harness, provider, or SCM in its code or types.

#### Scenario: Model without I/O
- **WHEN** a test constructs workflow definitions, bindings, work items, and artifact revisions from fixed inputs
- **THEN** the results are the same on every run, because the model reads no file, clock, or random source

### Requirement: Lifecycle obligations and stage origins
The model SHALL define the lifecycle obligations `intake`, `specification`, `implementation`, `review`, `verification`, and `closure`, and the stage origins `native` and `platform-managed`, and SHALL reject any other text with an `invalid` failure.

#### Scenario: Platform-managed stage
- **WHEN** a framework has no native operation for an obligation and the workflow supplies a stage with origin `platform-managed` for it
- **THEN** the stage covers that obligation and remains distinguishable from a native stage

#### Scenario: Unknown obligation
- **WHEN** a stage lists an obligation that is not one of the six
- **THEN** parsing fails with code `invalid`

### Requirement: Versioned workflow definition
A workflow definition SHALL be identified by a workflow identifier and a workflow version, both opaque identifiers, and SHALL consist of one or more stages, each with a stage identifier, one or more distinct obligations, an origin, and a list of stage identifiers it depends on. A parsed definition SHALL be deeply immutable and SHALL NOT share mutable state with its input.

#### Scenario: Stage combining obligations
- **WHEN** a stage lists several distinct obligations
- **THEN** the stage covers each of them

#### Scenario: Input changed after parsing
- **WHEN** the caller changes an input array after a definition was parsed
- **THEN** the parsed definition is unchanged

### Requirement: Stage graph validation
Parsing a workflow definition SHALL fail with an `invalid` failure when the definition has no stage, a stage identifier occurs twice, a stage depends on itself, on the same stage twice, or on an unknown stage, the dependencies form a cycle, or some lifecycle obligation is covered by no stage.

#### Scenario: Dependency cycle
- **WHEN** the dependencies of two or more stages form a cycle
- **THEN** parsing fails and the message names the stages on the cycle

#### Scenario: Long dependency chain
- **WHEN** an acyclic definition has a dependency chain of 20,000 stages
- **THEN** parsing returns a result instead of throwing

#### Scenario: Unknown dependency
- **WHEN** a stage depends on a stage identifier that the definition does not contain
- **THEN** parsing fails and the details name the stage and the unknown dependency

#### Scenario: Uncovered obligation
- **WHEN** no stage covers one or more lifecycle obligations
- **THEN** parsing fails and names every uncovered obligation

### Requirement: Field-specific failures
Every failure returned by the composite constructors of the workflow definition, the workflow run binding, the work item, and the artifact revision SHALL have code `invalid`, a `field` detail naming the input path, such as `stages[1].dependsOn`, and a message that starts with that path. The single-value parsers they use return an `invalid` failure without a field, which the composite constructor adds.

#### Scenario: Invalid stage field
- **WHEN** the second stage has an empty dependency identifier
- **THEN** the failure's `field` detail is `stages[1].dependsOn`

### Requirement: Workflow run binding
A workflow run binding SHALL record the plugin identifier and version, the upstream tool version, the workflow identifier, version, and content digest, the configuration revision, and the policy revision, SHALL reject an invalid value in any of these fields, and SHALL be immutable once parsed.

#### Scenario: Complete binding
- **WHEN** every binding field holds a valid value
- **THEN** parsing returns a frozen binding with exactly those values

#### Scenario: Invalid digest
- **WHEN** the workflow digest is not `sha256:` followed by 64 lowercase hexadecimal characters
- **THEN** parsing fails and names the field `workflowDigest`

### Requirement: Work-item identity
A work item SHALL pair a stable platform work-item identifier with the framework plugin's native reference, which may contain spaces and non-ASCII text but no character of the Unicode category `Cc` (C0 controls, DEL, and C1 controls) and has at most 1024 UTF-16 code units.

#### Scenario: Native reference with spaces
- **WHEN** the native reference is a path containing spaces
- **THEN** the work item is accepted with that reference unchanged

### Requirement: Artifact revision
An artifact revision SHALL record an artifact identifier, the content digest, and a native reference to where the content was read, and two revisions SHALL be the same revision exactly when their artifact identifiers and digests are equal.

#### Scenario: Same content read elsewhere
- **WHEN** two revisions have the same artifact identifier and digest but different native references
- **THEN** they are the same revision

#### Scenario: Changed content
- **WHEN** two revisions of the same artifact have different digests
- **THEN** they are different revisions
