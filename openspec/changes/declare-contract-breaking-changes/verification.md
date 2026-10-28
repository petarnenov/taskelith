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
- **Spec delta:** `sdlc-wire-contracts` added "Breaking-change declarations" (442 characters), "Declared breaking changes listed" (456), "Stale and historical declarations" (403), "Breaking-change listing" (391), and modified "Breaking-change check" (491, living text 493). The brief named `contract-tooling`; design decision 1 records why the delta goes to `sdlc-wire-contracts`. An archive of the change in a scratch copy, then `npm run openspec -- validate --specs --strict`: 70 passed, 0 failed.
- **Scenarios and tests** (`test/check-contract-compatibility.test.ts`): "Malformed declarations": `a malformed declarations file fails and names each problem`; "Undeclared change under a minor bump": `an undeclared breaking change under a minor bump on 0.x fails and is named`; "Stale listed change": `a listed change that the check does not find is stale and named`; "Matching entry": `a matching entry passes whatever the order of the changes`; "Bump without found changes": `a listed change that the check does not find is stale and named`; "Declared breaking change" of "Breaking-change check": `a major bump also needs its breaking changes listed` and `a matching entry passes whatever the order of the changes`; "Entry without a bump": `an entry for a version that declares no breaking change is stale`; "History": `entries at or below the merge-base version and of other documents are history`; "Listing a declaration": `the listing prints the file format with the head version and an empty reason`. Also: majors, the unchanged rule without a bump, a well-formed file with semantic versioning precedence, the tracked file, code-unit order, the command line, and the in-process AsyncAPI diff.
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

- `make verify`: passed, profile full, tree `20f9f56affc74eae7637e3b7735586a3dac6695f`; tests 3061, pass 3037, fail 0, skipped 24; all files 99.38% lines, 92.69% branches, 99.07% functions.
- `npm run openspec -- validate declare-contract-breaking-changes --strict`: passed, `Change 'declare-contract-breaking-changes' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 66 file(s); every pass summary file is valid: 46 file(s); every route file is valid: 3 file(s).`.
- Spec diff against the merge base `24d259385778` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
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

## Remaining gates

- Independent review passes and their records.
- Archive.
- Integration into dev by the coordinator (single pull request).
