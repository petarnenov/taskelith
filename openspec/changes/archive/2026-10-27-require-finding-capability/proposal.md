## Why

Briefs draw on the review findings record through `make findings ARGS="checklist"`, which matches archived findings by capability or file glob. On `dev` at `477a423e`, 21 of the 51 archived findings name no capability: 17 concern a change's own records under `openspec/changes/` (`verification.md`, `design.md`, `proposal.md`, `tasks.md`, spec deltas), and 4 concern `tools/`, `scripts/`, and `docs/`. A capability-based checklist misses all of them, so the most frequent kinds of record findings never reach a brief. The coordinator brought the owner-approved change on 2026-10-27.

## What Changes

- The findings tool treats a finding whose `file` is under `openspec/changes/`, active or archived, as a record finding.
- `make findings ARGS="checklist"` always ends with a "Record quality" section: the most frequent categories of archived record findings, with counts and the newest example title, whatever the `--capability` and `--files` options.
- In an active change, a finding outside `openspec/changes/` must name a capability, and `make findings ARGS="validate"` checks that every capability an active finding names exists as a directory under `openspec/specs`. A change that skips specs names the closest capability.
- Archived findings validate as before; no archived `findings.jsonl` is rewritten.
- `docs/agent-task-protocol.md` "Review findings record", the capability description in `docs/review-findings/finding.schema.json`, and the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills describe the rule and the section.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: the review findings record requires a capability for code and doc findings of active changes, and the checklist adds the record quality section.

## Impact

Repository tooling and process documentation only: `scripts/findings.ts`, `scripts/review-findings.ts`, their tests, `docs/`, and `.claude/skills/`, all outside the published package's `files` allowlist, so the published `taskelith` package does not change. No new dependency. Active changes on other branches whose findings outside `openspec/changes/` omit a capability fail `make verify` after they merge `dev`, with a message naming the line.

Exclusions: no rewrite or backfill of archived findings; the 4 archived code and doc findings without a capability stay without one, and the schema does not enforce the capability, because a schema cannot check that a directory exists and archived lines must still validate.
