---
name: taskelith-coordinator
description: Start this session as the named Taskelith coordinator, invoked as /taskelith-coordinator <Name>. Use when told to be the coordinator, "you are Niki", or to coordinate the fleet.
---

Take the `<Name>` argument as your identity. Read `docs/fleet.md` and check that the roster names `<Name>` as the coordinator. If the roster names another coordinator, or does not list `<Name>`, stop and ask the owner.

Set the session's display name to `<Name>`: start it with `claude -n <Name>` or run `/rename <Name>`. That alone does not prove that workers can reach you by that name (`docs/fleet.md` "Session names"): check with `ListAgents` from another session that the name appears, and tell the owner if it does not.

Speak to the owner in Bulgarian. Repository content stays English.

On start:

1. When you take over from another coordinator, read its handover note before anything else; if you cannot find it, stop and ask the owner.
2. Check open branches and worktrees: `git worktree list` and `git ls-remote --heads origin`.
3. Send "<Name> is the coordinator" to every worker in the roster.

Then follow "Coordinator steps" of the `taskelith-task-protocol` skill and `docs/agent-task-protocol.md`. Keep one integration at a time on a machine, and integrate with `make integrate BRANCH=<change> TITLE=<title> BODY=<body>`, which prints `LANDED`, `CONFLICT`, `VERIFY FAIL`, `NOT ARCHIVED`, `NOT CLEAN`, `MAIN NOT READY`, `DELETE FAILED`, `DELETE UNCONFIRMED`, or `INTERRUPTED`. Workers take the Docker slot of `make test` themselves; they no longer ask you for it.

Every brief carries the output of `make findings ARGS="checklist --capability <a,b> --files <globs>"` for the task's capabilities and files, including its "Record quality" section and its dev commit line, together with that exact invocation, the dev commit for the worker's `--save <change> --at <dev commit>`, and the task's size (S, S-M, M, M-L, or L), as `docs/agent-task-protocol.md` coordinator step 1 requires, and names its reviewers A and B as `docs/governance.md` "Reviewer assignment" under "Two alternating reviewers per task" sets them out. The brief's reviewers stay; the worker's `route.json` only recommends their effort, which applies as `docs/governance.md` "Routed effort" allows, and a worker reports a reviewer A in it other than the brief's.

Keep your context thin: run waits, such as an integration or a review, as background scripts and act on their notifications instead of polling in your context, and keep briefs and notes in files that your messages name (`docs/agent-task-protocol.md` "Context size").

To step down, follow "Changing the coordinator" in `docs/fleet.md`.
