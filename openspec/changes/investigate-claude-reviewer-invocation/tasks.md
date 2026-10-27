## 1. Investigate

- [x] 1.1 Isolate the cause of "No messages returned from query", varying one factor per run.
- [x] 1.2 Find a read-only invocation that works and keeps the model, effort, JSON evidence, and closed stdin.

## 2. Document

- [x] 2.1 Update the two Claude Code rows of "Reviewer invocations" in `docs/agent-task-protocol.md`.
- [x] 2.2 Check that no other tracked file documents the invocation.

## 3. Verify

- [x] 3.1 Run `npm run openspec -- validate investigate-claude-reviewer-invocation --strict` and `make verify`.
- [x] 3.2 Independent review and record it in `verification.md`.

## 4. Archive

- [ ] 4.1 Archive the change after the review.
