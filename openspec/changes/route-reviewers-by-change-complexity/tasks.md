## 1. Phase 1: research, design, and contract

- [x] 1.1 Create the change with `proposal.md`, `design.md`, `tasks.md`, `verification.md`, and empty `findings.jsonl` and `passes.jsonl`.
- [x] 1.2 Save the brief's checklist as `checklist.json` with `--save route-reviewers-by-change-complexity --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --size M`, and copy its output into `design.md` "Review checklist".
- [x] 1.3 Research the TypeSafe AI Jev API, terms, data use, and pricing, and record the sources and the owner actions in `design.md` "External facts".
- [x] 1.4 Derive the archived statistics and the rule table (`design.md` "Archived statistics", "Rule table").
- [x] 1.5 Write the `review-process` and `agent-task-protocol` deltas and `docs/review-findings/route.schema.json`.
- [x] 1.6 Run `npm run openspec -- validate route-reviewers-by-change-complexity --strict`, `npm run verify:links`, `npm run verify:comments`, and `npm run verify:findings`.

## 2. Phase 2: implementation, after `normalize-reviewer-keys` reaches `dev`

- [ ] 2.1 Merge `origin/dev` with `normalize-reviewer-keys`; align the pass plans with its canonical reviewer keys and its reviewer assignment text.
- [ ] 2.2 Check that the installed Codex CLI accepts `model_reasoning_effort = "high"` for `gpt-6.1-sol`, and record it.
- [ ] 2.3 Tests first, recorded as failing on the pre-implementation commit: `test/review-route-rules.test.ts` (every rule table row and trigger), `test/review-route-features.test.ts` (derivations against a temporary git repository), `test/review-route-jev.test.ts` (recorded response on a local server, the request allowlist, every failure code, the sentinel credential), `test/review-route-command.test.ts` (with the fake router), `test/review-route-effect.test.ts`, and `test/review-route-evaluation.test.ts` (no future history).
- [ ] 2.4 Implement `scripts/review-route.ts`, `scripts/review-route-rules.ts`, `scripts/review-route-features.ts`, `scripts/review-route-jev.ts`, `scripts/review-route-command.ts`, `scripts/review-route-effect.ts`, and `scripts/review-route-evaluation.ts`, each with a runner that phase 3 dispatches.
- [ ] 2.5 Add `docs/review-findings/route-evaluation.schema.json`.
- [ ] 2.6 Measure the coverage of the new modules (at least 75% of lines, branches, and functions) and record it.
- [ ] 2.7 Run the offline evaluation with `--rule-only`; once the owner has set `JEV_MAF_LAB`, run it with the shadow router and record `evaluation.jsonl` and the figures in `verification.md`.

## 3. Phase 3: integration after `adopt-process-performance-recommendations` reaches `dev`

- [ ] 3.1 Merge `origin/dev` and reconcile the deltas with governance version 6 and its conditional pass 3.
- [ ] 3.2 Wire `route` and `route-evaluation` into `scripts/findings.ts`, validate `route.json`, and extend `effect` (`design.md` "Planned edits").
- [ ] 3.3 Update `docs/governance.md` (routed effort under the reviewer assignment, shadow decides nothing), `docs/agent-task-protocol.md` (worker step, record, effect, invocations), the `Makefile` comment, and the `taskelith-task-protocol` and `taskelith-coordinator` skills.
- [ ] 3.4 Run `make findings ARGS="route --change route-reviewers-by-change-complexity"` on this change and commit its `route.json`.
- [ ] 3.5 Run `make verify`, `npm run openspec -- validate --all --strict`, and the findings validation; complete `verification.md`.

## 4. Review and archive

- [ ] 4.1 Author self-check against the review checklist and ADR 0004, and the evidence check.
- [ ] 4.2 Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed, each recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`.
- [ ] 4.3 Archive the change in the last commit of the branch.
