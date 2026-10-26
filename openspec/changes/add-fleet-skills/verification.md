# Verification: add-fleet-skills

## Scope and source

On 2026-10-27 the owner asked, in Bulgarian and paraphrased here, for named fleet skills so that any session can start as a named coordinator or worker and the sessions are easy to tell apart. During the task the coordinator added Liki to the roster. The coordinator (Niki) develops the task itself. It delegated the worktree work and this record to a subagent it briefed with the roster, the skill contents, and the reviewer, and it also told that subagent to run the review passes. That departs from "Subagent execution" in `docs/agent-task-protocol.md`, under which the session runs the review; it is recorded under Limitations, and the coordinator checks the record before it integrates. Base revision: `1416167a` on `dev`.

## Environment

macOS on x86_64, Node.js from `.nvmrc`, Claude Code 2.1.311.

## Author self-check before review

- The roster contains only the names, roles, and machine facts the owner gave; no other hardware detail is added.
- The skills check the name against the roster and point to the protocol for its steps. They keep two details the owner's request names: the items of the worker's handoff message and one integration at a time on a machine.
- Session naming: `claude --help` lists `-n, --name <name>` ("Set a display name for this session (shown in the prompt box, /resume picker, and terminal title)"), and the Claude Code binary contains the built-in `/rename` command ("Rename the current conversation"). That this name is the one `ListAgents` shows was not verified, and the documents say so.
- `AGENTS.md` does not list the skills, so it is unchanged.
- The spec requirement is 365 characters. All content is English.

## Evidence check

The change adds no external link. Its external facts are the Claude Code help text and the `/rename` description above, read locally from Claude Code 2.1.311, and the description of Claude Code's `SendMessage` tool, read in the developing session, which says that a session is addressed by the name `ListAgents` shows.

## Checks

- `npm run openspec -- validate add-fleet-skills --strict`: passed ("Change 'add-fleet-skills' is valid") on `b8ee1595`, before review pass 1, and on `a8e73db3`, after the pass 1 fixes.
- `make verify`: passed (exit 0) on `b8ee1595` and on `a8e73db3`: 1951 tests, 1949 passed, 0 failed, 2 skipped; coverage of all files 99.29% lines, 92.11% (on `a8e73db3` 92.10%) branches, 99.04% functions; OpenSpec validation 70 passed, 0 failed; comment length, archive dry run, and package checks passed.

## Independent review

Reviewer: OpenCode CLI (kimi-k3.1-pro), assigned by the coordinator. Invocation:

```sh
opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k3.1-pro#high' --format json --title add-fleet-skills "$(cat <prompt-file>)" < /dev/null > <log>
```

The reviewer wrote its reports in Bulgarian; the findings are paraphrased here in English.

### Pass 1

Session `ses_e8599f351ffeEtaPI8fvibYj4H`, revision `b8ee1595`. Model confirmation from the stored assistant messages of the session: provider `opencode-go`, model `kimi-k3.1-pro`, variant `high`, agent `reviewer`. The `opencode run` process exited with status 1 after the report was complete. The SHA-256 snapshot of the worktree before and after the review was equal: `6a9c89d8da533dee1ca4f3d0fa3aaa4ced846bd431a8f7824d3b5d6c4eda3c7a`. Findings: Critical 0, High 1, Medium 1, Low 5.

- High: this record said that the review runs were delegated to the subagent, which contradicts "Subagent execution", where the session keeps the review. Resolution: the record states that the coordinator told the subagent to run the passes, names the departure, and lists it under Limitations; the coordinator decides on it before integration.
- Medium: the coordinator skill read the handover note only "if the owner gives" one, although a coordinator change requires it. Resolution: on a takeover the new coordinator reads the note first and, if it cannot find it, stops and asks the owner.
- Low: the handover note's location and how the new coordinator finds it were not stated. Resolution: `docs/fleet.md` puts the note outside the repository with the scripts and has the owner or the outgoing coordinator say where it is.
- Low: the coordinator skill said that naming the session lets workers reach it, and weakened the `ListAgents` check to "when you can". Resolution: the skill sets the display name, says that this alone proves nothing, and requires the check and a report to the owner.
- Low: the worker skill made the same claim and lacked the check. Resolution: the same wording as the coordinator skill.
- Low: the skills repeat protocol detail (the handoff items and one integration at a time). Resolution: kept, because the owner's request names both; `design.md` decision 5 says so, and the self-check no longer claims that the skills repeat nothing.
- Low: the evidence check omitted the source of the `SendMessage` and `ListAgents` addressing statement. Resolution: the evidence check and `docs/fleet.md` name the `SendMessage` tool description as its source.

## Limitations

- The review passes were run by the subagent on the coordinator's instruction, not by the coordinator's session, as Scope and source states.
- Whether the Claude Code display name set by `--name` or `/rename` is the name other sessions see in `ListAgents` was not verified.

## Remaining gates

- Integration into dev by the coordinator (single pull request)
