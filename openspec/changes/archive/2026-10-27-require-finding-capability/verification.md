# Verification: require-finding-capability

## Scope and source

Owner-approved task relayed by the coordinator brief on 2026-10-27: record findings reach every brief through a "Record quality" checklist section, and code and doc findings of active changes name an existing capability. Developed by a subagent briefed by the coordinator session, under [subagent execution](/docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/require-finding-capability` on branch `require-finding-capability`. Base revision: `477a423e` on `dev`. Scope: `scripts/review-findings.ts`, `scripts/findings.ts`, their tests, `docs/agent-task-protocol.md` "Review findings record", the capability description of `docs/review-findings/finding.schema.json`, the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills, and this change with its empty `findings.jsonl`. Exclusions: no rewrite of archived findings, no schema-level capability rule, no change to the index. Commit types `chore`, `test`, and `docs`: the touched files are outside the published package's `files` allowlist.

## Archived findings on the base

`npm run findings -- index --json` on `477a423e` counts 51 archived findings, all fixed, of which 21 have the capability `(none)`. The brief cited 20 of 50, as at merge `92f0830b`; `dev` gained one record finding without a capability since, in `stabilize-placement-fair-order-test` (PR #331). Of the 21:

- 17 concern a change's own records under `openspec/changes/` (`verification.md`, `design.md`, `proposal.md`, `tasks.md`, or a spec delta). The path rule makes them record findings without a rewrite.
- 4 concern other files and stay without a capability: `tools/linux-cgroup/crash-windows.sh` and `scripts/linux-crash-windows.sh` (`run-g2-crash-windows-on-linux`), and `docs/worker-platforms.md` and `docs/dependencies.md` (`run-g2-native-acceptance-x86-64`). All four already existed at `92f0830b` (the last two since `5af2f9f8`, PR #328), so the brief's 20 split as 16 record and 4 code or doc findings; its "3 others" was off by one.

In all, 26 archived findings are record findings (9 of them name a capability): evidence-mismatch 9, docs 8, stale-citation 5, spec-wording 3, process 1. Every capability that an archived finding names exists under `openspec/specs`.

## Revision

Implementation and documentation at `54dec1e4`; this record in `e25d3151`. Review pass 1 fixes at `8e38e16a`; their record in `a6f58114`. `23b7b811` merges `origin/dev` at `744689cb`; `make verify` ran on that merge, and its record is in `ce3383f1`. The archive commit, the last of the branch, follows it.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`, dependencies from `npm ci --ignore-scripts`; no Docker.

## Author self-check

- AGENTS.md and ADR 0004: TypeScript only; the rules stay pure in `scripts/review-findings.ts` (`isRecordFinding`, the capability check, `recordChecklist`, `formatRecordChecklist`) and the directory listing stays in `scripts/findings.ts`; `checklist` and `recordChecklist` share `rankCategories`, and both formatters share `formatRanking`; every comment is within two lines of 80 characters; no new dependency.
- Redaction: the new diagnostics quote only the capability, which has passed the schema's identifier pattern and the secret-like value check before the rule runs, as the category does; no other input is printed.
- Contract-drift: the protocol, the schema description, the skills, and the modified requirements say the same rule: record findings are those under `openspec/changes/`; in an active change every other finding names a capability, and any named capability must exist; archived findings keep the earlier rules. Record findings matching a query still appear in the query section, so the existing checklist contract is unchanged except for the added section.
- Error-handling: a missing capability and an unknown capability each give one diagnostic with the file and line and fail validation; a missing `openspec/specs` directory yields an empty set, so every named capability is reported, not skipped.
- Requirements: the two modified requirements have 497 and 451 characters, under OpenSpec's 500; the archive was tested in a scratch copy (below).
- Coverage: the two script modules, measured separately because `npm test` covers only built product modules, are at 100 % lines and functions, 97.89 % and 99.21 % branches.
- Evidence check: the numbers above and the results below come from the commands listed; no external link is added.

## Test-first evidence

Each rule's tests were committed before its implementation and run on the code before it.

- Capability rule, tests in `8eb7ab27`, run on that commit: 33 passed, 3 failed. `validate requires an existing capability only for active code findings` (`test/findings.test.ts`), `an active code or doc finding needs an existing capability`, and `a record finding needs no capability, but one it names must exist` (`test/review-findings.test.ts`) failed because no diagnostic was produced (actual `[]`). `without the capability rule a code finding may omit its capability` passed, as intended: it guards the archived behavior. After `9f472561`: 36 passed, 0 failed.
- Record quality, tests in `99df9e22`, run on that commit: `every checklist ends with the record quality of archived findings` (`test/findings.test.ts`) failed its assertion, and `test/review-findings.test.ts` failed to load, because `scripts/review-findings.ts` exported no `formatRecordChecklist`, so its new tests `a record finding is one whose file is under openspec/changes`, `the record checklist ranks the categories of record findings only`, and `the record checklist text names record quality, and an empty one says so` could not pass. The existing assertion on the checklist's last line was anchored per line (`/m`) in the same commit, because the record section now follows. After `2e55262c`: 40 passed, 0 failed.

## Checks

- `node --experimental-strip-types --test test/findings.test.ts test/review-findings.test.ts`: 40 of 40 passed.
- The same with `--experimental-test-coverage --test-coverage-include='scripts/findings.ts' --test-coverage-include='scripts/review-findings.ts'`: `findings.ts` 100 % lines, 97.89 % branches, 100 % functions; `review-findings.ts` 100 % lines, 99.21 % branches, 100 % functions.
- `npm run findings -- validate`: `Every findings file is valid: 9 file(s).`
- `npm run findings -- checklist --capability review-process --files 'scripts/**,docs/review-findings/**'`: the query section lists redaction 5, contract-drift 4, error-handling 2; the "Record quality" section lists evidence-mismatch 9, docs 8, stale-citation 5, spec-wording 3, process 1, each with its newest example title.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate require-finding-capability --strict`: valid.
- Archive in a scratch copy of the working tree: `npm run openspec -- archive require-finding-capability --yes` applied 2 modified requirements to `review-process`; `npm run openspec -- validate --all --strict --no-interactive` then reported 69 passed, 0 failed, and `validate` of the findings tool passed with the archived file.
- `npx tsc -p tsconfig.check.json`: no error in the touched files; the run reports unrelated errors because the workspace packages are not built in this worktree (`npm ci --ignore-scripts`).

## Independent review

### Pass 1

Claude Code, model `claude-fable-5-1`, effort medium, session `7abb7178-7435-4fe5-88a6-3db2089d4b29`, on `e25d3151`. Result: 0 Critical, 0 High, 0 Medium, 3 Low. All three are in `findings.jsonl` with the outcome `fixed-unreviewed`: under the [review process](/docs/governance.md#independent-review-process) a Low-only pass is fixed without another review. Fixes in `8e38e16a`:

- evidence-mismatch, `verification.md`: the finding `dev` added after the brief is a record finding of `stabilize-placement-fair-order-test` (PR #331), not `docs/dependencies.md`; at `92f0830b` all four code and doc findings already existed, so the brief's 20 split as 16 record and 4 code or doc findings, and its "3 others" was off by one. Corrected under "Archived findings on the base".
- contract-drift, the `review-process` delta and the schema: the requirement now says that any named capability exists under `openspec/specs`, a scenario covers a record finding with an unknown capability, and the schema's `capability` description says the same.
- docs, `docs/agent-task-protocol.md` worker step 5: it now asks for the capability of any finding outside `openspec/changes/`, as the `taskelith-task-protocol` skill does.

After the fixes the checks above were repeated with the same results (40 of 40 tests, 9 valid findings files, comments within the rule, the change valid with `--strict`), and the archive in a scratch copy again applied 2 modified requirements with 69 passed, 0 failed. The coverage run was not repeated: the fixes touch no script.

## Merge of dev

`23b7b811` merges `origin/dev` at `744689cb` into the branch. The merge brings PR #332 (`stop-automatic-retry-of-unknown-exit`, the L1 fix: no automatic retry of an exit with an unknown status) and PR #333 (`run-g2-partition-and-races`, the G2 partition and race scenarios), both archived, with edits to the living specs `g2-failure-scenarios` and `observation-consumption`. It touches none of this change's inputs: no file under `scripts/`, `docs/agent-task-protocol.md`, the findings schema, or the `review-process` spec. After the merge `npm run findings -- validate` reports `Every findings file is valid: 11 file(s).`, so neither an active change nor one of the two new archives from `dev` breaks the capability rule.

## make verify

`make verify` on `23b7b811`: exit 0 in 185 s on 2026-10-27. 2047 tests, 2045 passed, 0 failed, 0 cancelled, 2 skipped; coverage of all files 99.27 % lines, 91.96 % branches, 98.94 % functions; every comment within the rule; every findings file valid (11 files); package allowlist and installed CLI verification passed. The Docker CLI ran with `DOCKER_CONFIG` set to an empty configuration (`{}`) in the session's scratch directory, because Docker Desktop's credential helper (`credsStore: desktop`) hangs on this iMac, as in [the x86_64 native acceptance record](/openspec/changes/archive/2026-10-27-run-g2-native-acceptance-x86-64/verification.md); public images are pulled anonymously from the same engine, no credential was read, and the Makefile and the product were not changed.

## Archive checks

On the tree of the archive commit, the working tree right after `npm run openspec -- archive require-finding-capability --yes`, which moved the change to `openspec/changes/archive/2026-10-27-require-finding-capability/` and applied 2 modified requirements to `review-process` (`+ 0, ~ 2, - 0`):

- `npm run openspec -- validate --all --strict --no-interactive`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line is `✓ change/2026-10-27-require-finding-capability`.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/review-process/spec.md` changes. "Review findings record" and "Findings index and checklist" take this change's text, and the scenarios "Code finding without a capability", "Record finding without a capability", "Record finding with an unknown capability", "Archived finding without a capability", and "Record quality in every checklist" are added; every other requirement and scenario is unchanged.
- The moved change has its `findings.jsonl` with the 3 lines of pass 1, and `npm run findings -- validate` reports `Every findings file is valid: 11 file(s).`
- `npm run verify:comments`: every comment is within the rule.
- No link in the repository points to `openspec/changes/require-finding-capability/`. The three relative links of this record were rewritten to resolve from the archive directory. The `file` fields in `findings.jsonl` keep the active path, which is what a record finding means.
- `make verify` on this tree was not run by the author; the `pre-push` hook runs it before the push.

## Limitations

- The 4 archived code and doc findings without a capability still miss capability-based checklists; only file globs reach them.
- Active changes on other branches with code or doc findings without a capability fail validation after merging `dev`, until they add one.
- `make verify` ran with an empty Docker configuration, not the user's, because its credential helper hangs (see "make verify").

## Remaining gates

- `make verify` on the archive commit, run by the `pre-push` hook.
- Integration into dev by the coordinator (single pull request).
