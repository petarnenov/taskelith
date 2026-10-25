## Why

On 2026-10-25 the owner set a rule for this project, paraphrased here: when a session's context approaches 150,000 tokens, the session tells the owner and recommends `/compact` or `/clear`. The owner first set it for the coordinator and then extended it to the workers and the protocol skill.

## What Changes

- `docs/agent-task-protocol.md`: a "Context size" section that applies the rule to the coordinator and the workers.
- `.claude/skills/taskelith-task-protocol/SKILL.md`: a paragraph with the rule.
- `AGENTS.md`: one sentence that points to the rule.
- A spec delta adds the requirement to `agent-task-protocol`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-task-protocol`: adds the context size warning.

## Impact

Documentation and the agent skill only. No product behavior changes.
