## Why

The owner decided on 2026-11-02 that Antigravity CLI
(gemini-4-argon-medium) at effort `medium`, key
`agy gemini-4-argon-medium#medium`, reviews pass 3 (role A) instead of
Codex CLI (gpt-6.1-sol). Argon has network access, so it also reviews
pass 3 of a task that needs network access, instead of Claude Code
(claude-fable-5-1). Passes 1 and 2 stay as they are. Governance policy
version 9, the protocol, the skills, and rule version 3 of the route still
name sol, or fable for a networked task, for pass 3.

## What Changes

- **Governance.** Policy version 10: the reviewer assignment table names
  Antigravity CLI (gemini-4-argon-medium) for pass 3, also of a task that
  needs network access, and Claude Code (claude-fable-5-1) only for pass 1
  of such a task; the shared-harness exception of a network task now
  concerns only passes 1 and 2. The authorized reviewer entries of
  Antigravity CLI and Codex CLI (gpt-6.1-sol), "Review sequence",
  "Routed effort", and a new "Tasks during the change to version 10"
  follow. The decision applies from 2026-11-02 to every task whose pass 3
  had not started, before version 10 reaches `dev`. Codex CLI
  (gpt-6.1-sol) stays an authorized reviewer for the rotation and
  replacements.
- **Route.** Rule version 4 plans pass 3 with Antigravity CLI
  (gemini-4-argon-medium) as reviewer and networked reviewer, efforts
  `medium` standard and `medium` elevated; the thresholds stay. Rule
  versions 1 to 3 keep their tables, so archived records stay valid.
- **Make review.** It names policy version 10 in its effort note.
- **Docs.** `AGENTS.md`, `docs/agent-task-protocol.md`, and the skills
  `taskelith-task-protocol` and `taskelith-coordinator` state the same
  assignment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-process`: "Reviewer assignment" and "Rule routing floor"
  modified.

## Impact

- `docs/governance.md`, `docs/agent-task-protocol.md`, `AGENTS.md`, the
  two skills under `.claude/skills/`, `scripts/review-route.ts`,
  `scripts/review-run.ts`, `scripts/reviewer-invocations.ts` (a comment),
  and their tests.
- No reviewer invocation is added: `agy gemini-4-argon-medium#medium`
  exists, and the `elevated` efforts stay unauthorized.
- Out of scope: any other reviewer, effort, pause, or process rule.
