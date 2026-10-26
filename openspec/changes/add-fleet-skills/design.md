## Context

The protocol already defines the coordinator and worker roles, and the `taskelith-task-protocol` skill points to it. The sessions already use names (Niki, Pepi, Desi, Maki, Zaki) as message addresses, but the names were recorded nowhere in the repository.

## Decisions

1. **Roster in the repository.** `docs/fleet.md` holds the roster and its rules, so that a fresh session finds them without another session's notes. It records only the hardware facts the owner gave.
2. **Thin skills.** The two new skills set the identity and the start-up actions and point to the protocol for the steps, so the steps live in one place.
3. **Session naming stated honestly.** `claude --help` documents `-n, --name` as a display name, and Claude Code has a built-in `/rename` command. Neither says that this name is what `ListAgents` shows to other sessions, and that was not verified, so the documents say so and ask the session to check with `ListAgents`.
4. **Handover outside the repository.** The coordinator's handover note and working scripts are session state, not repository content, so they go wherever the owner keeps them.

## Risks

If the display name turns out not to be the `ListAgents` name, the documented naming step does not make a session reachable by name; the check with `ListAgents` exposes that.
