## Why

Review findings are recorded only as prose in each change's `verification.md`, so recurring kinds of findings cannot be counted or fed back into new briefs. The owner asked, through the coordinator, for step 1 of a review-knowledge loop: every reviewer finding recorded in a structured, git-tracked form and used in briefs before implementation, centralized in the repository, with no database.

## What Changes

- A `findings.jsonl` file in each OpenSpec change directory, next to `verification.md`: one JSON object per finding, defined by the new JSON Schema `docs/review-findings/finding.schema.json`.
- A controlled, extensible category vocabulary in `docs/review-findings/categories.txt`, seeded with 15 categories; adding a category is adding one line.
- `npm run findings` (`scripts/findings.ts` with pure rules in `scripts/review-findings.ts`) with three commands: `validate`, wired into `make verify` as `npm run verify:findings`; `index`, which aggregates archived findings; and `checklist`, which prints the most frequent archived categories for given capabilities and file globs.
- `docs/agent-task-protocol.md`, `docs/governance.md`, and the `taskelith-task-protocol` skill: workers append findings after every pass and check the file at the archive, and the coordinator adds the checklist to every brief.
- This change's own empty `findings.jsonl`; no past change is backfilled.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: adds the review findings record and its index and checklist.
- `agent-task-protocol`: adds the findings steps of workers and the checklist in coordinator briefs.

## Impact

Repository tooling and process documentation only. `scripts/` and `docs/review-findings/` are outside the published package's `files` allowlist, so the published `taskelith` package does not change. The script uses `ajv@8.20.0`, already installed as a runtime dependency of `@taskelith/plugin-sdk` and `@taskelith/contracts`; no dependency is added. Every active change, including those on other branches, needs a `findings.jsonl` once this change is merged into `dev`.

Exclusions: no database (Neo4j or other), no owner-facing UI, no backfill of archived changes, and no coordinator or worker skills, which are not on `dev` yet.
