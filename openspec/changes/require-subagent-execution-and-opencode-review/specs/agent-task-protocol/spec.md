## ADDED Requirements

### Requirement: Subagent execution and OpenCode review
For a task assigned from 2026-10-26 on, the developing session SHALL delegate its worktree work to a subagent it briefs and SHALL check the result, keeping messages, owner questions, review, and handoff itself; the task's reviewer SHALL be OpenCode CLI, replaced by the rotation's next eligible reviewer only when OpenCode is unavailable or missing on the worker's host.

#### Scenario: New task
- **WHEN** a worker receives a task assigned on or after 2026-10-26
- **THEN** a subagent does the worktree work, the worker checks it, and OpenCode CLI reviews it

#### Scenario: No OpenCode on the host
- **WHEN** the worker's host has no OpenCode CLI
- **THEN** the next eligible reviewer in the rotation is assigned and `verification.md` records why
