## Why

Since about 2026-10-27 11:07 local time every brief carries the review checklist that `make findings ARGS="checklist ..."` prints, so that workers avoid the findings it warns about. Whether it works cannot be measured today: no record says which checklist went into which brief, there is no baseline, and findings are not normalized by change size. The coordinator (Niki) assigned this change with owner priority on 2026-10-27.

## What Changes

- `make findings ARGS="checklist ... --save <change> [--size <S|S-M|M|M-L|L>]"` writes the active change's `checklist.json`, defined by the new `docs/review-findings/checklist.schema.json`: the query (capabilities, file globs, top), the generation time, the dev commit, the size, and the ranked review and record quality categories with counts and baselines. It never overwrites one. `checklist --json` prints both sections as JSON.
- `make findings ARGS="validate"` checks every `checklist.json`, active and archived, and requires one in every active change created on or after 2026-10-28 by its `.openspec.yaml`, or without a created date.
- `make findings ARGS="effect [--json]"` reports, per archived change with `checklist.json` and per archive date, the observed share of pass-1 findings in listed categories against the expected share of its baseline, for code and record findings, all and Medium or worse, and pass-1 findings per size point or per 100 changed lines. Archived changes without `checklist.json` are listed and excluded.
- `docs/agent-task-protocol.md` (worker step 2, coordinator step 1, "Review findings record") and the `taskelith-task-protocol` skill have workers save the brief's checklist at plan time.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds "Checklist record" and "Checklist effect".
- `agent-task-protocol`: adds "Checklist record in the task flow".

## Impact

Repository tooling and process documentation only (`scripts/`, `docs/`, `.claude/skills/`, `test/`, `Makefile`); no runtime, contract, or published package change. The new commands live in `scripts/checklist-record.ts`, `scripts/checklist-effect.ts`, `scripts/checklist-commands.ts`, and `scripts/checklist-environment.ts`; `scripts/findings.ts` only dispatches and validates.

Exclusions: no backfill of `checklist.json` into archived changes, because the brief text is not kept in the repository; no statistical significance test; no change to the existing `index`, `reviewers`, and text `checklist` output.
