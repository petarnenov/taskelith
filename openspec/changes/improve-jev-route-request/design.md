# Design

## Context

The route command (`make findings ARGS="route --change <change>"`) records the rule router's tier, which recommends the reviewers, and the shadow router's answer, which decides nothing ([governance "Routed effort"](/docs/governance.md#independent-review-process)). Until this change the shadow request (`scripts/review-route-jev.ts` at `1234e540`, lines 70 to 116) asked two questions, a `tier` choice between `standard` and `elevated` and a `passes` score, about a state of bare numbers, capability identifiers, and the rule's `touches` path flags. The effect then scored P(`elevated`) as if it were P(third pass). Three faults follow: the question is not the one scored, the tier criteria restate the rule v1 triggers and the flags hand the model the rule's decision, and the model sees neither what the fields mean nor what the change is about.

The coordinator's brief of 2026-10-28 carries the owner-approved fix, validated by a live experiment (`~/.cache/taskelith-jev-exp/exp2.mjs` on the coordinator's host, outside the repository) over the 50 lines of the archived `route-reviewers-by-change-complexity/evaluation.jsonl`, each asked twice:

| Scorer | Brier score | AUC |
| --- | --- | --- |
| Base rate (0.32) | 0.218 | 0.500 |
| Rule, leave-one-out probability per tier | 0.202 | 0.700 |
| Jev, run 1 | 0.187 | 0.801 |
| Jev, run 2 | 0.182 | 0.806 |
| Jev, mean of both runs | 0.184 | 0.804 |

The mean absolute difference between the two runs was 0.019.

## Goals and non-goals

- Goals: the brief's scope items 1 to 7: one third pass question, a context with leave-one-out reference rates, the redacted proposal content, no `touches` flags in the request, a named threshold, Jev kept shadow-only, and a score of P(third) for the re-evaluation.
- Non-goals: an ablation or no-flags option (the experiment covered it), any change to rule v1 or its `touches` flags, routed effort, which stays unauthorized (owner decision R1), and any other review process change.

## Decisions

### D1. One question from the governance rule

The request asks one `noul` question, `third`, whose answer is the probability that the statement is true (`NoulAnswer` of the TypeSafe OpenAPI document, `info.version` 0.2.0). Its instructions are "This software change will need a third review pass." Its true criterion is "Reviewer B in pass 2 will find a Critical or High issue, or a Medium issue whose fixes will change code, tests, or contracts rather than only records and documentation.", and its false criterion "No third pass will be needed: the review ends after a Low-only pass, or pass 2 finds no Critical or High issue and its fixes, if any, touch only records and documentation." Both restate [governance "Conditional third pass"](/docs/governance.md#independent-review-process), not the rule table. The `tier` choice and `passes` score questions are gone, so the model is asked exactly what the effect scores. The false criterion changed after the experiment, which asked with "Pass 2 will find only Medium or Low issues whose fixes touch only records and documentation, so two passes suffice.": that sentence missed a clean pass 2 and a review that ends after a Low-only pass, which governance allows (pass 1 review finding, coordinator decision 2026-10-28). The true criterion changed after the experiment too, which asked with "Reviewer B in pass 2 will find a Critical or High issue, or the fixes after pass 2 will change code, tests, or contracts rather than only records and documentation.": with the widened false criterion, a Low-only pass 2 whose fixes touch code met both, although governance "Low findings are fixed" ends that review without pass 3, so the true criterion now names only a Critical, High, or Medium finding (pass 2 review finding, coordinator decision 2026-10-28). The re-evaluation gate after 30 to 40 changes (D7) covers any calibration shift the new wording of either criterion causes. `parseJevAnswer` accepts only an answer `third` of type `noul` whose `noul` is a number from 0 to 1, with a model ID as before; any other body, the answers to the old two questions included, is `invalid-response`.

### D2. Context and leave-one-out reference rates

The state gains `context` (`requestContext` in `scripts/review-route-jev.ts`): `meaning`, `review` (pass 1 by A, pass 2 by B, when pass 3 is required), `baseRate` and `byLinesChanged` as sentences with whole percentages, `unknown` where no change counts, and `fields`, a description of every state field. The wording is the experiment's.

The rates (`referenceRates` in the new `scripts/review-route-shadow-input.ts`) are computed, not hard-coded, from the archived review records as of the dev commit, the same `archivedReviews` read that the capability history uses, so no later change counts:

- A change needed a third pass when its highest recorded pass in `findings.jsonl` or `passes.jsonl` is 3 or more, as in the capability history and the evaluation outcome.
- Leave-one-out: the routed change, named by its directory, never counts in its own rates. For a route before archiving this changes nothing; it matters when the archive already holds the routed change, as an evaluation at a later revision would.
- Changes reviewed per artifact (`artifact` in a record line) do not count, as in the route evaluation, because their highest pass is no single review's outcome. `ArchivedReview` gains `change` and `severalArtifacts` for this. The coordinator approved this exclusion as an architect decision on 2026-10-28.
- The lines changed of an archived change come from its committed route records (`recordedLinesOf`): its own archived `route.json`, else its line in an archived `evaluation.jsonl`. A change without either counts in the overall rate but in no band. The bands are the evaluation's `LINE_BANDS`, moved to `scripts/review-route.ts` so both modules share them.

At the dev commit `1234e540` this gives 70 counted changes with a third pass share of 49%, and by band 13% of 23 under 100 lines, 39% of 18 for 100 to 399 lines, and 80% of 20 for 400 lines and more. The experiment's reference was 32% over the 50 evaluation lines alone; the 20 single-artifact changes archived since, 11 of them routed, needed a third pass 18 times. The higher reference is what the archive now shows; the re-evaluation (D7) measures its effect.

### D3. Proposal content, redacted before it is clipped

The state gains `content`: `why` and `whatChanges`, the bodies of the proposal's `## Why` and `## What Changes` sections up to the next heading of level 1 or 2 (`markdownSection`), `taskCount`, the checkbox lines of `tasks.md`, and `specRequirementCount`, the `### Requirement:` lines of the change's `specs/**/spec.md`, all read as of the routed revision (`changeContentAt`). Missing files give empty text and zero counts.

`redactedExcerpt` first replaces every whole PEM block whose header `SECRET_PATTERNS` names, and every PGP private key block (`PEM_BLOCK`), through its end line or, without one, to the end of the text, because base64 body lines can be shorter than 40 characters (pass 1 review finding), and a PGP block's last body line and checksum line can be short as well (pass 2 review finding); it then replaces every match of the finding validator's `SECRET_PATTERNS` (exported from `scripts/review-findings.ts`) and of the experiment's run of 40 or more token characters with `[redacted]`, then clips to 1,200 characters for `why` and 1,500 for `whatChanges` (`WHY_LIMIT`, `WHAT_CHANGES_LIMIT`), appending an ellipsis. The experiment clipped first; redacting first means a secret across the limit cannot be cut short enough to escape the patterns, as the test "a secret across the clip limit is redacted, not cut short" (`test/review-route-jev.test.ts`, line 199) shows, and the four tests above it cover short body lines, standard 64-character lines, a block without an end line, and a PGP block with a short last line. `SECRET_PATTERNS` itself is unchanged, so the findings validation that tests values against it behaves as before. The coordinator approved this order as the safer one, an architect decision of 2026-10-28. The run pattern also redacts long paths and full commit hashes, which the request needs no more than secrets.

**Data consent.** The owner explicitly approved on 2026-10-28 sending the redacted proposal text (Why and What Changes) to TypeSafe AI with the Jev request, under the account, Master Customer Agreement, and data consent confirmed for `route-reviewers-by-change-complexity` (its `design.md` "Decisions" 6). Beyond that text, the request sends no path, commit, change name, diff or source text, or finding text.

### D4. No path flags in the request

`shadowState` no longer copies `features.touches`. The rule router keeps reading them and `route.json` keeps recording them in `features`, so rule v1 and its records are unchanged. The test "the request state carries no touches flags" fails on the previous request.

### D5. Threshold 0.4

`THIRD_PASS_THRESHOLD` is 0.4, and `tierAt` in `scripts/review-route.ts` maps P(third) to `elevated` at or above it and to `standard` below it. From the experiment's mean P(third) per change:

| Threshold | Elevated with a third pass | Standard with a third pass | Agreement with the rule |
| --- | --- | --- | --- |
| 0.32 | 15 of 36 | 1 of 14 | 37 of 50 |
| 0.4 | 14 of 31 | 2 of 19 | 40 of 50 |
| 0.5 | 13 of 24 | 3 of 26 | 39 of 50 |

0.4 keeps the standard tier's third pass share low (2 of 19, 11%) while it elevates fewer changes than 0.32, and agrees with the rule most often. `route.json` records the threshold beside P(third), so a later threshold leaves archived records readable and checkable.

### D6. Record shape and compatibility

An answered shadow is now `{router, status, model, tier, thirdPassProbability, threshold, passes, latencyMs}`. The schema's `shadow` keeps the earlier answered shape as a second variant, `LegacyAnsweredShadow` in TypeScript, because archived `route.json` files and the archived `evaluation.jsonl` hold it; `additionalProperties: false` keeps the two variants apart. Validation adds one check for the new shape: the tier must be `tierAt(thirdPassProbability, threshold)`. The route summary prints `P(third) 0.62, threshold 0.4` for the new shape and the old P(`elevated`) for the old one.

Jev stays shadow-only: its tier and pass plans are recorded beside the rule's, nothing routes on them, and routed effort stays unauthorized (governance "Routed effort", owner decision R1).

### D7. Score of P(third) and the re-evaluation gate

The routing figures (`scripts/review-route-effect.ts`) gain `thirdPass`: over the shadow answers to the third pass question, their count, the Brier score of P(third) against whether pass 3 ran, and the AUC (`areaUnderCurve`, ties counted half, null without both outcomes). The Brier score and pass error of answers to the earlier questions are computed apart, over those answers only, as `tierRequest` with its own count, beside `thirdPass`, so that `effect --json` names each score by the question it scores (pass 2 review finding). `make findings ARGS="effect"` and `route-evaluation` print a line for each kind of answer that occurs, so scope item 7's report is done: since only routes made with the new request record P(third), the effect scores exactly the changes routed with it.

**Re-evaluation gate (owner caveat).** After 30 to 40 new changes have been routed with this request and archived, the owner decides whether to keep or drop Jev, from the `effect` report's P(third) Brier score and AUC beside the rule's third pass shares per tier. This is a remaining gate of this change.

### D8. Test fixture

No response to the new question was captured. `test/fixtures/review-route/jev-third-pass-response.json` is built from the `SystemOneResponse` and `NoulAnswer` schemas, as the README there says. The live route of this change (worker step 4) is the first real exchange, and its result is in `route.json`.

### D9. Shadow input built only when it is used

The route command hands the shadow router a function that builds its input (`ShadowInputSource` in `scripts/review-route.ts`), not the input. `JevRouter` calls it only after the credential check, so a route without `JEV_MAF_LAB` reads no archive and no proposal. When building the input fails, for example on an archived `route.json` that is not valid JSON, the shadow decision is the failure `input-unavailable` without a request, the rule decides alone, and the command exits 0, as for every other shadow failure; before, that read refused the whole command (pass 2 review finding, coordinator decision 2026-10-28). The route evaluation passes the same function, so an input it cannot build is recorded the same way.

## Risks

- The constructed fixture may differ from live responses; a mismatch shows as `invalid-response` in `route.json`, never as a wrong tier.
- The reference rates now include the 20 newer changes (D2): the base rate rose from 32% (the experiment's 50 lines) to 49% (70 changes), with lines-changed bands of 13%, 39%, and 80%. With the base rate above the 0.4 threshold, most changes may be shadow-elevated. The coordinator's architect decision of 2026-10-28 keeps the reference rates as the full archive, leave-one-out, as of the dev commit, and re-tunes the threshold at the re-evaluation after 30 to 40 changes (D7) from the Brier score and AUC report of P(third) that this change adds.
- The redaction can miss a secret of an unknown shape that is shorter than 40 characters; the owner's consent covers the proposal text, which reviewers and validation already treat as repository content.
