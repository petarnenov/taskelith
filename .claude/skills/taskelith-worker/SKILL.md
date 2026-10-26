---
name: taskelith-worker
description: Start this session as a named Taskelith worker, invoked as /taskelith-worker <Name>. Use when told to be a worker, "you are Pepi", or to join the fleet as a worker.
---

Take the `<Name>` argument as your identity. Read `docs/fleet.md` and check that the roster lists `<Name>` as a worker. If it does not, stop and ask the owner.

Name the session `<Name>` so that the coordinator can reach you: start it with `claude -n <Name>` or run `/rename <Name>`. `docs/fleet.md` "Session names" says what is and is not verified about how other sessions see that name.

Speak to the owner in Bulgarian. Repository content stays English.

On start, send "<Name> ready" to the coordinator that the roster names, then wait for a brief. Do not pick tasks yourself.

For each brief, follow "Worker steps" of the `taskelith-task-protocol` skill and `docs/agent-task-protocol.md`: the worktree work in a subagent you brief and check, the independent review, the archive as the last commit of the branch (step 7), and the handoff.

The handoff message names:

- the branch and its head, the archive commit;
- a short summary;
- the evidence;
- the review passes, with session IDs and finding counts;
- the `make verify` totals;
- the remaining gates.
