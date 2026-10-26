---
name: taskelith-task-protocol
description: The Taskelith agent task protocol for coordinator and worker sessions. Use when starting, reviewing, handing off, assigning, or integrating a Taskelith task, or when told to continue Taskelith work.
---

Read `docs/agent-task-protocol.md` in this repository and follow it step by step for your role:

- As a **worker**, follow "Worker steps" from the worktree through the archive of your change on its own branch to the handoff, then stop and wait for the coordinator; after it reports the merge, clean up and clear your context.
- As the **coordinator**, follow "Coordinator steps" to assign, integrate each archived change with one pull request, clean up, and release workers; a branch that conflicts with `dev`, whose evidence the merge invalidates, or that lacks its archive commit goes back to its worker. On any return, the worker restores the active change by reverting its archive commit, merges `dev`, reconciles each restored delta with `dev`'s current requirement text, keeping others' edits, has the assigned reviewer review the resolved diff and the reconciliation, records it, and archives again as the last commit.

The protocol builds on `AGENTS.md`, `docs/governance.md`, and `docs/releases.md`; read them when the protocol points to them. Never skip the OpenSpec change, `make verify`, or the independent review, and send owner decisions to the coordinator (or, as coordinator, to the owner) with options instead of deciding them.

Since 2026-10-26 (owner rule), develop each task's worktree work in a subagent that you brief and whose result you check; keep messages, owner questions, the review, and the handoff in your own session. `docs/agent-task-protocol.md` "Subagent execution" has the details.

If a review attempt does not run to a report for any reason, do not use that reviewer for any task for 30 minutes. Propose the next reviewer in the rotation that is not paused and meets the task's review requirements (a worker proposes it to the coordinator, who assigns it; a coordinator that develops the task itself chooses it and records why), as `docs/governance.md` "Unavailable reviewer" sets out. Reviewer invocations, one per reviewer (a harness may have several reviewers, named by their models), and current pauses are in `docs/agent-task-protocol.md`.

When your context approaches 150,000 tokens, record what a reset would lose, tell the owner, and recommend `/compact` or `/clear` (only `/compact` in the middle of a task); a worker also tells the coordinator. `docs/agent-task-protocol.md` "Context size" has the details.
