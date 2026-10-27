# Verification: measure-checklist-effect

## Scope and source

Coordinator brief from Niki of 2026-10-27, owner priority, size S-M: measure whether the review checklist pasted into every brief since about 2026-10-27 11:07 local time reduces the findings it warns about. Binding coordinator decisions: every change stores its brief's checklist as `checklist.json`, saved with one command and required by `findings validate` for active changes started after this change lands; an `effect` metric of observed against expected shares over archived changes with a checklist, per change and per archive date, normalized by size; backfill only from reliably available brief text; the protocol and the `taskelith-task-protocol` skill updated consistently. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `docs/agent-task-protocol.md`, in the git worktree `../taskelith-worktrees/measure-checklist-effect` on branch `measure-checklist-effect`. Base revision: `b87abe75` on `dev`. Exclusions: no backfill (`design.md` decision 4), no significance test, and no change to the `index`, `reviewers`, and text `checklist` output. Commit types `chore`, `test`, and `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Contract (spec deltas and `docs/review-findings/checklist.schema.json`): `7408813b`. Tests: `b3f0faf7` and `c8c66414`. Implementation: `d320ea08` and `643f387b`. Protocol and skill: `6bb2369e`. This change's `checklist.json`, `findings.jsonl`, and `passes.jsonl`: `ea3610e7`. Proposal, design, tasks, and the schema description fix: `4d32cab7`, which the checks below ran on.

## Environment

Ubuntu 26.04.1 LTS (Linux 7.0.0-38-generic, x86_64), Node.js v24.22.1 from `.nvmrc`. `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`, because this host has an empty `/tmp/.git` that breaks tests creating git repositories under the default temporary directory.

## Author self-check

Against the review checklist of the brief (`design.md` "Review checklist") and ADR 0004:

1. Contract drift: the schema, `scripts/checklist-record.ts`, the deltas, `docs/agent-task-protocol.md`, the skill, and `design.md` state the same cutoff (2026-10-28 by `.openspec.yaml` `created`, or no created date), the same baseline populations (every archived code finding, every archived record finding), and the same size points. The schema's section descriptions were corrected in `4d32cab7` after the baseline moved from the query-matched population to all archived findings (`design.md` decision 5).
2. Error handling: `--save` refuses a missing active change, an existing file (also through the exclusive `wx` write flag), and a missing dev commit, each with exit code 1 and without writing; `linesChanged` returns undefined when git finds no archive commit or no diff, and the effect then says the size is unknown. Invalid `checklist.json` stops every command, like invalid findings.
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

Not yet run; the coordinator assigns reviewers A and B.

## Limitations

- No archived change has `checklist.json` yet, so `effect` measures nothing until changes created under the rule are archived; until then it lists every archived change as without a checklist.
- The record quality list of seven categories covers every archived record category today, so its expected share is 100% (`design.md` "Risks").
- Lines changed include any `dev` merged into a branch after its dev commit.

## Remaining gates

- Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed.
- Archive of the change on its branch.
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into dev by the coordinator (single pull request).
