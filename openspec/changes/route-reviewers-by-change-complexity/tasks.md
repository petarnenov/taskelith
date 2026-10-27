## 1. Phase 1: research, design, and contract

- [x] 1.1 Create the change with `proposal.md`, `design.md`, `tasks.md`, `verification.md`, and empty `findings.jsonl` and `passes.jsonl`.
- [x] 1.2 Save the brief's checklist as `checklist.json` with `--save route-reviewers-by-change-complexity --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --size M`, and copy its output into `design.md` "Review checklist".
- [x] 1.3 Research the TypeSafe AI Jev API, terms, data use, and pricing, and record the sources and the owner actions in `design.md` "External facts".
- [x] 1.4 Derive the archived statistics and the rule table (`design.md` "Archived statistics", "Rule table").
- [x] 1.5 Write the `review-process` and `agent-task-protocol` deltas and `docs/review-findings/route.schema.json`.
- [x] 1.6 Run `npm run openspec -- validate route-reviewers-by-change-complexity --strict`, `npm run verify:links`, `npm run verify:comments`, and `npm run verify:findings`.

## 2. Phase 2: implementation, after `normalize-reviewer-keys` reaches `dev`

- [x] 2.1 Merge `origin/dev` with `normalize-reviewer-keys`; align the pass plans with its canonical reviewer keys and its reviewer assignment text.
- [x] 2.2 Check that the installed Codex CLI accepts `model_reasoning_effort = "high"` for `gpt-6.1-sol`, and record it.
- [x] 2.3 Record the coordinator's decisions of 2026-10-28 in `design.md` "Decisions", the deltas, and `proposal.md`: `route.json` only recommends, routing after `make verify`, the brief's reviewers with the routed effort, no light tier, the evaluation population, and the owner's pending hard-floor items.
- [x] 2.4 Tests first, recorded as failing on the pre-implementation commit: `test/review-route-rules.test.ts` (every rule table row, trigger, and boundary), `test/review-route-features.test.ts` (derivations, and the git adapter against temporary repositories), `test/review-route-jev.test.ts` (the constructed recorded response through an injected `fetch` and a local server, the request allowlist, every failure code, the sentinel credential), `test/review-route-record.test.ts` (schema and consistency), and `test/review-route-command.test.ts` (with the fake router, the sentinel credential on every failure path, and the composed command without a credential).
- [x] 2.5 Implement `scripts/review-route.ts`, `scripts/review-route-rules.ts`, `scripts/review-route-features.ts`, `scripts/review-route-environment.ts`, `scripts/review-route-jev.ts`, `scripts/review-route-record.ts`, and `scripts/review-route-command.ts`, with `runRoute` as the runner that phase 3 dispatches.
- [x] 2.6 Measure the coverage of the new modules (at least 75% of lines, branches, and functions) and record it.
- [x] 2.7 Tests committed before the module, then `scripts/review-route-effect.ts` with `test/review-route-effect.test.ts`: the pure routing figures that `effect` and the offline evaluation share. The per-change rows of `effect` from `route.json` and `passes.jsonl`, and its output, belong to `scripts/findings.ts` and move to 3.2.
- [x] 2.8 Tests committed before the module, then `scripts/review-route-evaluation.ts` with `test/review-route-evaluation.test.ts` (no future history, the shadow router only as a fake), its git adapter in `scripts/review-route-environment.ts`, and `docs/review-findings/route-evaluation.schema.json`; `runRouteEvaluation` is the entry and `routeEvaluationDependencies` the composition root, wired live but never run.
- [x] 2.9 Run the offline evaluation with `--rule-only` at `3f23516a`, save `evaluation.jsonl`, and compare it with the in-sample figures of `design.md` "Archived statistics" in `verification.md`.
- [x] 2.11 Resolve `design.md` open question 1 as option (a), never an OpenCode reviewer, and move it into "Decisions" (7).
- [ ] 2.10 Pending with the owner (hard floor): the TypeSafe account, the acceptance of the Master Customer Agreement, paid credits, and the data consent. Only after the owner confirms them and sets `JEV_MAF_LAB`: run the offline evaluation with the shadow router, record `evaluation.jsonl` and the figures in `verification.md`, and replace the constructed response fixture with a captured one. Until then no live call is made from any host.

## 3. Phase 3: integration after `adopt-process-performance-recommendations` reaches `dev`

- [ ] 3.1 Merge `origin/dev` and reconcile the deltas with governance version 6 and its conditional pass 3.
- [ ] 3.2 Wire `route` (`runRoute`) and `route-evaluation` (`runRouteEvaluation`) into `scripts/findings.ts`, validate `route.json`, and extend `effect` with the per-change routing rows from `route.json` and `passes.jsonl`, the reviewers that followed the route, and the figures of `routingFigures` (`design.md` "Planned edits", "Effect extension").
- [ ] 3.3 Update `docs/governance.md` (routed effort under the reviewer assignment, shadow decides nothing), `docs/agent-task-protocol.md` (worker step, record, effect, invocations), the `Makefile` comment, and the `taskelith-task-protocol` and `taskelith-coordinator` skills.
- [ ] 3.4 Run `make findings ARGS="route --change route-reviewers-by-change-complexity"` on this change and commit its `route.json`.
- [ ] 3.5 Run `make verify`, `npm run openspec -- validate --all --strict`, and the findings validation; complete `verification.md`.

## 4. Review and archive

- [ ] 4.1 Author self-check against the review checklist and ADR 0004, and the evidence check.
- [ ] 4.2 Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed, each recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`.
- [ ] 4.3 Archive the change in the last commit of the branch.
