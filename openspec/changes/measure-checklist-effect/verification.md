# Verification: measure-checklist-effect

## Scope and source

Coordinator brief from Niki of 2026-10-27, owner priority, size S-M: measure whether the review checklist pasted into every brief since about 2026-10-27 11:07 local time reduces the findings it warns about. Binding coordinator decisions: every change stores its brief's checklist as `checklist.json`, saved with one command and required by `findings validate` for active changes started after this change lands; an `effect` metric of observed against expected shares over archived changes with a checklist, per change and per archive date, normalized by size; backfill only from reliably available brief text; the protocol and the `taskelith-task-protocol` skill updated consistently. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `docs/agent-task-protocol.md`, in the git worktree `../taskelith-worktrees/measure-checklist-effect` on branch `measure-checklist-effect`. Base revision: `b87abe75` on `dev`. Exclusions: no backfill (`design.md` decision 4), no significance test, and no change to the `index` and `reviewers` output; the text `checklist` output keeps its sections and, after review pass 1, ends with a dev commit line. Commit types `chore`, `test`, and `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Contract (spec deltas and `docs/review-findings/checklist.schema.json`): `7408813b`. Tests: `b3f0faf7` and `c8c66414`. Implementation: `d320ea08` and `643f387b`. Protocol and skill: `6bb2369e`. This change's `checklist.json`, `findings.jsonl`, and `passes.jsonl`: `ea3610e7`. Proposal, design, tasks, and the schema description fix: `4d32cab7`, which the checks of "Checks" ran on. Verification record `e43cfc55`. The coordinator merged `origin/dev` `99333004` into the branch as `8cc4459e`, which review pass 1 ran on. Pass 1 fixes: tests `abd0d26c`, code and `Makefile` `e2efb487`, documentation, spec deltas, and change records `eb0ad015`; pass 1 record `c5c86462`. The coordinator merged `origin/dev` `10eeab69` (documentation only, #367) as `163f0635`, which review pass 2 ran on. Pass 2 fixes: tests `d778371f`, code `a9b1fc35`, documentation and deltas `a24d8156`; pass 2 record `e07b965c`, which review pass 3 ran on. The worker merged `origin/dev` `d21838c3` (#368 and #369, which includes `dc9f1b66`) as `1f373f83`, without conflicts and without changes to this change's files. Pass 3 fixes: tests `5f705685`; the pass 3 record follows it. The checks of each pass section ran on the tree they name.

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

### Pass 2 (reviewer B)

Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed, on `163f0635`, session `19915468-91ce-478f-b6b7-6c0c4b7fd33f`, run by the coordinator:

`claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`

Model confirmation and read-only proof, as the coordinator reported them: `claude-opus-5-5` with effort `high`; the SHA-256 snapshot was `cc4c2bae72261cf5403208a8eb429e485e43f992cda4824c505cbbbce95cbac2` before and after the pass. Reviewer B confirmed every pass 1 fix (M1 to M4, L5). Result: 0 Critical, 0 High, 1 Medium, 13 Low, recorded in `findings.jsonl` (with `missedBy` pass 1, role A, for L-3, L-10, L-12, and L-13, which existed when pass 1 ran; the others arose from the pass 1 fixes or later merges) and summarized in `passes.jsonl`. Fixes in `a9b1fc35` (code), `a24d8156` (documentation and deltas), and this record, with tests in `d778371f`:

| Id | Severity | Category | Finding | Resolution |
| --- | --- | --- | --- | --- |
| M-1 | Medium | contract-drift | Without `--at`, the checklist ranked the working tree's archive but named the merge-base dev commit, so `--save --at` could save another checklist. | With a readable dev commit, the checklist ranks that commit's archive; otherwise the tree's, with no dev commit line (`design.md` decision 2). The test that pinned the old behavior now asserts the new one. |
| L-1 | Low | error-handling | In a shallow clone, as in CI, the boundary commit appears to add every file, so every active change would need `checklist.json`. | `landingCommit` returns none in a shallow clone (`git rev-parse --is-shallow-repository`); the full-clone `pre-push` `make verify` enforces the rule. Test with a depth 1 clone. |
| L-2 | Low | error-handling | A failed `ls-tree` or `cat-file` gave an empty archive that could be ranked and saved. | `archiveSnapshot` returns undefined when the listing or any file cannot be read. |
| L-3 | Low | error-handling | `effect` looked up findings by change name, so a reused name took the first archive's. | Lookup by archive directory; test with two archives of one name. |
| L-4 | Low | contract-drift | An unreachable `--save` without `--at` check. | `ChecklistCommand` is a union in which `--save` carries `--at`; the check is gone. |
| L-5 | Low | docs | The schema did not mention `--at` and called `devCommit` the merge base. | Both descriptions name `--at`. |
| L-6 | Low | docs | The usage showed `--at` as optional with `--save`. | The usage lists the listing and saving forms apart. |
| L-7 | Low | spec-wording | The living "Findings index and checklist" says the checklist ends with "Record quality". | MODIFIED delta (471 characters) with a "Dev commit of the checklist" scenario. |
| L-8 | Low | evidence-mismatch | The proposal, this record, and design decision 9 said the text checklist output was unchanged. | They say it gains the dev commit line. |
| L-9 | Low | evidence-mismatch | "Revision" lacked the merges `8cc4459e` and `163f0635`, and counts were of an older tree. | Revision updated; counts rerun below. |
| L-10 | Low | test-flakiness | The effect test's git helper lacked `commit.gpgsign=false` and duplicated another; `test/findings.test.ts` used the real git environment implicitly. | One shared `test/checklist-git-fixture.ts` (signing off, hook `GIT_*` variables dropped through `fixtureEnv`); `test/findings.test.ts` injects `NO_GIT`. The adapter itself also drops inherited `GIT_*` variables now, so a hook's `GIT_DIR` cannot redirect it. |
| L-11 | Low | missing-fail-before-test | No test for a change opened before the landing on a branch that later merges it, or for an unknown `--at` with `--save`. | Both added; they pass on the pass 1 code as well, as coverage of the rule. |
| L-12 | Low | spec-wording | The coordinator's brief duties were only in documentation and skills. | ADDED "Checklist in the brief" (295 characters) in the `agent-task-protocol` delta. |
| L-13 | Low | naming | Zero changed lines read "no per 100 changed lines". | It reads "rate unknown". |

Fail-before evidence: on `163f0635`, the tests of `d778371f` fail as follows. `test/checklist-record.test.ts` fails 2 of 8, the dev commit ranking (M-1) and the JSON dev commit; `test/checklist-effect.test.ts` fails 2 of 8, the reused name (L-3) and "rate unknown" (L-13); `test/checklist-git.test.ts` fails to load (no `archiveSnapshot` export). With only a stub of that export added in a scratch worktree, it fails 2 of 7, the shallow clone (L-1) and the snapshot (L-2), and the two L-11 tests pass.

After the fixes, on `a24d8156` with the pass 2 lines of `findings.jsonl` and `passes.jsonl`:

- `npm run openspec -- validate measure-checklist-effect --strict`: valid. Requirement bodies: modified "Findings index and checklist" 471, "Checklist record" 447, "Checklist record validation" 496, "Checklist effect" 446, "Checklist record in the task flow" 398, and "Checklist in the brief" 295 characters.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `make findings ARGS="validate"`: `Every findings file is valid: 45 file(s); every pass summary file is valid: 25 file(s).`
- `make findings ARGS="effect"`: `Checklist effect over archived changes with checklist.json: 0 change(s); 218 archived change(s) without one are excluded.`, then `none` in both sections and the names.
- `make findings ARGS="checklist --files scripts/**"` ends with `Dev commit: 10eeab69f9cacb5a81d14acc8da7ed5ae43fe920.`
- Coverage of the new modules (the command of pass 1): 44 tests; all files 100.00% lines, 97.79% branches, 100.00% functions (`checklist-commands.ts` 97.37% branches, `checklist-effect.ts` 95.35%, `checklist-environment.ts` 100%, `checklist-record.ts` 100%, `findings.ts` 97.87%).
- `make verify` (with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`): exit 0. `npm test`: 2330 tests, 2283 passed, 0 failed, 47 skipped; coverage of all files 99.28% lines, 92.34% branches, 98.94% functions. Contract compatibility: 0 breaking changes in each of the four documents against `10eeab69`. `validate --all --strict`: 70 passed, 0 failed. `verify:comments`, `verify:findings` (45 and 25 files), `verify:links`, `verify:archive`, and `verify:package` passed.

### Pass 3 (reviewer A)

Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, on `e07b965c`, session `01a17f25-8fb8-7ac2-9deb-2303077c280b`, run by the coordinator, with the invocation of pass 1. Model confirmation and read-only proof, as the coordinator reported them: model `gpt-6.1-sol` with reasoning effort `medium`; the SHA-256 snapshot was `1f29c26afc3b5686120f77ed100b7abbc4cc69804b2eab024cebfeafe3ca5955` before and after the pass. Reviewer A confirmed all 14 pass 2 fixes and found no defect they introduced. Result: 0 Critical, 0 High, 0 Medium, 2 Low, recorded in `findings.jsonl` without `missedBy`, because both concern tests of the pass 2 fixes, and summarized in `passes.jsonl`. The pass had only Low findings, so the review ends: both were fixed in `5f705685` without another pass, with outcome `fixed-unreviewed`.

| Id | Severity | Category | Finding | Resolution |
| --- | --- | --- | --- | --- |
| P3-1 | Low | missing-fail-before-test | `test/checklist-git.test.ts:144`: the L-2 test called `archiveSnapshot` directly, so an `archiveAt` that swallowed git failures again would still pass. | A test removes the loose object of the archive tree, or of the archived `findings.jsonl` blob, in a real repository, and asserts that `--save --at` fails and writes nothing. |
| P3-2 | Low | missing-fail-before-test | `scripts/checklist-environment.ts:32`: the scrubbing of inherited `GIT_*` variables had no targeted regression test. | A test sets `GIT_DIR` to another fixture repository and asserts that `devCommit` reads the requested root and that `archiveAt` does not see the other repository's commit. |

Fail-before evidence: in a scratch worktree of `163f0635`, the code before the pass 2 fixes, with the test file and fixture of `5f705685` and only a stub of the `archiveSnapshot` export, both new tests fail: the save writes a record from an archive git could not read, and the adapter follows the foreign `GIT_DIR`.

After the fixes, on `5f705685` with the pass 3 lines of `findings.jsonl` and `passes.jsonl`:

- `npm run openspec -- validate measure-checklist-effect --strict`: valid. `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `make findings ARGS="validate"`: `Every findings file is valid: 47 file(s); every pass summary file is valid: 27 file(s).`
- `make findings ARGS="effect"`: `Checklist effect over archived changes with checklist.json: 0 change(s); 220 archived change(s) without one are excluded.`
- Coverage of the new modules (the command of pass 1): 46 tests; all files 100.00% lines, 97.78% branches, 100.00% functions (`checklist-commands.ts` 97.30% branches, `checklist-effect.ts` 95.35%, `checklist-environment.ts`, `checklist-record.ts` 100%, `findings.ts` 97.86%).
- `make verify` (with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`): exit 0. `npm test`: 2332 tests, 2285 passed, 0 failed, 47 skipped; coverage of all files 99.28% lines, 92.34% branches, 98.94% functions. Contract compatibility: 0 breaking changes in each of the four documents against `d21838c3`. `validate --all --strict`: 70 passed, 0 failed. `verify:comments`, `verify:findings` (47 and 27 files), `verify:links`, `verify:archive`, and `verify:package` passed.

### Coordinator scope addition

After review pass 1 the coordinator added the `taskelith-coordinator` skill to the scope: its brief paragraph now names the exact checklist invocation, the dev commit for `--at`, and the task size, consistent with `docs/agent-task-protocol.md` coordinator step 1 and the `taskelith-task-protocol` skill (`eb0ad015`). The `taskelith-worker` skill has no plan-time step, only a pointer to the worker steps, so it is unchanged. This is not a review finding.

## Limitations

- No archived change has `checklist.json` yet, so `effect` measures nothing until this change and the changes opened after it are archived; until then it lists every archived change as without a checklist.
- The record quality list of seven categories covers every archived record category today, so its expected share is 100% (`design.md` "Risks").
- Lines changed include any `dev` merged into a branch after its dev commit.

## Remaining gates

- Archive of the change on its branch.
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into dev by the coordinator (single pull request).
