## Why

The Jev shadow request of `make findings ARGS="route"` (`scripts/review-route-jev.ts`, at `1234e540` lines 70 to 116) is badly shaped. It asks for an effort tier but is scored as P(third pass). Its tier criteria restate the rule v1 triggers, and its `touches` flags hand the model the rule's decision. Its fields carry no meaning or context, and it has no content signal. A live experiment over the 50 changes of the archived `route-reviewers-by-change-complexity` evaluation, with the owner-approved request below, gave Jev a mean Brier score of 0.184 and an AUC of 0.80, against 0.202 and 0.70 for the rule (leave-one-out) and 0.218 for the base rate.

## What Changes

- **One question.** The request asks one `noul` question, `third`: "This software change will need a third review pass.", with true and false criteria taken from governance "Conditional third pass". The `tier` choice and `passes` score questions are dropped.
- **Context.** The state gains a `context` object: the meaning of the features, the review process, the third pass share of the other archived reviewed changes, overall and by lines changed band, and a description of every field. The rates are computed from the archived review records as of the dev commit, leaving the routed change out.
- **Content.** The state gains `content`: the proposal's Why, clipped at 1,200 characters, and What Changes, clipped at 1,500, with secret-like strings redacted first, and the change's task and spec requirement counts. The owner approved sending this text to TypeSafe on 2026-10-28.
- **No path flags.** The `touches` flags leave the request; the rule keeps using them, unchanged.
- **Threshold.** The shadow tier is `elevated` when P(third) is 0.4 or more, else `standard` (`THIRD_PASS_THRESHOLD`). `route.json` records P(third), the threshold, the tier, and its pass plans; the schema keeps the earlier answer shape valid for archived records.
- **Score.** `make findings ARGS="effect"` and the route evaluation report the Brier score and AUC of P(third) against the third passes that ran, apart from answers to the earlier questions; validation checks the shadow tier against P(third) and the threshold.
- **Input failure.** The shadow input is built only after the credential check; a failure to build it is the shadow failure `input-unavailable`, and the rule decides alone.
- Jev stays shadow-only: nothing routes on it, and routed effort stays unauthorized.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-process`: requirements "Shadow routing" and "Shadow router failure" modified; requirements "Shadow request content" and "Shadow third pass score" added.

## Impact

- `scripts/review-route-jev.ts`, `scripts/review-route.ts`, the new `scripts/review-route-shadow-input.ts`, `scripts/review-route-command.ts`, `scripts/review-route-evaluation.ts`, `scripts/review-route-effect.ts`, `scripts/review-route-report.ts`, `scripts/review-route-record.ts`, `scripts/review-route-features.ts`, `scripts/review-findings.ts` (exports `SECRET_PATTERNS`), `docs/review-findings/route.schema.json`, `docs/agent-task-protocol.md` (route record and checklist effect), their tests, and a test fixture.
- Out of scope: an ablation or no-flags option, rule v1, routed effort, and other review process changes.
