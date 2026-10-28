## Why

The owner set a fixed review sequence on 2026-10-28: pass 1 Codex CLI
(gpt-6-astra, medium), pass 2 Claude Code (claude-opus-5-5, medium), and
pass 3 Codex CLI (gpt-6.1-sol, medium), run in order until a pass reports
only Low findings or none, whose Low findings are fixed without another
review. Fixes that no later pass reviews are checked by the coordinator as
solution architect. Governance policy version 7 still assigns two
alternating reviewers, A for passes 1 and 3 and B for pass 2, runs pass 3
only under the conditional third pass rule, authorizes Claude Code
(claude-opus-5-5) only at effort `high`, and its route table and the Jev
shadow question restate that older rule.

## What Changes

- **Governance.** Policy version 8 replaces "Two alternating reviewers per
  task" and "Conditional third pass" with "Review sequence": one reviewer
  per pass, the stop rule, pass 3 as a full review of the current diff that
  checks every pass 2 fix, the cap with pass 3 findings fixed without
  another review, and a new "Architect check of unreviewed fixes". The
  reviewer assignment table, "Routed effort", "Rotation", "Unavailable
  reviewer" (a replacement differs in harness from the adjacent passes),
  and "External facts" follow; the history rows stay.
- **Network tasks.** Passes 1 and 3 Claude Code (claude-fable-5-1), pass 2
  Claude Code (claude-opus-5-5), each at `medium`: an accepted exception
  that holds until a networked reviewer of another harness is available.
- **Opus effort.** The authorized effort of Claude Code (claude-opus-5-5)
  becomes `medium`; `scripts/reviewer-invocations.ts` adds the key
  `claude claude-opus-5-5#medium` and keeps `#high` as a fallback.
- **Roles.** Records keep role A for passes 1 and 3 and B for pass 2, so
  no schema, archive, or statistics change; `make review` defaults `ROLE`
  from `PASS` and still validates a given one.
- **Route.** Rule version 2 plans passes 1, 2, and 3 with networked
  reviewers of passes 1 and 3 and efforts keyed per pass; `elevated` stays
  unauthorized. `route.schema.json` takes the pass plans' shape from the
  rule version, so version 1 records stay valid.
- **Jev.** The shadow question's criteria follow the stop rule: true when
  the reviewer of pass 2 will find a Medium, High, or Critical issue. The
  threshold stays 0.4, and Jev stays shadow-only.
- **Docs.** `docs/agent-task-protocol.md`, `AGENTS.md`, and the skills
  `taskelith-task-protocol`, `taskelith-worker`, and
  `taskelith-coordinator` state the same rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-process`: "Authorized alternating reviewers" renamed to
  "Authorized review sequence" and "Conditional third pass" to "Review
  sequence stop rule", both modified; "Pass cap and finding handling",
  "Unavailable reviewer", "Rotation order", "No reviewer of another
  harness", "Reviewer assignment", "Review route command", "Rule routing
  floor", "Shadow routing", "Route record", "Route effect", and "Review
  command" modified;
  "Architect check of unreviewed fixes" added.

## Impact

- `docs/governance.md`, `docs/agent-task-protocol.md`, `AGENTS.md`, the
  three skills under `.claude/skills/`,
  `docs/review-findings/route.schema.json`,
  `docs/review-findings/finding.schema.json` (the role description),
  `scripts/review-route.ts`, `scripts/review-route-record.ts`,
  `scripts/review-route-jev.ts`, `scripts/review-route-effect.ts` (a
  comment), `scripts/review-run.ts`, `scripts/reviewer-invocations.ts`, and
  their tests.
- Out of scope: routed effort, which stays unauthorized, any other process
  lever, and `docs/fleet.md`.
