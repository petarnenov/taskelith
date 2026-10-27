## Why

The review findings record shows what reviewers found, but not how often each reviewer ran, how many passes found nothing, or what a reviewer missed that a later pass found. The owner approved, through the coordinator (Niki), on 2026-10-27 per-reviewer statistics from the review records: passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and later-found misses.

## What Changes

- Every review pass that runs to a report, also one without findings, records one summary line in the change's new `passes.jsonl`: change, pass, role (A or B), reviewer (harness, model, variant or effort), session, and counts by severity. `docs/review-findings/pass.schema.json` defines it.
- A finding may name in the optional `missedBy` what missed it: an earlier pass of its change with that pass's role, or `"integration"`.
- `make findings ARGS="validate"` validates every `passes.jsonl` with the line bound, schema, and secret-like-value checks of findings, requires it in every active change only, and checks that summaries and findings agree: one summary per pass, the same reviewer and session, counts equal to the pass's findings by severity, and `missedBy` naming an earlier, summarized pass of that role.
- `make findings ARGS="reviewers [--json]"` prints the statistics per reviewer and per role over archived changes. An archived change without `passes.jsonl` counts only its passes with findings, derived from `findings.jsonl`, with role unknown, and the output says so; it also states how many archived changes have no review record at all and are not counted.
- `docs/agent-task-protocol.md` (worker steps 2, 5, 6, and 7 and "Review findings record"), the `taskelith-task-protocol` and `taskelith-worker` skills, and the governance sentence on which records name the role of each pass say the same.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds "Review pass summaries", "Pass summary consistency", "Missed finding attribution", and "Reviewer statistics".
- `agent-task-protocol`: modifies "Review findings in the task flow" so that the worker also creates `passes.jsonl` and appends a summary of every pass.

## Impact

Repository tooling and process documentation only (`scripts/`, `docs/`, `.claude/skills/`, `test/`); no runtime, contract, or published package change. Archived records are not rewritten.

Exclusions: no backfill of pass summaries or `missedBy` in archived changes, no change to the output of the index and checklist commands, which, like every command, now refuse to run on invalid pass summaries or summaries that disagree with the findings, and no statistics over active changes.
