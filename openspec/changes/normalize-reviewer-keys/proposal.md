## Why

`make findings ARGS="reviewers"` splits one reviewer across several rows, because the review records spell the same reviewer in different ways. The archived records hold three legacy spellings next to the canonical ones: `claude-code claude-opus-5-5#high` (1 pass, 10 findings) beside `claude claude-opus-5-5#high`, and `opencode kimi-k2.7-code#default` (1 pass, 1 finding) and `opencode opencode-go/kimi-k2.7-code` without a variant (1 pass) beside `opencode opencode-go/kimi-k2.7-code#default`. Nothing stops an active change from adding another spelling, so the statistics that reviewer choices draw on stay unreliable.

The owner also decided on 2026-10-27 which reviewers take roles A and B, from those statistics; that decision needs one place in governance, and the rotation and replacement rules must agree with it.

## What Changes

- **Canonical reviewer key.** In an active change, every reviewer of `findings.jsonl` and `passes.jsonl` uses the harness `claude`, `codex`, `opencode`, or `agy`; the model as the harness CLI takes it, an OpenCode model with its provider prefix and no other model with one; and a `variant`, the effort, `default` when the harness default ran. `make findings ARGS="validate"` (and so `make verify`) now rejects any other key in an active change, naming the file and line. Archived records are not checked by this rule.
- **One alias table.** Archived records are not rewritten. A new module, `scripts/reviewer-keys.ts`, holds the rule and `LEGACY_REVIEWER_ALIASES`, the one table that maps each of the three legacy spellings to its canonical reviewer. `scripts/findings.ts` maps every archived finding and pass summary through it before `index`, `reviewers`, and `checklist` run, so the outputs of `index` (section "By reviewer") and `reviewers` (section "By reviewer") change: each reviewer has one row. The `checklist` output shows no reviewer, so it does not change.
- **Schema descriptions.** The `harness`, `model`, and `variant` descriptions of `docs/review-findings/finding.schema.json` name the canonical key; the schema's validation is unchanged, because archived records must still validate.
- **Reviewer assignment.** `docs/governance.md` records the owner decision of 2026-10-27 as the table "Reviewer assignment" under "Two alternating reviewers per task", with the statistics it rests on, and reconciles "Rotation" (now only the order of replacements) and "Unavailable reviewer" with it. `docs/agent-task-protocol.md` ("Reviewer invocations", worker step 5, coordinator step 1, "Review findings record") and the skills `taskelith-task-protocol` and `taskelith-coordinator` point to it.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds "Canonical reviewer key" and "Reviewer assignment"; modifies "Authorized alternating reviewers" (the assignment may pair one harness) and "Rotation order" (it orders only replacements).

## Impact

Private repository tooling and documents only: `scripts/findings.ts`, the new `scripts/reviewer-keys.ts`, their tests, the finding schema's descriptions, governance, the agent task protocol, and two skills. No published package, API, or product contract changes. `AGENTS.md` is unchanged: its review bullet names no reviewer or harness, and it points to the governance review process, which holds the assignment.
