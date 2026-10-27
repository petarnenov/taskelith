## Why

One OpenSpec change may review several artifacts, each by its own reviewers A and B with passes 1 to 3; the upcoming `revalidate-g3-foundations` change reviews seven. The review records cannot hold that today: `scripts/review-passes.ts` keys pass summaries by `pass` alone per change, and neither the finding schema nor the pass schema has a property for the artifact, so the second "pass 1" summary of a change fails validation. The coordinator, Niki, assigned this change on 2026-10-27 as a prerequisite of G3 item 0.

## What Changes

- Finding lines and pass summary lines gain an optional `artifact`, an identifier: the artifact that a multi-artifact change reviews. A change that reviews one artifact omits it, so every existing record stays valid unchanged.
- Validation keys pass summaries by artifact and pass, an absent artifact being its own key: each pass of each artifact is summarized once, every finding agrees with the summary of its artifact's pass, the counts are per artifact and pass, and a `missedBy` pass resolves within the finding's artifact. Messages name the artifact when there is one.
- `make findings ARGS="reviewers"` attributes passes and misses per artifact and pass, also for archived changes without `passes.jsonl`, whose passes are derived from the distinct artifacts and pass numbers of their findings. The output formats of `index`, `reviewers`, and `checklist` are unchanged.
- `docs/agent-task-protocol.md`, "Review findings record", describes the optional key.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: review pass summaries, their consistency, missed finding attribution, and reviewer statistics are keyed by artifact and pass.

## Impact

Repository tooling only: `scripts/review-findings.ts`, `scripts/review-passes.ts`, `scripts/reviewer-statistics.ts`, the two schemas under `docs/review-findings/`, their tests, and the protocol section. No published package changes. Records without `artifact` validate and count as before.
