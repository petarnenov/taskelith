# Verification: route-reviewers-by-change-complexity

## Scope and source

Coordinator brief of 2026-10-28, size M, relaying the owner's idea of the same day and the plan agreed with the coordinator: choose the reviewer and effort of each change by its complexity before review, with a deterministic rule router as the permanent floor, a TypeSafe AI Jev adapter in shadow mode only, a hexagonal port `ReviewRouter`, the command `make findings ARGS="route --change <name>"`, and measurement through `effect` and a one-time offline evaluation. Out of scope: letting Jev decide above the floor. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `/docs/agent-task-protocol.md`, in the git worktree `route-reviewers-by-change-complexity` on the branch of the same name. Base revision: `3f23516a` on `dev`.

Phase 1: research, design, and contract. Phase 2, recorded below: the port, the rule and Jev routers, the feature derivation, the record, and the command runner, tested, with the coordinator's decisions of 2026-10-28 applied (`design.md` "Decisions" and "Phase 2 scope"); in its second step, the routing figures, the offline evaluation, and its rule-only run over the archive. The `effect` per-change rows and the dispatch from `scripts/findings.ts` wait for phase 3. Sequencing: `docs/governance.md`, `docs/agent-task-protocol.md`, and `scripts/findings.ts` are left untouched until `adopt-process-performance-recommendations` lands on `dev`; their edits are planned in `design.md` "Planned edits". Phase 3, recorded below: the merge of `dev` with `adopt-process-performance-recommendations` and the reconciliation of the deltas, the dispatch and validation in `scripts/findings.ts`, the routing rows of `effect`, the documentation and skill edits, and this change's own `route.json`. The live shadow evaluation (`tasks.md` 2.10) is not part of phase 3. Commit types `docs` (phase 1), `chore`, and `test`: nothing here is in the published package.

## Review plan

- Reviewer A, passes 1 and 3: Claude Code (claude-fable-5-1), because the review depends on external facts (the Jev API, terms, and pricing in `design.md` "External facts") and governance "External facts" requires network access, which Codex CLI (gpt-6.1-sol) lacks.
- Reviewer B, pass 2: Claude Code (claude-opus-5-5), effort `high`.
- The two share a harness, which the owner's reviewer assignment of 2026-10-27 allows for tasks that need network access (on the branch `normalize-reviewer-keys`, not yet on `dev` at the base revision).

## Checks

Phase 1, on the working tree before the phase 1 commit:

- `make findings ARGS="checklist --capability review-process,agent-task-protocol --files scripts/** --save route-reviewers-by-change-complexity --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --size M"`: `Saved the checklist to openspec/changes/route-reviewers-by-change-complexity/checklist.json.`; its printed text is in `design.md` "Review checklist".
- `docs/review-findings/route.schema.json` compiles with ajv 2020 in strict mode next to the finding and checklist schemas, accepts a sample record with a failed and with an answered shadow, and rejects an unknown property (scratch script, not committed).

- `npm run openspec -- validate route-reviewers-by-change-complexity --strict`: `Change 'route-reviewers-by-change-complexity' is valid`.
- Requirement bodies: 486, 452, 405, 462, 258, 448, 397, and 430 characters in the `review-process` delta, 413 in the `agent-task-protocol` delta.
- `npm run verify:links`: `Every checked link conforms.`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run verify:findings`: `Every findings file is valid: 53 file(s); every pass summary file is valid: 33 file(s).`
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`
- `make verify` was not run in phase 1: the phase changes no code, test, or build input, and the full test suite runs in phase 2.

