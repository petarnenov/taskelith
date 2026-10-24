## Why

On 2026-10-24 the owner set rules for parallel agent sessions: the coordinator assigns tasks to worker sessions without being asked, integrates and archives finished work into `dev` without a separate approval, and tells workers to clear their context after a merge; UI tasks go to the session that holds the UI proof of concept. These rules and the exact reviewer invocations lived only in one session's private notes and messages. The owner asked for the protocol to be recorded so that it survives across sessions.

## What Changes

- Add `docs/agent-task-protocol.md`: roles (owner, coordinator, worker), worker steps from worktree to handoff, cleanup, and conflict handling, coordinator steps from assignment to integration, archive, and cleanup, and the reviewer invocations with their confirmations. It builds on `docs/governance.md` and `docs/releases.md`, and they take precedence.
- Add a project skill `.claude/skills/taskelith-task-protocol/SKILL.md` that points Claude Code sessions to the protocol.
- Link the protocol from `AGENTS.md`, which every harness reads.
- Add the `agent-task-protocol` capability.

## Capabilities

### New Capabilities
- `agent-task-protocol`: a recorded protocol for coordinator and worker agent sessions, reachable from `AGENTS.md`.

### Modified Capabilities

None.

## Impact

Documentation and agent configuration only. No product code, `make verify`, or package change; the npm package does not include `.claude/`.
