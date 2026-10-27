# Verification: measure-checklist-effect

## Scope and source

Coordinator brief from Niki of 2026-10-27, owner priority, size S-M: measure whether the review checklist pasted into every brief since about 2026-10-27 11:07 local time reduces the findings it warns about. Binding coordinator decisions: every change stores its brief's checklist as `checklist.json`, saved with one command and required by `findings validate` for active changes started after this change lands; an `effect` metric of observed against expected shares over archived changes with a checklist, per change and per archive date, normalized by size; backfill only from reliably available brief text; the protocol and the `taskelith-task-protocol` skill updated consistently. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `docs/agent-task-protocol.md`, in the git worktree `../taskelith-worktrees/measure-checklist-effect` on branch `measure-checklist-effect`. Base revision: `b87abe75` on `dev`. Exclusions: no backfill (`design.md` decision 4), no significance test, and no change to the `index`, `reviewers`, and text `checklist` output. Commit types `chore`, `test`, and `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Contract (spec deltas and `docs/review-findings/checklist.schema.json`): `7408813b`. Tests: `b3f0faf7` and `c8c66414`. Implementation: `d320ea08` and `643f387b`. Protocol and skill: `6bb2369e`. This change's `checklist.json`, `findings.jsonl`, and `passes.jsonl`: `ea3610e7`. Proposal, design, tasks, and the schema description fix: `4d32cab7`, which the checks of "Checks" ran on. Verification record `e43cfc55`. The coordinator merged `origin/dev` `99333004` into the branch as `8cc4459e`, which review pass 1 ran on. Pass 1 fixes: tests `abd0d26c`, code and `Makefile` `e2efb487`, documentation, spec deltas, and change records `eb0ad015`; the pass 1 record follows it.

## Environment

Ubuntu 26.04.1 LTS (Linux 7.0.0-38-generic, x86_64), Node.js v24.22.1 from `.nvmrc`. `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`, because this host has an empty `/tmp/.git` that breaks tests creating git repositories under the default temporary directory.

## Author self-check

Against the review checklist of the brief (`design.md` "Review checklist") and ADR 0004:

