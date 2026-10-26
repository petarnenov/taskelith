## Why

On 2026-10-27 the owner asked, paraphrased here, for named fleet skills: the owner wants to start any session as a named coordinator or worker and to tell the sessions apart easily. Until now the session names, their roles, and their machines lived only in the sessions' notes, and nothing described how the owner hands the coordinator role to another session.

## What Changes

- `docs/fleet.md`: the roster (name, role, machine, notes), the rules that names are addresses and that there is exactly one coordinator, how a Claude Code session gets its name, and the owner's procedure to change the coordinator with a handover note.
- `.claude/skills/taskelith-coordinator/SKILL.md`: `/taskelith-coordinator <Name>`, which checks the name against the roster, checks open branches and worktrees, and announces the coordinator to every worker.
- `.claude/skills/taskelith-worker/SKILL.md`: `/taskelith-worker <Name>`, which checks the name, reports ready to the coordinator, waits for a brief, and lists what the handoff names.
- `docs/agent-task-protocol.md`: one line linking the roster.
- A spec delta adds the requirement "Named fleet roles" to `agent-task-protocol`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-task-protocol`: adds named fleet roles.

## Impact

Documentation and agent skills only. No product behavior changes. `AGENTS.md` does not list the skills, so it is unchanged.
