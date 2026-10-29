# Verification

Date: 2026-10-29. The author's verification and `make verify` are recorded below. No review pass ran (owner decision, 2026-10-29).

## Scope and source

The coordinator's brief of 2026-10-29 (Niki) for the change `assign-fable-to-review-pass-2`, size S-M, commit type `chore`, from the owner's decision of 2026-10-29: Claude Code (claude-fable-5-1) at effort `medium`, key `claude claude-fable-5-1#medium`, reviews pass 2 (role B) instead of Claude Code (claude-opus-5-5); passes 1 and 3 stay `codex gpt-6-astra#medium` and `codex gpt-6.1-sol#medium`. A task that needs network access keeps passes 1 and 3 `claude claude-fable-5-1#medium` and pass 2 `claude claude-opus-5-5#medium`, so that the model of pass 2 differs from that of the adjacent passes. Governance policy version 9 applies from the decision to every task whose pass 2 had not started, before version 9 reaches `dev`.

- **Base revision:** `115c16c4` (`origin/dev`, merge of pull request #414).
- **Checklist:** saved with the brief's invocation, `--at 115c16c41016ae5f45dee6609558a9299ef8b165 --size S-M`.
- **Route:** no `route.json`; the route only recommends the reviewers and efforts of review passes, and this change has none.

## Environment

macOS (Darwin 25.6.0), Node.js from `.nvmrc` through nvm.

## Author self-check

- **One assignment.** `git grep -n claude-opus-5-5 -- ':!openspec/changes/archive'` after the change finds opus as the pass 2 reviewer only for a task that needs network access (governance "Reviewer assignment", the external facts paragraph, the protocol, and both skills), in its authorized reviewer entry and invocation row, in the rotation turn, in rule version 1 and 2 tables, which archived records use, and in tests of versioned or legacy records.
- **Rule version 3.** `scripts/review-route.ts` adds `REVIEWER_TABLE_V3` in the idiom of versions 1 and 2: pass 2 reviewer `claude-fable-5-1`, networked reviewer `claude-opus-5-5`, efforts `medium` standard and `high` elevated. The elevated effort of pass 2 is `high`: version 2 recommended `xhigh` for opus, and the brief asked for fable's highest supported effort with `high` as the choice when `xhigh` is not confirmed. The installed Claude Code CLI lists `low`, `medium`, `high`, `xhigh`, and `max` for every model, but no record shows fable at `xhigh`, so `high` stands. The networked pass 2 seat shares the seat's efforts, so opus is recommended `high`, not `xhigh`, when `elevated`. `elevated` stays unauthorized, so no invocation key is added. The thresholds of version 3 are those of versions 1 and 2.
- **Compatibility.** Versions 1 and 2 keep their tables; `test/review-route-rules.test.ts` "rule version 2 keeps its reviewer table" checks version 2, and `make findings ARGS="validate"` checks the archived `route.json` files against their versions. `docs/review-findings/route.schema.json` already accepts rule version 2 and later with three pass plans.
- **Policy version.** `GOVERNANCE_POLICY_VERSION` is 9, and the test "the policy version that make review names is the governance one" compares it with `docs/governance.md`.
- **Spec.** The two modified requirements keep their text and scenario names; "Rule routing floor" adds the scenario "Record of rule version 2".
- New comments are at most two lines of at most 80 characters; commit types are `chore`, without attribution.

## Evidence check

- **External facts.** None; the change depends on no external page.
- **Links.** The records link only inside the change directory or root-relative.

## Fail-before

Before the test changes, the route and review tests against the changed scripts failed 13 of 259, among them "the reviewer table of rule version 2 plans the review sequence" (`RULE_VERSION` 3), "a large change without external facts gets the elevated Codex plan" (pass 2 `claude claude-fable-5-1#high`), and "the policy version that make review names is the governance one" (8 against 9 until governance changed). With the updated tests and governance all pass.

## Checks

- `node --experimental-strip-types --test test/review-route*.test.ts test/findings-route.test.ts test/review-run.test.ts test/reviewer-invocations.test.ts test/findings.test.ts`: 260 of 260 passed.
- `npm run openspec -- validate assign-fable-to-review-pass-2 --strict`: `Change 'assign-fable-to-review-pass-2' is valid`.

<!-- make record: begin -->
<!-- make record: end -->

## Review

Owner decision 2026-10-29: recorded by the coordinator as architect without independent review; architect check by Niki.

`passes.jsonl` and `findings.jsonl` are empty: no reviewer ran.

## Limitations

- No independent review pass, by the owner's decision.
- Fable's support of effort `xhigh` was not tried; `elevated` stays unauthorized, so the recommendation has no effect on a review.

## Remaining gates

- Architect check by the coordinator (Niki).
- Integration into dev by the coordinator (single pull request)
