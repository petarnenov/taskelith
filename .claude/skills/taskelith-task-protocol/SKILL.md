---
name: taskelith-task-protocol
description: The Taskelith agent task protocol for coordinator and worker sessions. Use when starting, reviewing, handing off, assigning, or integrating a Taskelith task, or when told to continue Taskelith work.
---

Read `docs/agent-task-protocol.md` in this repository and follow it step by step for your role:

- As a **worker**, follow "Worker steps" from the worktree to the handoff, then stop and wait for the coordinator; after it reports the merge, clean up and clear your context.
- As the **coordinator**, follow "Coordinator steps" to assign, integrate, archive, clean up, and release workers.

The protocol builds on `AGENTS.md`, `docs/governance.md`, and `docs/releases.md`; read them when the protocol points to them. Never skip the OpenSpec change, `make verify`, or the independent review, and send owner decisions to the coordinator (or, as coordinator, to the owner) with options instead of deciding them.

If a review attempt does not run to a report for any reason, do not retry that reviewer for 30 minutes. Propose the next reviewer in the rotation that meets the task's review requirements (a worker proposes it to the coordinator, who assigns it), as `docs/governance.md` "Unavailable reviewer" sets out. Reviewer invocations, OpenCode included, and current pauses are in `docs/agent-task-protocol.md`.
