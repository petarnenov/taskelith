# openspec-framework-adapter Specification

## Purpose
The OpenSpec plugin that implements the SDLC framework port by spawning the pinned OpenSpec CLI, reading its JSON output, and normalizing it as the shared OpenSpec mapping fixtures define.

## Requirements

### Requirement: Port through the pinned CLI
The OpenSpec plugin SHALL implement every SDLC framework port operation by spawning the pinned OpenSpec CLI with telemetry disabled and reading its JSON output, and SHALL fail every operation with `unavailable` when the CLI cannot run or is not the pinned version.

#### Scenario: Conformance on the fixtures
- **WHEN** the conformance suite runs the OpenSpec mapping cases against the plugin on a copy of the fixture working copy
- **THEN** it reports no findings

#### Scenario: Unpinned CLI
- **WHEN** the CLI reports a version other than the pinned one
- **THEN** the operation fails with `unavailable`

### Requirement: Registration through the plugin SDK
The OpenSpec plugin SHALL be created only after its manifest is admitted through the plugin SDK's registration for the `SdlcFramework` port.

#### Scenario: Host without the port
- **WHEN** a host that does not offer the `SdlcFramework` port registers the plugin
- **THEN** registration fails with `not-found` and no framework is created

### Requirement: Working copy safety
The OpenSpec plugin SHALL act only on a working copy that is itself the OpenSpec root, SHALL validate only a subject that is the current revision set, and SHALL report a refused archive as `precondition-failed`.

#### Scenario: Directory inside a project
- **WHEN** the working copy is a directory inside an OpenSpec project
- **THEN** the operation fails with `not-found`

#### Scenario: Stale validation subject
- **WHEN** structural validation is requested for revisions that differ from the change's current revisions
- **THEN** it fails with `conflict`