Phase 2, on the branch after the merge of `origin/dev` at `92516221` (`975e28c0`), which brought `normalize-reviewer-keys` (#377); `package-lock.json` did not change in the merge. Node.js 24.22.1 through `nvm use`.

- Codex effort (task 2.2): the installed Codex CLI 0.163.0's local model catalog, `~/.codex/models_cache.json` (`client_version` 0.163.0, `fetched_at` 2026-10-27T22:10:41Z), read offline, lists the supported reasoning levels of `gpt-6.1-sol` as `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. No model was invoked.
- Tests first: commit `967a5324` adds the tests without the modules. With `scripts/review-route*.ts` absent, `node --experimental-strip-types --test test/review-route*.test.ts` exits 1: `tests 5`, `pass 0`, `fail 5`, every file failing with `ERR_MODULE_NOT_FOUND` for a `scripts/review-route*.ts` module. This shows only that the tests need the modules; the behaviour each test protects is listed in `tasks.md` 2.4.
- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/review-route*.ts' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 test/review-route*.test.ts`: exit 0, `tests 98`, `pass 98`, `fail 0`. Coverage (lines, branches, functions): `review-route.ts` 100, 100, 100; `review-route-rules.ts` 100, 100, 100; `review-route-features.ts` 100, 98.70, 100; `review-route-environment.ts` 100, 100, 100; `review-route-jev.ts` 100, 98.84, 96.67; `review-route-record.ts` 100, 100, 100; `review-route-command.ts` 97.74, 92.11, 100 (uncovered: the rethrow of a write error other than an existing file); all files 99.68, 98.19, 99.20.
- No live call: no test reaches `https://api.typesafe.ai`. `JevRouter` runs against an injected `fetch` and a local `node:http` server on `127.0.0.1`; the composed command runs only with an empty environment, so its shadow fails with `missing-credential` before any request. The recorded response is constructed from the OpenAPI document, as `test/fixtures/review-route/README.md` states.
- `npm run openspec -- validate route-reviewers-by-change-complexity --strict`: `Change 'route-reviewers-by-change-complexity' is valid`.
- Requirement bodies after the decisions: 486, 471, 418, 461, 258, 448, 397, and 497 characters in the `review-process` delta, 479 in the `agent-task-protocol` delta.
- `make verify` with `TMPDIR` on a disk directory under the session scratchpad. The first run, on `2b8f0c1f` with these records uncommitted, failed in `npm run check:boundaries`: `test/review-route-features.test.ts(123,71): error TS7053`, an untyped fixture map in a test; `61565ce1` types it. The second run, on `61565ce1` with these records uncommitted, exited 0: comments within the rule; `Every findings file is valid: 54 file(s); every pass summary file is valid: 34 file(s).`; `npm test` `tests 2462`, `pass 2415`, `fail 0`, `cancelled 0`, `skipped 47`, product coverage all files 99.29 lines, 92.33 branches, 98.94 functions, `Every product module is in the coverage report.`; `Verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)`; `openspec validate --all --strict` `Totals: 70 passed, 0 failed (70 items)`; `Every checked link conforms.`; `Every active OpenSpec change archives into strictly valid specs.`; and the package check passed. `npm test` does not run `scripts/` coverage; the new modules' coverage is the separate measurement above.

Phase 2, second step (`tasks.md` 2.7 to 2.9 and 2.11), on `f9571017` with these records uncommitted. Node.js 24.22.1 through `nvm use`.

- Tests before the modules: commit `4f2ad4bd` adds `test/review-route-effect.test.ts` and `test/review-route-evaluation.test.ts` without the modules. With the uncommitted modules set aside (`git stash push -u`), `node --experimental-strip-types --test test/review-route-effect.test.ts test/review-route-evaluation.test.ts` exits 1: `tests 2`, `pass 0`, `fail 2`, each file failing with `ERR_MODULE_NOT_FOUND` for `scripts/review-route-effect.ts` or `scripts/review-route-evaluation.ts`. The tests were written next to the modules and committed first; this shows only that they need the modules.
- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/review-route*.ts' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 test/review-route*.test.ts`: exit 0, `tests 136`, `pass 136`, `fail 0`. Coverage (lines, branches, functions) of the new modules: `review-route-effect.ts` 100, 100, 100; `review-route-evaluation.ts` 100, 97.10, 98.28 (uncalled: the live retry delay of the composition root); `review-route-environment.ts`, with the evaluation adapter, 100, 97.87, 100; `review-route-features.ts`, with `featuresAt`, 100, 98.81, 100; all files 99.82, 98.00, 99.15.
- No live call: the evaluation tests use `FakeRouter` and an in-memory or temporary git history; the composed dependencies are built with an empty environment, where the shadow router is absent and the command refuses to run without `--rule-only`, and with a sentinel credential, where the `JevRouter` is constructed but never called.
- `npm run openspec -- validate route-reviewers-by-change-complexity --strict`: `Change 'route-reviewers-by-change-complexity' is valid`. `npm run verify:findings`: `Every findings file is valid: 54 file(s); every pass summary file is valid: 34 file(s).` `npm run verify:links`: `Every checked link conforms.`
- `make verify` with `TMPDIR` on a disk directory under the session scratchpad, on `f9571017` with these records uncommitted: exit 0. Comments within the rule; `Every findings file is valid: 54 file(s); every pass summary file is valid: 34 file(s).`; `npm test` `tests 2500`, `pass 2453`, `fail 0`, `cancelled 0`, `skipped 47`, product coverage all files 99.29 lines, 92.34 branches, 98.94 functions, `Every product module is in the coverage report.`; `Verified 731 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)`; `openspec validate --all --strict` `Totals: 70 passed, 0 failed (70 items)`; `Every checked link conforms.`; `Every active OpenSpec change archives into strictly valid specs.`

### Rule-only offline evaluation

`scripts/findings.ts` does not dispatch `route-evaluation` before phase 3, so the run called `runRouteEvaluation(['--rule-only', '--at', '3f23516a2e4ef8724f38e5c9c67267225f40ff16', '--save', 'route-reviewers-by-change-complexity'], root, routeEvaluationDependencies(root, {}))` from a scratch runner outside the repository, with an empty environment: no credential, no shadow router, no request. Exit 0; it wrote `evaluation.jsonl` (50 lines) and printed:

```text
Route evaluation of 50 archived change(s) as of 3f23516a2e4ef8724f38e5c9c67267225f40ff16, in merge order.
Features of the revision that pass 1 reviewed; 0 approximate from the merged diff.
Excluded: align-product-ports-with-g2-lifecycle (several-artifacts), revalidate-g3-foundations (several-artifacts).
All: 50 change(s), third pass 16 (32%), mean passes 1.92, pass-1 findings per change 3.96, medium or worse in passes 1-2 per change 2.08
  rule standard: 23 change(s), third pass 3 (13%), mean passes 1.61, pass-1 findings per change 3.17, medium or worse in passes 1-2 per change 1.09
  rule elevated: 27 change(s), third pass 13 (48%), mean passes 2.19, pass-1 findings per change 4.63, medium or worse in passes 1-2 per change 2.93
  shadow: no answer (answered 0, failed 0, skipped 50)
  under 100 lines: 22 change(s), third pass 3 (14%), mean passes 1.64, pass-1 findings per change 3.18, medium or worse in passes 1-2 per change 1.23
  100 to 399 lines: 17 change(s), third pass 6 (35%), mean passes 1.94, pass-1 findings per change 3.94, medium or worse in passes 1-2 per change 1.82
  400 lines and more: 11 change(s), third pass 7 (64%), mean passes 2.46, pass-1 findings per change 5.54, medium or worse in passes 1-2 per change 4.18
With pass summaries: 30 change(s), third pass 12 (40%), mean passes 2.07, pass-1 findings per change 3.73, medium or worse in passes 1-2 per change 2.57
  rule standard: 14 change(s), third pass 2 (14%), mean passes 1.57, pass-1 findings per change 2.64, medium or worse in passes 1-2 per change 0.93
  rule elevated: 16 change(s), third pass 10 (63%), mean passes 2.50, pass-1 findings per change 4.69, medium or worse in passes 1-2 per change 4.00
  shadow: no answer (answered 0, failed 0, skipped 30)
Without pass summaries, lower bounds: 20 change(s), third pass 4 (20%), mean passes 1.70, pass-1 findings per change 4.30, medium or worse in passes 1-2 per change 1.35
  rule standard: 9 change(s), third pass 1 (11%), mean passes 1.67, pass-1 findings per change 4.00, medium or worse in passes 1-2 per change 1.33
  rule elevated: 11 change(s), third pass 3 (27%), mean passes 1.73, pass-1 findings per change 4.54, medium or worse in passes 1-2 per change 1.36
  shadow: no answer (answered 0, failed 0, skipped 20)
Saved the evaluation to openspec/changes/route-reviewers-by-change-complexity/evaluation.jsonl.
```

Comparison with the in-sample figures of `design.md` "Archived statistics" (same 50 changes, same outcomes):

| Figure | Phase 1, in-sample | Rule-only evaluation |
| --- | --- | --- |
| Third pass, all | 16 of 50 (32%) | 16 of 50 (32%) |
| Under 100 lines | 1 of 20 (5%) | 3 of 22 (14%) |
| 100 to 399 lines | 7 of 18 (39%) | 6 of 17 (35%) |
| 400 lines and more | 8 of 12 (67%) | 7 of 11 (64%) |
| `elevated` | 9 of 17 (53%) | 13 of 27 (48%) |
| `standard` | 7 of 33 (21%) | 3 of 23 (13%) |
| With `passes.jsonl`, `elevated` against `standard` | 7 of 11 against 5 of 19 | 10 of 16 against 2 of 14 |

The differences have two causes, checked by a scratch script (not committed) that reran the evaluation and diffed each merge:

- Lines bands. Phase 1 took the merged diff; the evaluation takes the revision that pass 1 reviewed, as `design.md` "Offline evaluation" asks, which every one of the 50 branches names, so none is approximate. Review fixes and archived spec updates leave it smaller. Three changes that needed a third pass move down a band: `alternate-reviewers-per-pass` (103 to 41 lines) and `stop-placement-pass-at-fleet-decline` (105 to 85) into under 100, and `align-slot-credential-delivery` (718 to 138) into 100 to 399.
- Tiers. The phase 1 figures did not apply the `contracts` trigger as "Features" defines it: they counted one contract change, while `docs/contracts/**` matches 18 of the 50 at their reviewed revision. The trigger alone elevates 12 changes, of which 4 needed a third pass; with the `contracts` trigger left out, the evaluation gives 9 of 15 `elevated` and 7 of 35 `standard`, close to phase 1. The `lines` trigger fires on 11 changes (7 third passes), `files` on 5 (3), `security` on 4 (2), `docker` on 2 (1), `capabilities` on 2 (1), and `contracts` on 18 (9). The rule is unchanged; `design.md` "Archived statistics" records the correction, and "Decisions" 8 the coordinator's decision to keep the trigger.

Both figures remain in-sample: the thresholds were read off these records. As of the branch's merge base `92516221` the archive holds 51 such changes (with `normalize-reviewer-keys`): 17 third passes (33%), `standard` 4 of 24, `elevated` 13 of 27 (printed, not saved).

## Remaining gates

- Owner hard floor, confirmed: on 2026-10-28 the owner confirmed in the coordinator's session, relayed verbatim by the coordinator, the TypeSafe account, the acceptance of the Master Customer Agreement with its paid credits (8.2), and the consent to send the structured features (`design.md` "Owner actions" and "Decisions" 6). The coordinator installed `JEV_MAF_LAB` on this worker's host; its presence was checked by name only. The live offline evaluation waits for the merge of `dev` in phase 3 (`tasks.md` 2.10).
- A later governance change that the owner approves before the elevated efforts may apply (`design.md` "Decisions" 1).
- Phase 3 integration (`tasks.md` 3.1 to 3.5), including the dispatch of `route` and `route-evaluation` from `scripts/findings.ts` and the per-change routing rows of `effect`; author self-check and evidence check; independent review; archive.
- Integration into dev by the coordinator (single pull request).
