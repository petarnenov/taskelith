# Verification: require-finding-capability

## Scope and source

Owner-approved task relayed by the coordinator brief on 2026-10-27: record findings reach every brief through a "Record quality" checklist section, and code and doc findings of active changes name an existing capability. Developed by a subagent briefed by the coordinator session, under [subagent execution](../../../docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/require-finding-capability` on branch `require-finding-capability`. Base revision: `477a423e` on `dev`. Scope: `scripts/review-findings.ts`, `scripts/findings.ts`, their tests, `docs/agent-task-protocol.md` "Review findings record", the capability description of `docs/review-findings/finding.schema.json`, the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills, and this change with its empty `findings.jsonl`. Exclusions: no rewrite of archived findings, no schema-level capability rule, no change to the index. Commit types `chore`, `test`, and `docs`: the touched files are outside the published package's `files` allowlist.

## Archived findings on the base

`npm run findings -- index --json` on `477a423e` counts 51 archived findings, all fixed, of which 21 have the capability `(none)`. The brief cited 20 of 50, as at merge `92f0830b`; `dev` gained one record finding without a capability since, in `stabilize-placement-fair-order-test` (PR #331). Of the 21:

- 17 concern a change's own records under `openspec/changes/` (`verification.md`, `design.md`, `proposal.md`, `tasks.md`, or a spec delta). The path rule makes them record findings without a rewrite.
- 4 concern other files and stay without a capability: `tools/linux-cgroup/crash-windows.sh` and `scripts/linux-crash-windows.sh` (`run-g2-crash-windows-on-linux`), and `docs/worker-platforms.md` and `docs/dependencies.md` (`run-g2-native-acceptance-x86-64`). All four already existed at `92f0830b` (the last two since `5af2f9f8`, PR #328), so the brief's 20 split as 16 record and 4 code or doc findings; its "3 others" was off by one.

In all, 26 archived findings are record findings (9 of them name a capability): evidence-mismatch 9, docs 8, stale-citation 5, spec-wording 3, process 1. Every capability that an archived finding names exists under `openspec/specs`.

## Revision

Implementation and documentation at `54dec1e4`; this record is in the following commit.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`, dependencies from `npm ci --ignore-scripts`; no Docker.

## Author self-check

- AGENTS.md and ADR 0004: TypeScript only; the rules stay pure in `scripts/review-findings.ts` (`isRecordFinding`, the capability check, `recordChecklist`, `formatRecordChecklist`) and the directory listing stays in `scripts/findings.ts`; `checklist` and `recordChecklist` share `rankCategories`, and both formatters share `formatRanking`; every comment is within two lines of 80 characters; no new dependency.
- Redaction: the new diagnostics quote only the capability, which has passed the schema's identifier pattern and the secret-like value check before the rule runs, as the category does; no other input is printed.
- Contract-drift: the protocol, the schema description, the skills, and the modified requirements say the same rule: record findings are those under `openspec/changes/`; in an active change every other finding names a capability, and any named capability must exist; archived findings keep the earlier rules. Record findings matching a query still appear in the query section, so the existing checklist contract is unchanged except for the added section.
- Error-handling: a missing capability and an unknown capability each give one diagnostic with the file and line and fail validation; a missing `openspec/specs` directory yields an empty set, so every named capability is reported, not skipped.
- Requirements: the two modified requirements have 455 and 451 characters, under OpenSpec's 500; the archive was tested in a scratch copy (below).
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

Pending: Claude Code, model `claude-fable-5-1`, effort medium.

## Limitations

- The 4 archived code and doc findings without a capability still miss capability-based checklists; only file globs reach them.
- Active changes on other branches with code or doc findings without a capability fail validation after merging `dev`, until they add one.
- `make verify` has not run on this branch.

## Remaining gates

- `make verify`.
- The independent review (Claude Code `claude-fable-5-1`, medium).
- Archive.
- Integration into dev by the coordinator (single pull request).
