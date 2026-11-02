## Why

The owner corrected the reviewer assignment on 2026-11-02: a task that
needs network access has the same reviewers as every other task, pass 1
Codex CLI (gpt-6-astra), pass 2 Claude Code (claude-fable-5-1), and pass 3
Antigravity CLI (gemini-4-argon-medium), each at effort `medium`. The
networked reviewers of policy version 10, Claude Code (claude-fable-5-1)
for pass 1 and Claude Code (claude-opus-5-5) for pass 2, are withdrawn.
Governance, the protocol, the skills, the spec, and rule version 4 of the
route still name them.

## What Changes

- **Governance.** Policy version 11: the reviewer assignment table drops
  the two network rows, and the network task paragraph records the owner
  correction of 2026-11-02 and drops the shared-harness exception. Codex
  CLI (gpt-6-astra) has no network access in its configuration, so pass 1
  of such a task cannot check external facts; "External facts" names that
  exception, and a replacement in any pass still has network access. The
  authorized reviewer entries of astra, fable, and opus and a new "Tasks
  during the change to version 11" follow.
- **Route.** Rule version 5 plans a change with external facts as any
  other: `networkedReviewer` equals `reviewer` for every pass, efforts as
  in version 4; the thresholds stay. Rule versions 1 to 4 keep their
  tables, so archived records stay valid.
- **Make review.** It names policy version 11 in its effort note.
- **Docs.** `AGENTS.md`, `docs/agent-task-protocol.md`, and the skills
  `taskelith-task-protocol` and `taskelith-coordinator` state the same
  assignment. The expired rows of "Reviewer pauses" are removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-process`: "Authorized review sequence", "Reviewer assignment",
  and "Rule routing floor" modified.

## Impact

- `docs/governance.md`, `docs/agent-task-protocol.md`, `AGENTS.md`, the
  two skills under `.claude/skills/`, `scripts/review-route.ts`,
  `scripts/review-run.ts`, `scripts/reviewer-invocations.ts` (a comment),
  and their tests.
- No reviewer invocation is added or removed; the `networkedReviewer`
  field and the external facts signal stay, because rule versions 1 to 4
  use them.
- Out of scope: any other reviewer, effort, or process rule.
