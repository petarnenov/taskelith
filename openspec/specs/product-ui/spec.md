# product-ui Specification

## Purpose
Define the web product's information architecture and interaction rules decided by the owner on 2026-10-24 (ADR 0008), for implementation from G3 onwards.

## Requirements

### Requirement: Project board as landing page
The SPA's landing page SHALL be a per-project board whose columns are governance's lifecycle stages under short labels, Propose (Propose and inspect), Specify (Specify and design), Implement, Verify, Review, and Archived (Close), with Accept and integrate shown as the merge gate between Review and Archived.

#### Scenario: Native and platform-managed steps
- **WHEN** a card is shown in a column
- **THEN** it names its framework's native step for that stage, or "platform-managed" where the framework mapping records a gap

#### Scenario: Merge
- **WHEN** a change merges
- **THEN** its card moves to Archived, the change is closed, and its agent session is stopped

### Requirement: Task detail
The task detail SHALL show each lifecycle stage with its gate state (pending, passed, failed, stale, or blocked), the reason a blocked or waiting task does not move, requirement traceability with evidence freshness, the run binding, and the admission.

#### Scenario: Stale evidence
- **WHEN** a new head or artifact revision invalidates earlier evidence
- **THEN** the affected gates are shown as stale until they pass again

### Requirement: Board states
The board SHALL define first run, empty, loading, load error, live updates lost, no workers online, and read-only states.

#### Scenario: Load error
- **WHEN** the control plane cannot be reached
- **THEN** the board shows no task data rather than data that may be wrong, and offers a retry

#### Scenario: Live updates lost
- **WHEN** the event stream is interrupted
- **THEN** the board shows the time of its last known state, and the server rechecks every action before applying it

#### Scenario: First run
- **WHEN** no project exists yet
- **THEN** the board guides the user through setup instead of showing an empty board

### Requirement: Needs you inbox
Every item that waits on a person SHALL appear in one "Needs you" inbox, and resolving it SHALL update every screen.

#### Scenario: Native approval resolved
- **WHEN** a maintainer answers a native approval request in the inbox
- **THEN** the request disappears from the inbox and from the board's counts on every screen

### Requirement: Task intake with defaults and write-back
A task SHALL be creatable from a description or imported from a Jira issue, a GitHub issue, a Confluence page, a text file, or another link, with its type, framework, implementer, reviewer, and spec approver prefilled with changeable defaults; progress and the pull request link SHALL be written back to the source, the source SHALL be resolved on merge, and feedback at the source SHALL become lesson feedback.

#### Scenario: Import with defaults
- **WHEN** a user imports a task without changing the defaults
- **THEN** the task is created with the project's default framework (OpenSpec unless another is selected) and the default implementer and reviewer

### Requirement: Product screens
Besides the board, the SPA SHALL provide an agent session screen whose composer stays visible, and screens for reviews, workers and account pools, new tasks, knowledge, the "Needs you" inbox, SCM integrations, and plugins.

#### Scenario: Long session output
- **WHEN** an agent session's output is longer than the screen
- **THEN** the composer and its send action stay visible

### Requirement: Delegated spec approval
Spec approval SHALL be delegable to an independent reviewer by maintainer policy, and a task SHALL be able to require a maintainer's approval instead.

#### Scenario: Task requires a maintainer
- **WHEN** a task is created with spec approval set to a maintainer
- **THEN** its spec gate waits for a project-maintainer even though the project delegates spec approval to reviewers

### Requirement: Design rules
The SPA SHALL use the dark theme by default and support a light theme, be responsive down to phone width, give interactive targets at least 44 px, and keep text contrast at least 4.5:1 in both themes.

#### Scenario: Phone width
- **WHEN** the SPA is shown at phone width
- **THEN** no page scrolls horizontally except deliberate board columns, and navigation stays reachable

### Requirement: New capabilities as plugins
Intake sources and write-back, notifications, the inbox's sources, and worker admission checks SHALL be delivered behind microkernel ports as plugins or adapters, with their port contracts defined in the gate that first implements them.

#### Scenario: New intake source
- **WHEN** a new intake source is added
- **THEN** it is a plugin implementing the intake port, without kernel changes

### Requirement: Automatic worker admission
A worker enrolled with a one-time token SHALL be admitted automatically once its self-check passes.

#### Scenario: Self-check fails
- **WHEN** a newly enrolled worker's self-check fails
- **THEN** it is not admitted and the failed checks are shown on the workers screen
