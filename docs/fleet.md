# Agent fleet

Status: the roster of named agent sessions that develop Taskelith and the rules around it, set by the owner on 2026-10-27. The [agent task protocol](agent-task-protocol.md) defines what the coordinator and the workers do; this page says who they are and how the owner changes the coordinator.

## Roster

| Name | Role | Machine | Notes |
| --- | --- | --- | --- |
| Niki | Coordinator | The owner's 2020 Intel iMac (macOS x86_64) | |
| Pepi | Worker | The same iMac | |
| Desi | Worker | The same iMac | Owner rule: every UI-related task goes to Desi. |
| Zaki | Worker | Another machine (Linux) | |
| Liki | Worker | Another machine (Linux) | |

## Rules

- **Names are addresses.** Sessions message each other by these names. When two sessions share a name, for example Pepi or Desi, message the one on the coordinator's machine.
- **One coordinator.** Exactly one session is the coordinator at a time: the one the roster names.
- **Sessions persist.** A worker keeps its session across tasks: the owner does not `/clear` it after each integration, and the coordinator briefs it right after the landing report (owner, 2026-10-27).
- **Skills.** A session starts as the coordinator with `/taskelith-coordinator <Name>` and as a worker with `/taskelith-worker <Name>`. Both skills live in `.claude/skills/` and check the name against this roster.

## Session names

Claude Code can name a session in two ways, checked on 2026-10-27 with Claude Code 2.1.311:

- `claude -n <Name>` (or `--name <Name>`) at start. `claude --help` describes it as a display name for the session, shown in the prompt box, the `/resume` picker, and the terminal title.
- `/rename <Name>` in a running session, a built-in command described as "Rename the current conversation".

The description of Claude Code's `SendMessage` tool says that it addresses a session by the name that `ListAgents` shows. Neither description above states that this display name is the name other sessions see in `ListAgents`, and that was not verified. So after naming a session, check from another session with `ListAgents` that the name appears, and tell the owner if it does not.

## Changing the coordinator

1. The owner edits the roster.
2. The outgoing coordinator waits for running integrations to finish and writes a handover note covering:
   - the workers and their tasks;
   - branches waiting for integration;
   - pending messages and the pings it owes;
   - close-out deferrals;
   - decisions not yet reported to the owner.

   The note and the coordinator's working scripts are not repository content, so they go outside the repository, wherever the owner keeps them. The owner or the outgoing coordinator tells the new coordinator where the note is.
3. The new coordinator starts with `/taskelith-coordinator <Name>`, reads the note before anything else, and broadcasts its name to every worker.

A worker that becomes the coordinator first hands off its task or passes it on to another worker.
