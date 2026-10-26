## Why

On 2026-10-26 the owner set a mandatory rule, paraphrased here: when an agent receives a task, it carries it out in a subagent. The owner set it after asking why Claude sessions delegate work to subagents, and the coordinator explained that a subagent keeps the session's context small. The owner asked for this rule change to be reviewed by OpenCode.

## What Changes

- `docs/agent-task-protocol.md`: a "Subagent execution" section.
- `.claude/skills/taskelith-task-protocol/SKILL.md` and `AGENTS.md`: the rule in short.
- A spec delta adds the requirement to `agent-task-protocol`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-task-protocol`: adds subagent execution.

## Impact

Documentation and the agent skill only. No product behavior changes. Reviewer assignment is unchanged.
