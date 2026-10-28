## Why

The owner decided on 2026-10-28 to keep the context warning near 150,000 tokens and the advice to run `/compact` or `/clear`, but that a session which warns does not stop to wait for them. The protocol's worker bullet, where the coordinator sends a warning worker no work until it reports that it is ready again, reads as a pause until the owner resets the session.

## What Changes

- `docs/agent-task-protocol.md` "Context size": after the warning the session continues its work without waiting; a worker tells the coordinator and keeps its task going, and the hold on new work is removed.
- `AGENTS.md`, the `taskelith-task-protocol` skill, and the `taskelith-coordinator` skill say that the session continues without waiting.
- The spec delta modifies "Context size warning" to match.

Out of scope: the warning hook `scripts/context-warning.ts`, its 140,000-token threshold, and its message, which tells no session to stop or wait; any automatic compaction setting.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-task-protocol`: "Context size warning" adds that the session continues without waiting.

## Impact

Documentation and agent instructions only: `docs/agent-task-protocol.md`, `AGENTS.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, and `.claude/skills/taskelith-coordinator/SKILL.md`. No code, test, or published package changes.
