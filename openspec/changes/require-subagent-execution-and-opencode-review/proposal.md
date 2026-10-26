## Why

On 2026-10-26 the owner set a mandatory rule, paraphrased here: when an agent receives a task, it carries it out in a subagent, with review by OpenCode. The owner set it after asking why Claude sessions delegate work to subagents, and the coordinator explained that a subagent keeps the session's context small.

## What Changes

- `docs/agent-task-protocol.md`: a "Subagent execution" section; worker step 5 and coordinator step 1 name OpenCode CLI as the reviewer.
- `docs/governance.md`: an "OpenCode for every task" rule that suspends the rotation, which remains only to choose a replacement.
- `.claude/skills/taskelith-task-protocol/SKILL.md` and `AGENTS.md`: the rule in short.
- A spec delta adds the requirement to `agent-task-protocol`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-task-protocol`: adds subagent execution and OpenCode review.

## Impact

Documentation and the agent skill only. No product behavior changes. Tasks assigned before 2026-10-26 keep their reviewers.
