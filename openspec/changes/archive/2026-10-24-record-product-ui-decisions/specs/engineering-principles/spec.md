## REMOVED Requirements

### Requirement: Mandatory OpenSpec for Taskelith development
**Reason**: The owner decided on 2026-10-24 that Taskelith's own development may select its SDLC framework like any project, with OpenSpec as the default (ADR 0008 decision 1).
**Migration**: Replaced by "SDLC framework binding with OpenSpec as default". Existing OpenSpec work keeps its binding, and this repository keeps using OpenSpec until another framework's pinned tooling is admitted.

## ADDED Requirements

### Requirement: SDLC framework binding with OpenSpec as default
Every task that develops Taskelith SHALL be bound to a change of the project's selected spec-driven framework, without exception; OpenSpec SHALL be the default framework, and every project, Taskelith included, SHALL be able to select another supported framework through replaceable SDLC plugins.

#### Scenario: Task without a change
- **WHEN** a task changes the Taskelith repository
- **THEN** a change of the selected framework records its scope, verification, and review before integration

#### Scenario: Default framework
- **WHEN** no other framework has been selected for a project
- **THEN** its tasks are bound to OpenSpec changes

#### Scenario: Another framework selected
- **WHEN** a project-maintainer selects SpecKit or another supported framework for a project
- **THEN** new tasks bind to that framework through its plugin, and running work keeps its existing binding

#### Scenario: Framework tooling not admitted
- **WHEN** another framework is selected for this repository before its pinned tooling is admitted through the dependency policy
- **THEN** the selection is not applied and tasks keep binding to OpenSpec
