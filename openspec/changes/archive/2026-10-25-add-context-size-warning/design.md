## Context

Agent sessions lose detail when their context grows large or when automatic compaction summarizes it without warning. Only the owner can run `/compact` or `/clear` in a session's window.

## Decisions

- The session warns before its context reaches 150,000 tokens, so that the owner can act in time.
- Before it warns, the session records what a reset would lose: a worker commits its work and notes its state in the change's `verification.md` or `tasks.md`, and the coordinator updates its own notes.
- `/compact` is recommended while unrecorded decisions or a task in progress exist; `/clear` otherwise. A worker in the middle of a task is not cleared, which keeps worker step 8 as the normal clearing point.
- A worker warns in its own window and tells the coordinator, so that the coordinator does not send it work during the reset.
