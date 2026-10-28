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

Since the live run of task 2.10, `evaluation.jsonl` holds that run ("Live shadow evaluation" below) and no longer the rule-only lines: `--save` refuses an existing file, and the live run evaluates the same 50 changes at the same revision. The rule-only figures above stay as printed; apart from `shadow`, every line of the live file equals the rule-only line of the same change (checked by a scratch script, not committed, against a copy of the rule-only file).

Both figures remain in-sample: the thresholds were read off these records. As of the branch's merge base `92516221` the archive holds 51 such changes (with `normalize-reviewer-keys`): 17 third passes (33%), `standard` 4 of 24, `elevated` 13 of 27 (printed, not saved).

### Phase 3

On the branch after the merge of `origin/dev` at `f3a53f17` (#383, `adopt-process-performance-recommendations`), merge commit `d173634c`. The merge had no conflict; `package-lock.json` changed in it (383 insertions, 1 deletion), and `make setup` passed (`All checks passed.`). Node.js 24.22.1.

- Reconciliation (`db70cdaa`, `design.md` "Phase 3 reconciliation"). Both deltas only add requirements, and `dev` added none of the same name, so no delta rebases on `dev`'s text. "Review route in the task flow" now routes once the implementation is committed and before the `make verify` run that `make record` records for pass 1, because `make record-check` fails on any file outside the change's `verification.md`, `tasks.md`, `findings.jsonl`, and `passes.jsonl` that changed after the recorded run. "Route effect" counts a review that the conditional third pass ended after pass 2 as two passes, with a new scenario. Requirement bodies after the reconciliation: 486, 471, 418, 461, 258, 448, 479, and 497 characters in the `review-process` delta, 484 in the `agent-task-protocol` delta.
- Tests first: commit `a69553e0` adds `test/findings-route.test.ts` without the implementation. On it, `node --experimental-strip-types --test test/findings-route.test.ts` exits 1: `tests 12`, `pass 1`, `fail 11`. The 11 fail on behaviour, not on a missing module: `USAGE` lacks the two commands, the script answers `unknown command "route"` and `unknown command "route-evaluation"`, the routing modules import `./findings.ts`, `validate` neither reports invalid `route.json` files nor counts them, and `effect` has no routing section. The one that passes, "the script still runs the other commands", guards the existing commands. The implementation commit `227dfec8` adds `route` to the expected row of one effect test, because the row now also names the recommended reviewers.
- Implementation (`227dfec8`): `scripts/findings-common.ts` holds `ajvSchemaCheck`, `SCHEMA_PATH`, and `RunResult`, which `scripts/findings.ts` re-exports, so `review-route-command.ts` and `review-route-evaluation.ts` no longer import `findings.ts`; `runFindingsCommand` dispatches `route` and `route-evaluation` with their arguments unparsed; `checkRoutes` in `review-route-record.ts` validates every `route.json`; `scripts/review-route-report.ts` builds the routing rows of `effect`; `reviewOutcome` moved to `review-route-effect.ts`. The four test helpers that copy the record schemas also copy the route schema, and three tests expect the route file count in the `validate` line.
- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/review-route*.ts' --test-coverage-include='scripts/findings*.ts' --test-coverage-include='scripts/checklist-commands.ts' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 test/review-route*.test.ts test/findings*.test.ts test/checklist*.test.ts`: exit 0, `tests 200`, `pass 200`, `fail 0`. Coverage (lines, branches, functions) of the new and changed files: `findings-common.ts` 100, 100, 100; `findings.ts` 100, 98.08, 100; `checklist-commands.ts` 100, 97.30, 100; `review-route-report.ts` 100, 97.67, 94.74; `review-route-effect.ts` 100, 98.55, 100; `review-route-record.ts` 100, 100, 100; `review-route-evaluation.ts` 100, 97.67, 98.15; `review-route-command.ts` 97.74, 94.59, 100 (uncovered: lines 108 to 110, the rethrow of a write error other than an existing file); all files 99.88, 98.15, 99.15. The dispatch tests run the script as a child process with only `PATH` in its environment, so no credential reaches it and no request is sent.
- Documentation (`8c07e22f`): governance "Routed effort" under the reviewer assignment, which authorizes no elevated effort; worker steps 4 and 5, "Route record", the routing part of "Checklist effect", and the `<effort from route.json>` invocations in `/docs/agent-task-protocol.md`; the `Makefile` comment; and the `taskelith-task-protocol` and `taskelith-coordinator` skills. The governance policy version stays 6. Review pass 1 changed this: the coordinator's decision 10 of `design.md` "Decisions" makes "Routed effort" policy version 7 ("Review pass 1" below).
- Route of this change (`939de6b0`): `env -u JEV_MAF_LAB make findings ARGS="route --change route-reviewers-by-change-complexity"`, run with the credential variable removed from the command's environment, so no request was sent. Exit 0; it printed `route: elevated (lines, files), rule version 1`, `pass 1, reviewer A: claude claude-fable-5-1#high`, `pass 2, reviewer B: claude claude-opus-5-5#xhigh`, `shadow: failed (missing-credential); the rule decided alone`, and on stderr the `missing-credential` hint. Features: 4042 lines in 36 files against `f3a53f17`, at head `8c07e22f`, external facts, size M. Reviewer A matches the brief; the elevated efforts are not authorized, so the review runs at the configured efforts (governance "Routed effort").
- `make verify` with `TMPDIR` under the session scratchpad, on `dbba3f5b`, full profile, log at `/tmp/claude-1000/-home-petar-taskelith/b4ff37b6-62f5-4072-b2f1-67a3e58285b6/scratchpad/rr-verify.log`: exit 0, `make verify: passed, profile full, tree 468985447f8578520ad993243fa804a7f8bf13d0; stamp written`; `tests 2816`, `pass 2769`, `fail 0`, `cancelled 0`, `skipped 47`; product coverage all files 99.32 lines, 92.62 branches, 98.98 functions; `Verified 766 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)`; `Totals: 70 passed, 0 failed (70 items)`; `Every checked link conforms.`; `Every active OpenSpec change archives into strictly valid specs.` An earlier run on `939de6b0` passed with the same counts but wrote no stamp, because this record was edited during it.
- `make record CHANGE=route-reviewers-by-change-complexity LOG=<that log>`: `make record: wrote the generated part of openspec/changes/route-reviewers-by-change-complexity/verification.md`. `make record-check CHANGE=route-reviewers-by-change-complexity`: `make record-check: the generated part matches the tree`.
- `npm run openspec -- validate --all --strict`: `Totals: 70 passed, 0 failed (70 items)`. `make findings ARGS="validate"`: `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s); every route file is valid: 1 file(s).`

### Live shadow evaluation

Task 2.10, on 2026-10-28, on `13a67c64` with `evaluation.jsonl` deleted from the working tree, after the owner's confirmation of the TypeSafe account, the Master Customer Agreement with paid credits, and the data consent (`b0c5a182`, `design.md` "Decisions" 6), and the owner's confirmation of this live run in the worker's session. Node.js 24.22.1 through `make findings`. The credential came from the login shell's profile and was checked by name only; its value was never printed or recorded.

Command:

```text
bash -lc 'cd /home/petar/taskelith-worktrees/route-reviewers-by-change-complexity && NODE_OPTIONS=--import=file:///tmp/claude-1000/-home-petar-taskelith/b4ff37b6-62f5-4072-b2f1-67a3e58285b6/scratchpad/jev-tap/tap.mjs make findings ARGS="route-evaluation --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16 --save route-reviewers-by-change-complexity"'
```

`bash -lc` supplies `JEV_MAF_LAB` from the profile. `tap.mjs`, a scratch measurement module outside the repository, wraps `fetch` for `https://api.typesafe.ai/` only: it records each response's HTTP status and its body's `usage` and top-level keys, keeps the first 2xx body, and ends the process on HTTP 401, 402, or 403 before more requests go out. It never reads request or response headers. It was needed because the adapter keeps neither `usage` nor the body ("Author self-check and evidence check" below). Its stdout and stderr went to files next to the tap; stderr was empty. Exit 0; it wrote `evaluation.jsonl` (50 lines) and printed:

```text
Route evaluation of 50 archived change(s) as of 3f23516a2e4ef8724f38e5c9c67267225f40ff16, in merge order.
Features of the revision named by the branch's first "pass 1" commit; 0 approximate from the merged diff.
Excluded: align-product-ports-with-g2-lifecycle (several-artifacts), revalidate-g3-foundations (several-artifacts).
All: 50 change(s), third pass 16 (32%), mean passes 1.92, pass-1 findings per change 3.96, medium or worse in passes 1-2 per change 2.08
  rule standard: 23 change(s), third pass 3 (13%), mean passes 1.61, pass-1 findings per change 3.17, medium or worse in passes 1-2 per change 1.09
  rule elevated: 27 change(s), third pass 13 (48%), mean passes 2.19, pass-1 findings per change 4.63, medium or worse in passes 1-2 per change 2.93
  shadow standard: 21 change(s), third pass 3 (14%), mean passes 1.67, pass-1 findings per change 3.29, medium or worse in passes 1-2 per change 1.19
  shadow elevated: 29 change(s), third pass 13 (45%), mean passes 2.10, pass-1 findings per change 4.45, medium or worse in passes 1-2 per change 2.72
  shadow: answered 50, failed 0, skipped 0; agreement 48 of 50 (96%), kappa 0.92
  shadow: Brier score of P(elevated) 0.32, mean absolute error of passes 0.72
  under 100 lines: 22 change(s), third pass 3 (14%), mean passes 1.64, pass-1 findings per change 3.18, medium or worse in passes 1-2 per change 1.23
  100 to 399 lines: 17 change(s), third pass 6 (35%), mean passes 1.94, pass-1 findings per change 3.94, medium or worse in passes 1-2 per change 1.82
  400 lines and more: 11 change(s), third pass 7 (64%), mean passes 2.46, pass-1 findings per change 5.54, medium or worse in passes 1-2 per change 4.18
With pass summaries: 30 change(s), third pass 12 (40%), mean passes 2.07, pass-1 findings per change 3.73, medium or worse in passes 1-2 per change 2.57
  rule standard: 14 change(s), third pass 2 (14%), mean passes 1.57, pass-1 findings per change 2.64, medium or worse in passes 1-2 per change 0.93
  rule elevated: 16 change(s), third pass 10 (63%), mean passes 2.50, pass-1 findings per change 4.69, medium or worse in passes 1-2 per change 4.00
  shadow standard: 13 change(s), third pass 2 (15%), mean passes 1.61, pass-1 findings per change 2.77, medium or worse in passes 1-2 per change 1.00
  shadow elevated: 17 change(s), third pass 10 (59%), mean passes 2.41, pass-1 findings per change 4.47, medium or worse in passes 1-2 per change 3.77
  shadow: answered 30, failed 0, skipped 0; agreement 29 of 30 (97%), kappa 0.93
  shadow: Brier score of P(elevated) 0.24, mean absolute error of passes 0.74
Without pass summaries, lower bounds: 20 change(s), third pass 4 (20%), mean passes 1.70, pass-1 findings per change 4.30, medium or worse in passes 1-2 per change 1.35
  rule standard: 9 change(s), third pass 1 (11%), mean passes 1.67, pass-1 findings per change 4.00, medium or worse in passes 1-2 per change 1.33
  rule elevated: 11 change(s), third pass 3 (27%), mean passes 1.73, pass-1 findings per change 4.54, medium or worse in passes 1-2 per change 1.36
  shadow standard: 8 change(s), third pass 1 (13%), mean passes 1.75, pass-1 findings per change 4.13, medium or worse in passes 1-2 per change 1.50
  shadow elevated: 12 change(s), third pass 3 (25%), mean passes 1.67, pass-1 findings per change 4.42, medium or worse in passes 1-2 per change 1.25
  shadow: answered 20, failed 0, skipped 0; agreement 19 of 20 (95%), kappa 0.90
  shadow: Brier score of P(elevated) 0.44, mean absolute error of passes 0.69
Saved the evaluation to openspec/changes/route-reviewers-by-change-complexity/evaluation.jsonl.
```

Figures, from that output, `evaluation.jsonl`, and the tap's record (a scratch script, not committed, read the last two):

- Agreement with the rule router: 48 of 50 tiers (96%), kappa 0.92; with pass summaries 29 of 30 (97%), kappa 0.93; without, 19 of 20 (95%), kappa 0.90. Both disagreements are rule `standard` and Jev `elevated`: `require-finding-capability` (183 lines, 9 files, P(`elevated`) 0.52) and `scope-review-passes-by-artifact` (282 lines, 10 files, 0.74); neither needed a third pass.

| Third pass, all 50 | `standard` | `elevated` |
| --- | --- | --- |
| Rule version 1 | 3 of 23 (13%) | 13 of 27 (48%) |
| Jev `jev-1.14.0` | 3 of 21 (14%) | 13 of 29 (45%) |

- Shadow failures: none; answered 50, failed 0, skipped 0. All 50 requests returned HTTP 200 on the first try, so no retry ran, and every answer came from `jev-1.14.0`.
- Latency (`shadow.latencyMs`, as `JevRouter` measures it): median 165 ms, max 371 ms (the first request), min 142 ms.
- Tokens, from the `usage` of the 50 response bodies: 26,790 input tokens (535.8 per request; the design estimated about 600) and 2,408 output tokens, which are free. Cost at $0.042 per million input tokens: 26,790 × 0.042 / 1,000,000 = $0.00112518, about a tenth of a cent.
- Every response body had the same top-level keys, `answers`, `model`, and `usage`, as the constructed fixture.
- Jev elevates all 12 changes that the `contracts` trigger alone elevates (4 of them needed a third pass). P(`elevated`) ranged from 0 to 0.99, the tier confidence from 0.04 to 1, and the expected passes from 1.04 to 2.69. The Brier score 0.32 of P(`elevated`) against a third pass is above the 0.2176 of the constant base rate 0.32 (scratch computation): P(`elevated`) is a tier probability, not a calibrated probability of a third pass.
- Credential checks, each printing only a count: `bash -lc 'grep -cF -- "$JEV_MAF_LAB" <file>'` printed 0 for `evaluation.jsonl` and for every tap output (the usage record, the first body, the command's stdout, and its stderr), and `git diff --cached | bash -lc 'grep -cF -- "$JEV_MAF_LAB"'` printed 0 before every commit of this task.

Fixture (`fee4d7fa`): `test/fixtures/review-route/jev-systemone-response.json` is now the first body the tap kept, the answer for `record-review-findings`, byte for byte: it holds no credential, request ID, or account or organization identifier, so nothing was removed, and no header was stored. Its shape matches the constructed fixture field for field, so the adapter's mapping needed no change. Only the values differ (confidence 0.66, probabilities 0.17 and 0.83, an integral score 1.0), so `the recorded response maps to an answered shadow decision` in `test/review-route-jev.test.ts` expects them, and the test's comment and the fixture `README.md` say the body was captured live on 2026-10-28 from `jev-1.14.0`. `env -u JEV_MAF_LAB node --experimental-strip-types --test test/review-route-jev.test.ts`: `tests 32`, `pass 32`, `fail 0`.

Records (`b4898f08`): the new `evaluation.jsonl`; `design.md` "Coverage" names the captured fixture, and "Live shadow results" under "Offline evaluation" records that the shadow suggests no change for rule version 2. Rule version 1 is unchanged.

Re-route: the fixture, the test, `design.md`, and `evaluation.jsonl` change the diff features (4117 to 4099 changed lines; 36 files, the flags, the triggers, and the tier unchanged), so `7678f6b3` deletes `route.json` and `05f0caec` records the new one from `env -u JEV_MAF_LAB make findings ARGS="route --change route-reviewers-by-change-complexity"`: exit 0, `route: elevated (lines, files), rule version 1`, `pass 1, reviewer A: claude claude-fable-5-1#high`, `pass 2, reviewer B: claude claude-opus-5-5#xhigh`, `shadow: failed (missing-credential); the rule decided alone`, at head `7678f6b3` against `f3a53f17`.

## Author self-check and evidence check

Task 4.1 was not recorded before review pass 1. The author did it on 2026-10-28, after pass 1 and its fixes and before pass 2, on `05f0caec`; it does not replace the check that governance asks for before the first pass.

Review checklist (`checklist.json`):

- **contract-drift.** The rule table, the deltas, `route.schema.json`, and `route-evaluation.schema.json` agree; the writers validate before writing, and validation keeps one reviewer table per rule version (pass 1 M1). The fixture now is a real response with the documented fields, so the parser's contract is confirmed against the service.
- **error-handling.** Every shadow failure maps to a closed code, and the rule decision is always written. Observation, not fixed (outside this task): `route-evaluation` does not stop on HTTP 401, 402, or 403; with a bad key or no credits it would send all 50 requests and record 50 `http-error` lines. The live run guarded this with the tap.
- **docs.** `design.md` "Coverage", the fixture `README.md`, and this record describe the captured fixture; "Remaining gates" is updated.
- **redaction.** The credential stays in `Credential`, and no output, record, or fixture holds it (the counts above). The tap stored no header.
- **missing-fail-before-test.** No behaviour changed in this task: the fixture swap changed expected values only, so no fail-before run applies.
- **naming.** One term per concept, as `design.md` "Review checklist" lists.
- **process.** Tasks 2.10 and 4.1 are ticked with their evidence; the re-route follows worker step 4.
- **Record quality.** Every figure of "Live shadow evaluation" comes from the command output or from the scratch reads named next to it.

ADR 0004:

- Clean Code and hexagonal architecture: the routers are adapters of `ReviewRouter`, the git access is behind `RouteEnvironment`, and composition roots read the credential. SOLID: no shared conformance suite runs every `ReviewRouter` adapter (`RuleRouter`, `JevRouter`, `FakeRouter`); each has its own tests. Observation, not fixed.
- Microkernel: the routers are repository tooling under `scripts/`, not product plugins; not applicable.
- Docker: no runnable component is added; not applicable.
- OpenAPI: no Taskelith HTTP API is added; the client follows TypeSafe's OpenAPI document, and `route.json` and `evaluation.jsonl` have JSON schemas.
- Makefile: `make findings ARGS="route ..."` and `ARGS="route-evaluation ..."`.
- OpenSpec: this change.
- Coverage: the new modules at least 75% of lines, branches, and functions ("Pass 1 fixes"); `make verify` checks product coverage.
- Observation: the evaluation keeps no `usage` from the responses, so its cost is not in its output or `evaluation.jsonl`; the tap measured it.

Evidence check: every external link of the change's records and of the fixture `README.md` is labeled as an unversioned page or pinned (`typesafe-sdk-js` at tag `v0.7.0`); the API endpoints are named as endpoints, not cited as sources. `npm run verify:links`: `Every checked link conforms.`

## Independent review

Reviewer A, passes 1 and 3: Claude Code (`claude-fable-5-1`), because the review depends on external facts (governance "External facts" and "Reviewer assignment"); reviewer B, pass 2: Claude Code (`claude-opus-5-5`, effort `high`). `route.json` recommends `high` for reviewer A and `xhigh` for reviewer B (tier `elevated`); governance "Routed effort" does not authorize them, so the passes run at the configured efforts.

### Review pass 1

- **Reviewer:** A, Claude Code, model `claude-fable-5-1`, effort `medium`, permission mode `plan`, editing tools disallowed, session `2312677b-a5e1-4977-8400-cfe1bd02b090`; run by the coordinator.
- **Revision reviewed:** `f3a53f17...7cecc59a`.
- **Invocation:** `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null`, with the credential variable removed from the reviewer's environment.
- **Model confirmation:** `claude-fable-5-1` in the `modelUsage` of the last `"type":"result"` line, beside `claude-haiku-5-5`, which the harness uses internally.
- **Snapshot:** before and after the pass `dc1036f2…`, unchanged, as the coordinator reported it.
- **Result:** Critical 0, High 0, Medium 1, Low 9, as in `passes.jsonl` line 1 and `findings.jsonl` lines 1 to 10. File lines are those of `7cecc59a`. Low findings came with a Medium one, so all ten go to reviewer B in pass 2 and their outcome is `fixed`.
- **M1, contract-drift** (`scripts/review-route-record.ts:58`): validation compared every `route.json`, archived ones included, with the current reviewer table, so the first change of a reviewer, model, or effort would fail every archived record. Fixed in `d2468c1b`: `REVIEWER_TABLES` in `scripts/review-route.ts` keeps one table per rule version, `RULE_VERSION` moved there, `passPlans` gives the current version's plans, and `versionedPassPlans` a given version's; the rule's and an answered shadow's plans are checked against the table of the record's `rule.version`, and a version without a table is reported. `design.md` "Route record" says that a table change bumps `RULE_VERSION` and keeps the older tables; the `review-process` delta "Route record" and the protocol's "Route record" name the table of the rule version (`0770df0d`, `3c93b19c`). Test `a rule version without a reviewer table is reported` (`test/review-route-record.test.ts`); after the fix, `the current plans are those of the current rule version` and `rule version 1 keeps its reviewer table` (`test/review-route-rules.test.ts`).
- **L1, stale-citation** (`design.md:343`, `:293`, `tasks.md:14`): fixed in `0770df0d`. Decision 2 is marked as amended by decision 9 (the coordinator's D1), and the planned protocol edit and task 2.3 now route once the implementation is committed and before the recorded `make verify`.
- **L2, spec-wording** (`specs/review-process/spec.md:4`): fixed in `0770df0d`. "Review route command" gives exit 1 for an unknown change and exit 2 for `archive` or a name not shaped as a change name, with the new scenario "Archive as the change", which `test/review-route-command.test.ts` already covers (`usage error exits 2: ["--change","archive"]`); `design.md` "Failure semantics" agrees. Requirement body 496 characters.
- **L3, redaction** (`scripts/review-route-environment.ts:15`): `d7a5d4c7` extracts `gitEnvironment` unchanged; fixed in `021e52b1`, which also drops `JEV_MAF_LAB` from the git child environment. Test `git children get neither hook variables nor the router credential` (`test/review-route-features.test.ts`), with a sentinel value.
- **L4, evidence-mismatch** (`verification.md:100`): measured again, see "Pass 1 fixes" below. The phase 3 figures were those of Node.js 24.22.1; the reviewer's of 24.22.0.
- **L5, test-flakiness** (`test/review-route-jev.test.ts:236`): fixed in `572e4018`. The test, now `a reset connection is a network failure`, keeps its own server bound on the port and destroys every connection, so no other process can take the port; it passed 15 of 15 isolated runs. It protects no changed behaviour, so it has no fail-before run.
- **L6, docs** (`docs/agent-task-protocol.md:69`): fixed in `3c93b19c`: a change without `route.json` uses the configured effort of governance "Authorized reviewers".
- **L7, process** (`docs/governance.md:3`): resolved by the coordinator's decision D2 (`design.md` "Decisions" 10) and fixed in `3c93b19c`: policy version 7 with the history entry "2026-10-28: version 7 adds routed reviewer effort from `route.json`; no elevated effort authorized", credited to the owner's request and this coordinator-assigned change; "Routed effort" names its source the same way. No other file named version 6 as the current version (searched in `docs/`, `.claude/skills/`, and `AGENTS.md`); the deltas name no version.
- **L8, evidence-mismatch** (`verification.md:54`, `design.md:275`): fixed in `1857600f` and `0770df0d`. The evaluation prints `Features of the revision named by the branch's first "pass 1" commit`, and `design.md` "Offline evaluation" says the same and counts the limitation (see "Pass 1 fixes"). The recorded output of the rule-only run above keeps the wording it was printed with.
- **L9, docs** (`route.json:19`): fixed in `0770df0d`: `design.md` "Risks" records the missed security flag of this change as a known miss and as input to rule version 2.
- **Coordinator decisions** (`design.md` "Decisions" 9 and 10): D1, option (a), routing once the implementation is committed and before the recorded `make verify`, amends decision 2; D2 makes governance policy version 7.

### Pass 1 fixes

Node.js 24.22.1, the `.nvmrc` pin, called by its full nvm path, because `~/.local/bin/node` (24.22.0) comes first on this host's `PATH`. Every command that runs the route code ran under `env -u JEV_MAF_LAB`; no request reached TypeSafe.

- Fail-before: `8761a19e` adds the tests on top of `d7a5d4c7`, before the fixes. On it, `node --experimental-strip-types --test test/review-route-features.test.ts test/review-route-record.test.ts test/review-route-evaluation.test.ts` exits 1: `tests 61`, `pass 58`, `fail 3`, each on behaviour: `git children get neither hook variables nor the router credential` (the environment still holds the sentinel credential), `a rule version without a reviewer table is reported` (no problem reported for version 2), and `--rule-only --save writes valid lines and prints the figures` (the old summary wording). After the fixes the same files pass.
- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/review-route*.ts' --test-coverage-include='scripts/findings*.ts' --test-coverage-include='scripts/checklist-commands.ts' --test-coverage-lines=75 --test-coverage-branches=75 --test-coverage-functions=75 test/review-route*.test.ts test/findings*.test.ts test/checklist*.test.ts` on `572e4018`: exit 0, `tests 204`, `pass 204`, `fail 0`, twice with identical figures. Coverage (lines, branches, functions): `findings-common.ts` 100, 100, 100; `findings.ts` 100, 98.08, 100; `checklist-commands.ts` 100, 97.30, 100; `review-route.ts` 100, 100, 100; `review-route-rules.ts` 100, 100, 100; `review-route-record.ts` 100, 100, 100; `review-route-environment.ts` 100, 97.96, 100; `review-route-features.ts` 100, 98.81, 100; `review-route-jev.ts` 100, 98.84, 96.67; `review-route-report.ts` 100, 97.67, 94.74; `review-route-effect.ts` 100, 98.55, 100; `review-route-evaluation.ts` 100, 97.67, 98.15; `review-route-command.ts` 97.74, 94.59, 100 (uncovered: lines 108 to 110); all files 99.88, 98.18, 99.16. Under Node.js 24.22.0 the same run gives `review-route-evaluation.ts` branches 98.44, and `review-route-command.ts` branches 94.59 in one run and 92.11 in another, all files 98.30 and 98.18: branch coverage of these files depends on the patch version and, under 24.22.0, varies between runs.
- L8 count: a scratch script (not committed) read each of the 50 changes of `evaluation.jsonl`, the `findings.jsonl` of its archive at `3f23516a`, and the `commit` of its pass 1 findings, and asked git whether that commit is a branch commit (not an ancestor of the change's dev commit) contained in the measured revision. 26 changes are measured after at least one pass 1 fix (for example `record-review-findings`, whose measured revision `da5d560f` is itself a pass 1 fix); 18 before any, plus 1 with no pass 1 finding (`close-verify-linux-cgroup-multi-arch`); 5 cannot be told, because their pass 1 findings record no commit (`centralize-log-redaction-rules`, `wire-linux-crash-windows-into-native-acceptance`, `repair-archived-record-links`, `run-hosted-runner-linux-check`, `close-g3-item-0`). The rule-only figures above therefore rest on post-fix revisions for at least 26 of the 50 changes.
- `env -u JEV_MAF_LAB make findings ARGS="route-evaluation --rule-only --at 3f23516a2e4ef8724f38e5c9c67267225f40ff16"` (without `--save`; `evaluation.jsonl` is unchanged): exit 0; it prints `Features of the revision named by the branch's first "pass 1" commit; 0 approximate from the merged diff.`, and every other line equals the recorded output above.
- Re-route: the fixes change the diff features (4042 to 4117 changed lines; 36 files, the flags, the triggers, and the tier unchanged), so as worker step 4 asks, `8ae465c9` deletes `route.json` and `f430cc97` records the new one from `env -u JEV_MAF_LAB make findings ARGS="route --change route-reviewers-by-change-complexity"`: exit 0, `route: elevated (lines, files), rule version 1`, `pass 1, reviewer A: claude claude-fable-5-1#high`, `pass 2, reviewer B: claude claude-opus-5-5#xhigh`, `shadow: failed (missing-credential); the rule decided alone`, at head `8ae465c9` against `f3a53f17`.
- `npm run verify:comments`: `Every comment is within the comment length rule.` `make findings ARGS="validate"`: `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s); every route file is valid: 1 file(s).`
- `make verify` with `TMPDIR` under the session scratchpad, on `a27ed1e2`, full profile. The first run failed in `make test` with one failure of `test/g2-partition.test.ts`, `a partition while the process runs keeps its observations, published once after the heal` (`the exit waits in the local outbox`, `'ended' !== 'pending'`), a Docker partition scenario that this change does not touch: `tests 2820`, `pass 2772`, `fail 1`, `skipped 47`. The second run, on the same tree, log at `/tmp/claude-1000/-home-petar-taskelith/b4ff37b6-62f5-4072-b2f1-67a3e58285b6/scratchpad/rr-verify-2.log`, exited 0: `make verify: passed, profile full, tree 2d70a2309199e0f2d5a186e046ff1b84036ace5f; stamp written`; `tests 2820`, `pass 2773`, `fail 0`, `cancelled 0`, `skipped 47`; product coverage all files 99.32 lines, 92.61 branches, 98.98 functions; `Verified 766 package paths; 41 with license coverage gaps (all reviewed; 4 declaration-only)`; `Totals: 70 passed, 0 failed (70 items)`; `Every checked link conforms.`; `Every active OpenSpec change archives into strictly valid specs.`
- `make record CHANGE=route-reviewers-by-change-complexity LOG=<that log>`: `make record: wrote the generated part of openspec/changes/route-reviewers-by-change-complexity/verification.md`. `make record-check CHANGE=route-reviewers-by-change-complexity`: `make record-check: the generated part matches the tree`.
- `npm run openspec -- validate --all --strict`: `Totals: 70 passed, 0 failed (70 items)`. `make findings ARGS="validate"`: `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s); every route file is valid: 1 file(s).`

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `2d70a2309199e0f2d5a186e046ff1b84036ace5f`; tests 2820, pass 2773, fail 0, skipped 47; all files 99.32% lines, 92.61% branches, 98.98% functions.
- `npm run openspec -- validate route-reviewers-by-change-complexity --strict`: passed, `Change 'route-reviewers-by-change-complexity' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s); every route file is valid: 1 file(s).`.
- Spec diff against the merge base `f3a53f172dc2` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `claude claude-fable-5-1#medium` | `2312677b-a5e1-4977-8400-cfe1bd02b090` | 0 | 0 | 1 | 9 |
<!-- make record: end -->

## Remaining gates

- Owner hard floor, confirmed: on 2026-10-28 the owner confirmed in the coordinator's session, relayed verbatim by the coordinator, the TypeSafe account, the acceptance of the Master Customer Agreement with its paid credits (8.2), and the consent to send the structured features (`design.md` "Owner actions" and "Decisions" 6). The coordinator installed `JEV_MAF_LAB` on this worker's host; its presence was checked by name only. The live offline evaluation (`tasks.md` 2.10) ran on 2026-10-28 ("Live shadow evaluation").
- A later governance change that the owner approves before the elevated efforts may apply (`design.md` "Decisions" 1).
- Independent review, passes 2 and, if needed, 3; archive (`tasks.md` 4.2 and 4.3).
- Integration into dev by the coordinator (single pull request).