1. Contract drift: the schema, `scripts/checklist-record.ts`, the deltas, `docs/agent-task-protocol.md`, the skills, and `design.md` state the same cutoff (after review pass 1: opened after the landing commit of this change's archive, or uncommitted), the same baseline populations (every archived code finding, every archived record finding), and the same size points. The schema's section descriptions were corrected in `4d32cab7` after the baseline moved from the query-matched population to all archived findings (`design.md` decision 5).
2. Error handling: `--save` refuses a missing active change, an existing file (also through the exclusive `wx` write flag), and, after review pass 1, an unknown `--at` commit and the reserved `archive` name, each with exit code 1 and without writing; `linesChanged` returns undefined when git finds no archive commit or no diff, and the effect then says the size is unknown. Invalid `checklist.json` stops every command, like invalid findings.
3. Redaction: `checklist.json` holds only identifiers, globs bounded by the finding schema's `text` definition, counts, a SHA, and a time; a JSON parse failure is reported as `not a JSON value` without echoing the input, and schema diagnostics never print an unknown property's name (`describeError`).
4. Naming: one term per concept, "checklist record" for `checklist.json`, "baseline" for the stored archive counts, "observed" and "expected" for the shares.
5. Record quality: the counts below come from the commands listed.

Evidence check: `npm run verify:links`: `Every checked link conforms.` No external link is added.

## Checks

- `npm run openspec -- validate measure-checklist-effect --strict`: `Change 'measure-checklist-effect' is valid`.
- Requirement bodies: "Checklist record" 471, "Checklist effect" 446, and "Checklist record in the task flow" 351 characters.
- Tests that fail without the implementation: the test files of `643f387b` (`test/checklist-record.test.ts`, `test/checklist-effect.test.ts`, `test/findings.test.ts`) were copied into a scratch worktree of the pre-implementation commit `7408813b` and run there; each file fails to load with `ERR_MODULE_NOT_FOUND` (`scripts/checklist-record.ts`, `scripts/checklist-effect.ts`). Behavior on the same scratch tree, with a probe active change created 2026-10-28 without `checklist.json`: the old `scripts/findings.ts validate` exits 0 (`Every findings file is valid: 44 file(s); ...`) and `effect` exits 2 (`unknown command "effect"`); the new code exits 1 on the same probe with `openspec/changes/probe-after-cutoff/checklist.json: missing; an active change created on or after 2026-10-28 records its brief's checklist here (checklist ... --save probe-after-cutoff)`. The probe was removed afterwards.
- Hand-computed fixtures: `test/checklist-effect.test.ts` asserts, among others, 2 of 3 listed pass-1 code findings as 67% observed against a 5 of 10 baseline (50%), a day of 3 and 1 findings with expected shares 50% and 25% as (3 × 50% + 1 × 25%) / 4 = 43.75%, shown as 44%, 5 pass-1 findings of a size M change as 2.50 per size point, and 1 finding over 400 changed lines as 0.25 per 100 lines; a pass 2 finding is left out. `test/checklist-record.test.ts` asserts the exact saved `checklist.json`, with baselines computed by hand in its comments.
- Tests of the findings tooling on `4d32cab7`: `test/checklist-record.test.ts` 8, `test/checklist-effect.test.ts` 6, `test/findings.test.ts` 21, all passing; `test/findings.test.ts` changed only in its fixture helper (it copies the checklist schema and gives active fixture changes a created date before the cutoff) and the `checklist` parse result, which now has `json: false`.
- `make findings ARGS="validate"`: `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).`
- `make findings ARGS="checklist --files scripts/** --save measure-checklist-effect --size S-M"` wrote this change's `checklist.json` with `devCommit` `b87abe75898697b816c080f93ed66b6d2a776f2f`; its printed text is identical to the brief's checklist (`diff` against the brief's text: no difference). Baselines: review 127 of 244 code findings listed (52%), Medium or worse 64 of 97 (66%); record quality 156 of 156 (100%), Medium or worse 27 of 27 (100%).
- `make findings ARGS="effect"` on this tree: `Checklist effect over archived changes with checklist.json: 0 change(s); 216 archived change(s) without one are excluded.`, then the legend, `By change` and `By archive date` with `none`, and the 216 change names after `No checklist:`.
- `make findings ARGS="effect"` after `npm run openspec -- archive measure-checklist-effect --yes` in a scratch worktree of `4d32cab7` (removed afterwards): `1 change(s); 216 archived change(s) without one are excluded`, and `2026-10-27 measure-checklist-effect: 0 pass-1 finding(s), size S-M, 0.00 per size point` with `review, all: 0 of 0 listed, no findings, 52% expected`, `review, >=medium: ... 66% expected`, and record quality `100% expected`.
- `make verify` on `4d32cab7`: exit 0. `npm run verify:comments`: `Every comment is within the comment length rule.` `npm run verify:findings`: `Every findings file is valid: 43 file(s); every pass summary file is valid: 23 file(s).` `npm test`: 2321 tests, 2274 passed, 0 failed, 47 skipped; coverage of all files 99.28% lines, 92.33% branches, 98.94% functions. Contract compatibility: 0 breaking changes in each of the four documents. `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed. `npm run verify:links`, `npm run verify:archive` (`Every active OpenSpec change archives into strictly valid specs.`), and `npm run verify:package` passed.
- Coverage note: `npm test` measures coverage over the built product modules (`dist/`), not over `scripts/`, so the new scripts do not change the coverage figures; their tests cover every command, option, and rule above, including the git environment against a temporary repository.

## Independent review

### Pass 1 (reviewer A)

Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, on `8cc4459e`, session `01a17f0b-dff5-7873-98b0-4fab3289e994`, run by the coordinator:

`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`

Model confirmation and read-only proof, as the coordinator reported them: model `gpt-6.1-sol` with reasoning effort `medium`; the SHA-256 snapshot of all tracked and untracked files was `0fa1f2e0cd8d9ddd2a7b6eac278408184fefabd3e617569e4cb2a04ce5625c56` before and after the pass. Result: 0 Critical, 0 High, 4 Medium, 1 Low, recorded in `findings.jsonl` and summarized in `passes.jsonl`. Fixes in `e2efb487` (code, `Makefile`) and `eb0ad015` (documentation and deltas), with tests in `abd0d26c`:

| Severity | Category | Finding | Resolution |
| --- | --- | --- | --- |
| Medium | contract-drift | `scripts/checklist-commands.ts:52`: `--save` recomputed the checklist from the current archive, so a `dev` that moved after the brief changed its categories, counts, and baselines. | The checklist text ends with its dev commit; `--save` needs `--at <commit>`, which ranks the archived findings as of that commit read through git, and an unknown commit is refused (`design.md` decision 2). |
| Medium | scope | `scripts/checklist-record.ts:22`: the fixed cutoff 2026-10-28 did not implement "started after this change lands". | A change needs `checklist.json` once the commit that first archives `measure-checklist-effect` exists and the commit that first added its `.openspec.yaml` descends from it, or the file is uncommitted; the date constant is gone (`design.md` decision 3). The coordinator confirmed this rule. |
| Medium | error-handling | `scripts/checklist-record.ts:155`: validation accepted impossible records: listed counts above totals, duplicate categories, an impossible time; no checks of Medium or worse against all, rank order, or `top`. | Consistency checks with a message per inconsistency (`design.md` decision 11). |
| Medium | error-handling | `scripts/checklist-commands.ts:61`: `--save archive` passed the active-change check and would write `openspec/changes/archive/checklist.json`. | Only an existing active change directory other than `archive` is accepted. |
| Low | docs | `Makefile:69`: the comment said `validate` takes `--json`. | The comment names only `index`, `reviewers`, and `effect` as taking `--json`. |

Fail-before evidence: the tests of `abd0d26c` were run on `8cc4459e`. `test/checklist-record.test.ts` and `test/checklist-git.test.ts` fail to load there (`does not provide an export named 'LANDING_CHANGE'`). With only that export added to the old `scripts/checklist-record.ts` in a scratch worktree, `test/checklist-record.test.ts` fails 7 of 8 (all but the schema validation test, which passed before) and `test/checklist-git.test.ts` fails 3 of 3: the `--at` parsing and save, the archive changed after the brief commit, the reserved `archive` name, the unknown commit, the dev commit line, the landing rule, and every consistency case. `test/findings.test.ts` fails 7 of 21 on `8cc4459e`, because its fixture changes no longer carry a created date before the old cutoff.

After the fixes, on `eb0ad015` with the pass 1 lines of `findings.jsonl` and `passes.jsonl`:

- `npm run openspec -- validate measure-checklist-effect --strict`: valid. Requirement bodies: "Checklist record" 447, "Checklist record validation" 469, "Checklist effect" 446, and "Checklist record in the task flow" 398 characters.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `make findings ARGS="validate"`: `Every findings file is valid: 44 file(s); every pass summary file is valid: 24 file(s).`
- `make findings ARGS="effect"`: `Checklist effect over archived changes with checklist.json: 0 change(s); 217 archived change(s) without one are excluded.`, then `none` in both sections and the names.
- Tests of the findings tooling: `test/checklist-record.test.ts` 8, `test/checklist-git.test.ts` 3, `test/checklist-effect.test.ts` 6, `test/findings.test.ts` 21, and the review-findings, review-passes, and reviewer-statistics tests, 86 in all, passing.
- Coverage of the new modules, `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/checklist-*.ts' --test-coverage-include='scripts/findings.ts' test/checklist-*.test.ts test/findings.test.ts`: 38 tests; all files 100.00% lines, 95.89% branches, 100.00% functions (`checklist-commands.ts` 97.14% branches, `checklist-effect.ts` 89.16%, `checklist-environment.ts` 92.31%, `checklist-record.ts` 100%, `findings.ts` 97.81%). The coordinator measured 100.00, 95.44, and 99.28 before the fixes.
- End to end in a scratch worktree of `eb0ad015` with the pass 1 records (removed afterwards): after `npm run openspec -- archive measure-checklist-effect --yes` and a commit, a new change `probe-after` without `checklist.json` fails validation with `openspec/changes/probe-after/checklist.json: missing; an active change opened after measure-checklist-effect was archived records its brief's checklist here (checklist ... --save probe-after --at <dev commit of the brief>)`, and `effect` reports `2026-10-27 measure-checklist-effect: 5 pass-1 finding(s), size S-M, 3.33 per size point`, review 3 of 5 listed, 60% observed against 52% expected, Medium or worse 3 of 4, 75% against 66%. To give that scratch worktree an `origin/dev`, the run moved the shared `refs/remotes/origin/dev` ref; `git fetch origin` restored it right after.
- `make verify` (with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`): exit 0. `npm test`: 2324 tests, 2277 passed, 0 failed, 47 skipped; coverage of all files 99.28% lines, 92.30% branches, 98.94% functions. Contract compatibility: 0 breaking changes in each of the four documents against `99333004`. `validate --all --strict`: 70 passed, 0 failed. `verify:comments`, `verify:findings` (44 and 24 files), `verify:links`, `verify:archive`, and `verify:package` passed.

### Coordinator scope addition

After review pass 1 the coordinator added the `taskelith-coordinator` skill to the scope: its brief paragraph now names the exact checklist invocation, the dev commit for `--at`, and the task size, consistent with `docs/agent-task-protocol.md` coordinator step 1 and the `taskelith-task-protocol` skill (`eb0ad015`). The `taskelith-worker` skill has no plan-time step, only a pointer to the worker steps, so it is unchanged. This is not a review finding.

## Limitations

- No archived change has `checklist.json` yet, so `effect` measures nothing until this change and the changes opened after it are archived; until then it lists every archived change as without a checklist.
- The record quality list of seven categories covers every archived record category today, so its expected share is 100% (`design.md` "Risks").
- Lines changed include any `dev` merged into a branch after its dev commit.

## Remaining gates

- Independent review: pass 2 by reviewer B, which checks the pass 1 fixes and reviews the whole change, and pass 3 by reviewer A if needed.
- Archive of the change on its branch.
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into dev by the coordinator (single pull request).
