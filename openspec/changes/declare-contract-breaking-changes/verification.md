# Verification

Draft record of the author's work before `make verify` and review; it names the checks that have not run yet (Remaining gates).

## Scope and source

- **Source:** the coordinator's brief (Niki, 2026-10-28), owner-approved on 2026-10-28: `declare-contract-breaking-changes`, size S-M.
- **Base revision:** `24d25938` (`origin/dev`, merge of pull request #389, `bind-evidence-to-code-head`).
- **Commits:** `ae0fb944` (proposal, design, spec delta, tasks), `8a0e494e` (fail-before tests), `34d99f3a` (check, declarations file and schema, `make contract-breaking-changes`, docs).
- **Scope:** `packages/contracts/breaking-changes.json` and its schema; the declaration check, its validation, and the listing in `scripts/check-contract-compatibility.ts`; `make contract-breaking-changes`; the author workflow in `docs/contracts/execution-wire-contracts.md`; the history entry of the SDLC AsyncAPI document 0.4.0.
- **Out of scope:** version 1.0 of any contract, and changes to the contract documents or the detectors.

## Environment

The owner's 2020 Intel iMac: macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through nvm.

## Author self-check

- **Contract first.** `ae0fb944` holds the proposal, the design, and the spec delta before the tests and the code.
- **Spec delta:** `sdlc-wire-contracts` added "Breaking-change declarations" (442 characters), "Declared breaking changes listed" (365), "Stale and historical declarations" (403), "Breaking-change listing" (391). The brief named `contract-tooling`; design decision 1 records why the delta goes to `sdlc-wire-contracts`.
- **Scenarios and tests** (`test/check-contract-compatibility.test.ts`): "Malformed declarations": `a malformed declarations file fails and names each problem`; "Undeclared change under a minor bump": `an undeclared breaking change under a minor bump on 0.x fails and is named`; "Stale listed change": `a listed change that the check does not find is stale and named`; "Matching entry": `a matching entry passes whatever the order of the changes`; "Entry without a bump": `an entry for a version that declares no breaking change is stale`; "History": `entries at or below the merge-base version and of other documents are history`; "Listing a declaration": `the listing prints the file format with the head version and an empty reason`. Also: majors, the unchanged rule without a bump, a well-formed file with semantic versioning precedence, the tracked file, code-unit order, the command line, and the in-process AsyncAPI diff.
- **Determinism.** Changes are deduplicated and sorted with `<` on UTF-16 code units; no `localeCompare`; `OASDIFF_IMAGE` unchanged.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `docs`, `test`, and `chore`: tooling, a private package, and documents change; the published `taskelith` package does not.

## History seed

The entry for `packages/contracts/documents/sdlc.asyncapi.json` 0.4.0 lists 306 changes: the base `9196804b:packages/contracts/documents/sdlc.asyncapi.json` (0.3.0) against the document at `24d25938` (0.4.0), diffed in process with the pinned `@asyncapi/parser` and `@asyncapi/diff` and the script's `asyncapiContractChanges`, deduplicated and sorted; two runs gave byte-identical output, and the count equals the 306 that `bind-evidence-to-code-head` recorded. A probe on `34d99f3a` ran the committed check functions in process: against `9196804b`, `declarationProblems` with the tracked file reports nothing and `listedDeclarations` prints exactly the file's list; against the merge base `24d25938` (0.4.0 to 0.4.0, no changes) it reports nothing, the entry being history. `make contract-breaking-changes BASE=9196804b` was not run, because it starts the oasdiff container (brief: no Docker command before `make verify`).

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
- After the fix, `34d99f3a`: 21 tests, 21 pass; it adds two tests that were not part of the fail-before set, the command line (`parseMode`) and the in-process AsyncAPI diff.

## Remaining gates

- `make findings ARGS="route --change declare-contract-breaking-changes"` and its `route.json`.
- `make verify`, `make record`, and `make record-check`, including the first run of the new check with Docker.
- `make contract-breaking-changes BASE=9196804b`, expected to print the seeded list for the SDLC AsyncAPI document.
- Independent review passes and their records.
- Archive.
- Integration into dev by the coordinator (single pull request).
