## ADDED Requirements

### Requirement: Subagent task execution
For a task assigned from 2026-10-26 on, the developing session SHALL delegate its worktree work to a subagent it briefs and SHALL check the result before review and handoff; the session SHALL keep messages, owner questions, the independent review, and the handoff itself.

#### Scenario: New task
- **WHEN** a worker receives a task assigned on or after 2026-10-26
- **THEN** a subagent does the worktree work and the worker checks it before review

#### Scenario: Protocol steps
- **WHEN** the subagent's work is ready
- **THEN** the worker, not the subagent, runs the review and hands off to the coordinator
