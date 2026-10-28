# Verification

Record of the author's work before review; it names the checks that have not run yet (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28), owner-approved on 2026-10-28: `declare-contract-breaking-changes`, size S-M.
- **Base revision:** `24d25938` (`origin/dev`, merge of pull request #389, `bind-evidence-to-code-head`).
- **Commits:** `ae0fb944` (proposal, design, spec delta, tasks), `8a0e494e` (fail-before tests), `34d99f3a` (check, declarations file and schema, `make contract-breaking-changes`, docs), `c00e3baf` and `a9b25bb3` (records), and the commit that applies the coordinator's decisions below.
- **Scope:** `packages/contracts/breaking-changes.json` and its schema; the declaration check, its validation, and the listing in `scripts/check-contract-compatibility.ts`; `make contract-breaking-changes`; the author workflow in `docs/contracts/execution-wire-contracts.md`; the history entry of the SDLC AsyncAPI document 0.4.0.
- **Out of scope:** version 1.0 of any contract, and changes to the contract documents or the detectors.

## Coordinator decisions

The coordinator (Niki, 2026-10-28) decided the open points of the author's draft:

1. **Capability (option c).** The four requirements stay ADDED in `sdlc-wire-contracts`, and "Breaking-change check" is MODIFIED from its living text so that it points to "Declared breaking changes listed"; its "Declared breaking change" scenario now names the entry (design decision 1). The brief named the wrong capability, `contract-tooling`; the saved `checklist.json` stays as it is.
2. **`BASE=<rev>`.** Kept, as a scope addition beyond the brief that the coordinator approved (design decision 6).
3. **Bump without found changes.** Kept as built: when the head version declares a breaking change and the check finds none, no entry is required and each change an entry lists for that version is stale. "Declared breaking changes listed" now says so, with the scenario "Bump without found changes"; the test is `a listed change that the check does not find is stale and named`.
4. **Docs.** They stay in the "New versions" bullet of `docs/contracts/execution-wire-contracts.md` (design decision 8).
5. **Stronger fail-before.** The new tests run against stubs of the new exports (Fails before the change).

## Environment

The owner's 2020 Intel iMac: macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm.

## Author self-check

- **Contract first.** `ae0fb944` holds the proposal, the design, and the spec delta before the tests and the code.
- **Spec delta** (as of the pass 2 fixes): `sdlc-wire-contracts` added "Breaking-change declarations" (489 characters), "Declared breaking changes listed" (456), "Stale and historical declarations" (403), "Breaking-change listing" (391), and modified "Breaking-change check" (491, living text 493). The brief named `contract-tooling`; design decision 1 records why the delta goes to `sdlc-wire-contracts`. An archive of the change in a scratch copy, then `npm run openspec -- validate --specs --strict`: 70 passed, 0 failed.
- **Scenarios and tests** (`test/check-contract-compatibility.test.ts`): "Malformed declarations": `a malformed declarations file fails and names each problem`; "Build metadata": `versions that differ only in build metadata are distinct and ordered by their text`; "Undeclared change under a minor bump": `an undeclared breaking change under a minor bump on 0.x fails and is named`; "Stale listed change": `a listed change that the check does not find is stale and named`; "Matching entry": `a matching entry passes whatever the order of the changes` and `a valid, sorted entry read from the file matches found changes in any order`; "Bump without found changes": `a listed change that the check does not find is stale and named`; "Declared breaking change" of "Breaking-change check": `a major bump also needs its breaking changes listed` and `a matching entry passes whatever the order of the changes`; "Entry without a bump": `an entry for a version that declares no breaking change is stale`; "History": `entries at or below the merge-base version and of other documents are history`; "Listing a declaration": `the listing prints the file format with the head version and an empty reason`. Also: majors, the unchanged rule without a bump, a well-formed file with semantic versioning precedence, the tracked file, code-unit order, the command line, the in-process AsyncAPI diff, and, from the pass 1 and pass 2 fixes, versions above 2^53, the combination of the problems, and an unknown `--base`.
- **Determinism.** Changes are deduplicated and sorted with `<` on UTF-16 code units; no `localeCompare`; `OASDIFF_IMAGE` unchanged.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `docs`, `test`, and `chore`: tooling, a private package, and documents change; the published `taskelith` package does not.

## History seed

The entry for `packages/contracts/documents/sdlc.asyncapi.json` 0.4.0 lists 306 changes: the base `9196804b:packages/contracts/documents/sdlc.asyncapi.json` (0.3.0) against the document at `24d25938` (0.4.0), diffed in process with the pinned `@asyncapi/parser` and `@asyncapi/diff` and the script's `asyncapiContractChanges`, deduplicated and sorted; two runs gave byte-identical output, and the count equals the 306 that `bind-evidence-to-code-head` recorded. A probe on `34d99f3a` ran the committed check functions in process: against `9196804b`, `declarationProblems` with the tracked file reports nothing and `listedDeclarations` prints exactly the file's list; against the merge base `24d25938` (0.4.0 to 0.4.0, no changes) it reports nothing, the entry being history. `make contract-breaking-changes BASE=9196804b` on the working tree of `a9b25bb3` plus the coordinator's record edits (no script change), exit 0: standard error reports 0 breaking changes for both OpenAPI documents and for `execution.asyncapi.json`, and 306 for `sdlc.asyncapi.json`; standard output is one entry, `sdlc.asyncapi.json` 0.4.0 with an empty reason, whose `breakingChanges` equal those of the seeded entry in the same order (306 strings); `packages/contracts/breaking-changes.json` stayed unchanged.

## Checks and results

Author checks on `34d99f3a` and its working tree, without Docker:

- `node --experimental-strip-types --test test/check-contract-compatibility.test.ts`: 21 tests, 21 pass, 0 fail.
- With `test/verify-stamp.test.ts` and `test/verification-record.test.ts`, which read the `Makefile`: 65 tests, 65 pass, 0 fail.
- Coverage of `scripts/check-contract-compatibility.ts` over its test file (`--experimental-test-coverage`): 76.50% lines, 95.93% branches, 82.46% functions; the uncovered lines are the oasdiff container, git, and the command entry point.
- `npx tsc -p tsconfig.check.json`, filtered to the changed script and test: no errors (the full run needs `npm run build` first).
- `npm run openspec -- validate declare-contract-breaking-changes --strict`: valid.
- `npm run verify:comments`, `npm run verify:links`: passed.
- `make -n contract-breaking-changes BASE='9196804b $(shell touch /tmp/x)'`: `BASE` reaches the command unexpanded, and `/tmp/x` was not created.

## Fails before the change

- Before the tests, the test file of `24d25938` against the unchanged script: 7 tests, 7 pass.
- The fail-before tests of `8a0e494e` against the unchanged script of `ae0fb944` (`24d25938`'s): the file fails to load, `SyntaxError: The requested module '../scripts/check-contract-compatibility.ts' does not provide an export named 'BREAKING_CHANGES_PATH'`; 1 test, 0 pass, 1 fail. The new tests of the brief's four cases (an undeclared change under a minor bump on 0.x, a stale listed change, an entry without a bump, a malformed file) are in that commit.
- A probe of the unchanged script: `compatibilityProblems('sdlc.asyncapi.json', '0.4.0', '0.5.0', ['remove /channels/a'])` returns `[]`, so the undeclared change passed.
- Stronger fail-before (coordinator's decision 5): the test file run against the script of `24d25938` unchanged, extended only by stub exports, in a temporary detached worktree of `a9b25bb3` (so the tracked declarations file is present), never committed. The stubs: `BREAKING_CHANGES_PATH` (the real path), the type `BreakingChangeDeclaration`, `declarationProblems` returning `[]`, `readDeclarations` accepting anything (`{ declarations: [], problems: [] }`), `sortedChanges` returning its input, `listedDeclarations` returning `[]`, `formatDeclarations` returning `''`, `parseMode` returning `{ print: false, base: undefined }`, and `asyncapiBreakingChanges` (not exported at `24d25938`) exported as a stub returning `[]`. Scratch evidence only: `/private/tmp/claude-503/-Users-petarnenov-taskelith/60eb664e-42f8-46bf-80ff-a5bf5be9f678/scratchpad/dcbc-fail-before/stub-check-contract-compatibility.ts`.
    - Test file of `8a0e494e`: 19 tests, 10 pass, 9 fail.
    - Test file of `a9b25bb3`: 21 tests, 10 pass, 11 fail.
    - Failing (all 9 of `8a0e494e`, plus the last 2 of `34d99f3a`): `an undeclared breaking change under a minor bump on 0.x fails and is named`, `a major bump also needs its breaking changes listed`, `a listed change that the check does not find is stale and named`, `an entry for a version that declares no breaking change is stale`, `a well-formed declarations file is read`, `a malformed declarations file fails and names each problem`, `the tracked declarations file is valid and keeps the SDLC AsyncAPI 0.4.0 history`, `changes sort by UTF-16 code units, not by locale, without duplicates`, `the listing prints the file format with the head version and an empty reason`; `the check takes --print, optionally with --base, and nothing else`, `AsyncAPI breaking changes are computed in process from two documents`. Each fails on its assertions, not on loading.
    - Passing, as expected: the 7 tests of `24d25938`, which cover unchanged behaviour (`declaresBreakingChange`, `versionProblems`, `compatibilityProblems`, the oasdiff and AsyncAPI change filters, the parser prefix); and 3 new tests whose assertions expect no problem from `declarationProblems`, which a stub returning `[]` satisfies: `a matching entry passes whatever the order of the changes`, `entries at or below the merge-base version and of other documents are history`, and `the existing rule still applies when the head version declares nothing` (its second assertion runs the unchanged `compatibilityProblems`). They guard the fix against false failures, not the gap.
- After the fix, `34d99f3a`: 21 tests, 21 pass; it adds two tests that were not part of the fail-before set, the command line (`parseMode`) and the in-process AsyncAPI diff.

## Route and make verify

- `make findings ARGS="route --change declare-contract-breaking-changes"` on `90931857`, committed unedited as `route.json` in `26a9c763`: `elevated (lines, contracts), rule version 1`; pass 1, reviewer A: `codex gpt-6.1-sol#high`; pass 2, reviewer B: `claude claude-opus-5-5#xhigh`; shadow `jev-1.14.0` elevated (0.94), agrees with the rule; recommendation only.
- `make verify` on `26a9c763` (tree `20f9f56a`), full profile, exit 0: the first run of the new check with Docker reports 0 breaking changes of each document against the merge base `24d25938` and `Contract documents have no undeclared breaking change.`; totals below.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `5c70c8b2de0360aece26f0243957add7f541998e`; tests 3066, pass 3042, fail 0, skipped 24; all files 99.38% lines, 92.68% branches, 99.07% functions.
- `npm run openspec -- validate declare-contract-breaking-changes --strict`: passed, `Change 'declare-contract-breaking-changes' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 66 file(s); every pass summary file is valid: 46 file(s); every route file is valid: 3 file(s).`.
- Spec diff against the merge base `24d259385778` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18236-3ca3-7db2-9678-9e40b1ea808a` | 0 | 0 | 1 | 2 |
| 2 | B | `claude claude-opus-5-5#high` | `9007bc81-c413-4a77-8d1e-b78c8a4fcc62` | 0 | 0 | 0 | 7 |
<!-- make record: end -->

## Independent review

Reviewer A, passes 1 and 3: Codex CLI (`gpt-6.1-sol`); reviewer B, pass 2: Claude Code (`claude-opus-5-5`).

### Review pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, session `01a18236-3ca3-7db2-9678-9e40b1ea808a`; run by the coordinator.
- **Revision reviewed:** `5820ce71`.
- **Invocation:** `env -u JEV_MAF_LAB codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** model, reasoning effort, read-only sandbox, and session ID in the output header.
- **Snapshot:** before and after the pass identical, as the coordinator reported it.
- **Result:** Critical 0, High 0, Medium 1, Low 2, as in `passes.jsonl` line 1 and `findings.jsonl` lines 1 to 3. File lines are those of `5820ce71`. The reviewer ran the 21 tests of the script (pass) and `verify:comments` (pass), and found that the 306 seeded changes equal those computed against `9196804b` and are history against `24d25938`; it ran neither Docker nor `make verify`.
- **M1, contract-drift** (`scripts/check-contract-compatibility.ts:41`, also lines 53 and 69): the version components and numeric prerelease identifiers were compared as `Number`, which loses precision above 2^53. With base and head `0.4.9007199254740992`, an entry for `0.4.9007199254740993` counted as history instead of stale, against "Stale and historical declarations"; adjacent large prerelease identifiers compared equal. Resolution: see "Pass 1 fixes".
- **L1, contract-drift** (`scripts/check-contract-compatibility.ts:184`): entries for one path with versions `0.5.0+linux` and `0.5.0+mac`, equal in precedence, were rejected as `repeats`, though their path and version differ, against "Breaking-change declarations". Resolution: see "Pass 1 fixes".
- **L2, spec-wording** (`specs/sdlc-wire-contracts/spec.md:22`): the scenario "Matching entry" accepted the listed changes "in any order", while `readDeclarations` rejects an entry whose `breakingChanges` are not sorted; the test called `declarationProblems` directly and so bypassed that validation. Resolution: see "Pass 1 fixes".

### Pass 1 fixes

Reviewed by reviewer B in pass 2, which found them correct.

- **M1 fix** (`5809ba1d`): `parseVersion` reads the major, minor, and patch components as `BigInt`, and `compareIdentifiers` compares numeric prerelease identifiers as `BigInt`, through the new `compareNumbers`; `declaresBreakingChange` and `compareVersions` use them. Design decision 5 says so. File: `scripts/check-contract-compatibility.ts`.
- **L1 fix** (`5809ba1d`, `8ac254f8`): `compareDeclarations` breaks a tie in precedence by the version text, so a repeat is the same path and version string, and `0.5.0+linux` sorts before `0.5.0+mac`. "Breaking-change declarations" (489 characters) now names the order, "path, version precedence, then version text", with the new scenario "Build metadata"; design decision 3 changes with it.
- **L2 fix** (`8ac254f8`): the scenario "Matching entry" reads "the file's entry for 0.5.0 is valid, so its changes are sorted, and lists exactly the found changes, whatever order the check finds them in".
- **Tests** (`640d7c06`, `test/check-contract-compatibility.test.ts`): `versions above 2^53 compare without loss of precision` (M1: a major and a minor bump, a stale entry `0.4.9007199254740993` over `0.4.9007199254740992`, and two adjacent prerelease identifiers); `versions that differ only in build metadata are distinct and ordered by their text` (L1, scenario "Build metadata"; the reverse order fails as unsorted, the same string as a repeat); `a valid, sorted entry read from the file matches found changes in any order` (L2, scenario "Matching entry": `readDeclarations`, then `declarationProblems`).
- **Fails before the fix.** The test file of `640d7c06` against its unchanged script (that of `5820ce71`), `node --experimental-strip-types --test test/check-contract-compatibility.test.ts`: tests 24, pass 22, fail 2, the M1 test (`declaresBreakingChange` of `9007199254740992.0.0` to `9007199254740993.0.0`: `actual: false`, `expected: true`) and the L1 test (`repeats ... 0.5.0+mac` instead of a valid file). The L2 test passed before the fix: it pins the validation-then-comparison path that already held and that the reviewer found untested. After the fix, `5809ba1d`: tests 24, pass 24.
- **Author checks after the fix:** `npm run verify:comments`: passed; `npx tsc -p tsconfig.check.json`, filtered to the changed script and test: no errors; coverage of `scripts/check-contract-compatibility.ts` over its test file: 76.98% lines, 97.71% branches, 82.76% functions; `npm run openspec -- validate declare-contract-breaking-changes --strict`: valid; an archive of the change in a scratch copy, then `npm run openspec -- validate --specs --strict`: 70 passed, 0 failed.
- **`make verify`** on `8ac254f8` (tree `9579d89e`), full profile, exit 0, stamp written: tests 3064, pass 3040, fail 0, skipped 24; coverage 99.38% lines, 92.69% branches, 99.07% functions; 0 breaking changes of each document against the merge base `24d25938`. `make record` wrote "Generated checks" from its log.
### Review pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, plan mode (read-only), session `9007bc81-c413-4a77-8d1e-b78c8a4fcc62`; run by the coordinator.
- **Revision reviewed:** `98fc21c3`.
- **Invocation:** `env -u JEV_MAF_LAB claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, as in the protocol's "Reviewer invocations".
- **Model confirmation:** `claude-opus-5-5` in the `modelUsage` of the log's last `"type":"result"` line, and its `session_id`.
- **Snapshot:** before and after the pass identical, as the coordinator reported it.
- **Result:** Critical 0, High 0, Medium 0, Low 7, as in `passes.jsonl` line 2 and `findings.jsonl` lines 4 to 10. File lines are those of `98fc21c3`. The reviewer ran the 24 tests of the script (pass), recomputed the seeded entry in process (306 changes, byte-identical over two runs, equal to the file without its reason, history against `24d25938`), and checked the handling of `BASE` in the `Makefile` and in git; it ran neither Docker nor `make verify`.
- **Pass 1 fixes:** the reviewer found them correct and tested: M1 compares version components and numeric prerelease identifiers as `BigInt`, and no `Number` comparison remains; L1 breaks a tie in precedence by the version text; L2's scenario wording and its test, which reads the file and then compares, hold. It found the logic of the requirements consistent with design decision 4 and the coordinator's decisions, the MODIFIED requirement a copy of the living text with the two shortenings that design decision 1 records, and pass 1 at effort `medium` against the route's `high` consistent with governance.
- **Integration note (not a finding):** `origin/dev` at `ff7ab7a0` adds `control-plane.openapi.json` to `CONTRACT_DOCUMENTS`, absent at this change's merge base and so needing no entry, and changes the `Makefile` line next to the edited `.PHONY` line, a likely textual conflict at integration.
- **L1, error-handling** (`scripts/check-contract-compatibility.ts:351`, `commitOf`): `make contract-breaking-changes BASE=no-such-rev` ended with an unhandled `execFileSync` stack trace instead of a clear message. Resolution: see "Pass 2 fixes".
- **L2, evidence-mismatch** (`scripts/check-contract-compatibility.ts:340`, `checkDocuments`): no test covered how the compatibility and declaration problems combine, or that a malformed file skips the declaration comparison; dropping the `declarationProblems` call would pass every test. Resolution: see "Pass 2 fixes".
- **L3, spec-wording** (`specs/sdlc-wire-contracts/spec.md:7`): the code rejects unsorted or repeated `breakingChanges`, which only the schema description stated; the requirement and the scenario "Malformed declarations" did not. Resolution: see "Pass 2 fixes".
- **L4, docs** (`packages/contracts/breaking-changes.schema.json:35`): `reason` has `maxLength: 500`, which neither design decision 3 nor the requirement mentioned. Resolution: see "Pass 2 fixes".
- **L5, stale-citation** (`scripts/check-contract-compatibility.ts:13`): the header cited "ADR 0004 item 6", while the ADR, `AGENTS.md`, and the design say "principle". Resolution: see "Pass 2 fixes".
- **L6, docs** (`docs/dependencies.md:103`): the oasdiff row named only `make contract-compatibility` as its runner. Resolution: see "Pass 2 fixes".
- **L7, evidence-mismatch** (`verification.md:30-31`): the author self-check still gave 442 characters for "Breaking-change declarations", 489 after the pass 1 L1 fix, and its scenario list lacked "Build metadata" and the test that reads the file for "Matching entry". Resolution: see "Pass 2 fixes".

### Pass 2 fixes

Unreviewed fixes: pass 2 reported only Low findings, so under the governance rule "Low findings are fixed" they are fixed and recorded with the outcome `fixed-unreviewed`, and the reviewer is not called again. Pass 3 does not run: pass 2 reported no Critical or High finding, and the review of a Low-only pass ends with it, although the L1 and L2 fixes change the script.

- **L1 fix** (`180e3ed7`): `commitOf` returns `undefined` when git cannot resolve `BASE` to a commit, and `printDeclarations` then reports `BASE <rev> is not a commit.`, exit 1, before any comparison. `make contract-breaking-changes BASE=no-such-rev` now prints that line. A value that starts with `-` still gives the usage message with exit 2, as reviewed; the reviewer's optional `--base=` form in the `Makefile` was not adopted.
- **L2 fix** (`180e3ed7`): the combination moves into the exported pure function `documentProblems(comparisons, reading)`, which `checkDocuments` calls.
- **L3 fix** (`a5226388`): the scenario "Malformed declarations" names changes not sorted and unique. The requirement keeps its 489 characters: adding the rule to it would pass the 500-character limit of strict validation, and its scenario states it.
- **L4 fix** (`a5226388`): design decision 3 names the reason's limit of 500 characters.
- **L5 fix** (`180e3ed7`): the script header cites "ADR 0004 principle 6".
- **L6 fix** (`a5226388`): the oasdiff row of `docs/dependencies.md` names both `make contract-compatibility` and `make contract-breaking-changes`.
- **L7 fix** (`a33ee524`): the author self-check gives the character counts as of the pass 2 fixes and maps "Build metadata" and the file-reading test of "Matching entry".
- **Tests** (`ea490e40`, `test/check-contract-compatibility.test.ts`): `the check adds the declarations to the existing rule, unless the file is malformed` (L2: a matching entry, a minor bump without an entry, a patch bump whose entry is stale next to the existing rule's problem, and a malformed file that skips the declarations); `an unknown --base revision fails with a message, not a stack trace` (L1: runs the script with `--print --base no-such-rev` and expects exit 1, empty standard output, and exactly the message on standard error).
- **Fails before the fix.** The test file of `ea490e40` against its unchanged script (that of `98fc21c3`): it fails to load, `SyntaxError: ... does not provide an export named 'documentProblems'`. With only the L2 extraction applied: tests 26, pass 25, fail 1, the L1 test (`actual` standard error `Error: Command failed: git rev-parse --verify --quiet --end-of-options no-such-rev^{commit}` with its stack trace). Mutation probes of the extraction, reverted: dropping the `declarationProblems` call, or the guard that skips it for a malformed file, each fails the L2 test (tests 26, fail 2 with the L1 test). After the fix, `180e3ed7`: tests 26, pass 26.
- **Author checks after the fix:** `npm run verify:comments`: passed; `npx tsc -p tsconfig.check.json`, filtered to the changed script and test: no errors; coverage of `scripts/check-contract-compatibility.ts` over its test file: 82.71% lines, 94.48% branches, 88.33% functions (the spawned script now counts); `npm run openspec -- validate declare-contract-breaking-changes --strict`: valid.
- **`make verify`** on `a33ee524` (tree `5c70c8b2`), full profile, exit 0, stamp written: tests 3066, pass 3042, fail 0, skipped 24; coverage 99.38% lines, 92.68% branches, 99.07% functions; 0 breaking changes of each document against the merge base `24d25938`. `make record` wrote "Generated checks" from its log.
- **Review complete:** two passes, pass 1 by reviewer A and pass 2 by reviewer B; the Low-only pass 2 ends the review.

## Remaining gates

- Archive.
- Integration into dev by the coordinator (single pull request).
