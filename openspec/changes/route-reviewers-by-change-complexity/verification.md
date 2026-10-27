# Verification: route-reviewers-by-change-complexity

## Scope and source

Coordinator brief of 2026-10-28, size M, relaying the owner's idea of the same day and the plan agreed with the coordinator: choose the reviewer and effort of each change by its complexity before review, with a deterministic rule router as the permanent floor, a TypeSafe AI Jev adapter in shadow mode only, a hexagonal port `ReviewRouter`, the command `make findings ARGS="route --change <name>"`, and measurement through `effect` and a one-time offline evaluation. Out of scope: letting Jev decide above the floor. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `/docs/agent-task-protocol.md`, in the git worktree `route-reviewers-by-change-complexity` on the branch of the same name. Base revision: `3f23516a` on `dev`.

Phase 1: research, design, and contract. Phase 2, recorded below: the port, the rule and Jev routers, the feature derivation, the record, and the command runner, tested, with the coordinator's decisions of 2026-10-28 applied (`design.md` "Decisions" and "Phase 2 scope"); the `effect` routing section and the offline evaluation are not yet implemented. Sequencing: `docs/governance.md`, `docs/agent-task-protocol.md`, and `scripts/findings.ts` are left untouched until `adopt-process-performance-recommendations` lands on `dev`; their edits are planned in `design.md` "Planned edits". Commit types `docs` (phase 1), `chore`, and `test`: nothing here is in the published package.

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

## Remaining gates

- Phase 2 remainder: the `effect` routing section, the offline evaluation and its schema, and the rule-only evaluation run (`tasks.md` 2.7 to 2.9).
- Owner hard floor, pending with the owner: the TypeSafe account, the acceptance of the Master Customer Agreement, paid credits, and the data consent (`design.md` "Owner actions" and "Decisions" 6). Until the owner confirms them, `JevRouter` is tested only with a fake and the constructed response, no live call is made from any host, and the offline evaluation is not run live (`tasks.md` 2.10).
- A later governance change that the owner approves before the elevated efforts may apply (`design.md` "Decisions" 1).
- Phase 3 integration; author self-check and evidence check; independent review; archive.
- Integration into dev by the coordinator (single pull request).
