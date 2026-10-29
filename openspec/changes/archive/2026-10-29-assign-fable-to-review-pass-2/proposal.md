## Why

The owner decided on 2026-10-29 that Claude Code (claude-fable-5-1) at
effort `medium` reviews pass 2 (role B) instead of Claude Code
(claude-opus-5-5). Passes 1 and 3 stay Codex CLI (gpt-6-astra) and Codex
CLI (gpt-6.1-sol). A task that needs network access keeps Claude Code
(claude-fable-5-1) for passes 1 and 3 and Claude Code (claude-opus-5-5)
for pass 2, so that the model of pass 2 differs from that of the adjacent
passes; Codex has no network access. Governance policy version 8, the
protocol, the skills, and rule version 2 of the route still name opus for
pass 2.

## What Changes

- **Governance.** Policy version 9: the reviewer assignment table names
  Claude Code (claude-fable-5-1) for pass 2 and adds a row with Claude Code
  (claude-opus-5-5) for pass 2 of a task that needs network access; the
  authorized reviewer entries, "Routed effort", and a new "Tasks during the
  change to version 9" follow. The decision applies from 2026-10-29 to
  every task whose pass 2 had not started, before version 9 reaches `dev`.
- **Route.** Rule version 3 plans pass 2 with Claude Code
  (claude-fable-5-1), networked reviewer Claude Code (claude-opus-5-5),
  efforts `medium` standard and `high` elevated; the thresholds stay.
  Rule versions 1 and 2 keep their tables, so archived records stay valid.
- **Make review.** It names policy version 9 in its effort note.
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
- No reviewer invocation is added: `claude claude-fable-5-1#medium`
  exists, and the `elevated` efforts stay unauthorized.
- Out of scope: any other reviewer, effort, or process rule.
