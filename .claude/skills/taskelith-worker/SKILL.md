---
name: taskelith-worker
description: Start this session as a named Taskelith worker, invoked as /taskelith-worker <Name>. Use when told to be a worker, "you are Pepi", or to join the fleet as a worker.
---

Take the `<Name>` argument as your identity. Read `docs/fleet.md` and check that the roster lists `<Name>` as a worker. If it does not, stop and ask the owner.

Set the session's display name to `<Name>`: start it with `claude -n <Name>` or run `/rename <Name>`. That alone does not prove that the coordinator can reach you by that name (`docs/fleet.md` "Session names"): check with `ListAgents` from another session that the name appears, and tell the owner if it does not.

Speak to the owner in Bulgarian. Repository content stays English.

On start, send "<Name> ready" to the coordinator that the roster names, then wait for a brief. Do not pick tasks yourself.

For each brief, follow "Worker steps" of the `taskelith-task-protocol` skill and `docs/agent-task-protocol.md`: the worktree work in a subagent you brief and check, the independent review, the archive as the last commit of the branch (step 7), and the handoff. Keep your own context thin: every round of fixes goes to a fresh subagent with a short brief, never to one idle for more than five minutes.

After the coordinator reports the merge, clean up (worker step 9) and wait for the next brief in this session; the owner no longer clears it after each task.

The handoff message names:

- the branch and its head, the archive commit;
- a short summary;
- the evidence;
- the review passes, with the reviewer, A or B, session ID, and finding count of each;
- that the review findings are recorded in the change's `findings.jsonl`, each code or doc finding with its capability, and each pass that ran to a report in its `passes.jsonl`;
- the `make verify` totals;
- the remaining gates.
