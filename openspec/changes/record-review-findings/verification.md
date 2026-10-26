# Verification: record-review-findings

## Scope and source

Owner task relayed on 2026-10-27 by the coordinator (Niki): step 1 of a review-knowledge loop, in which every reviewer finding is recorded in a structured, git-tracked form and fed back into briefs before implementation, centralized in the repository without a database. Developed by a subagent briefed and checked by the worker session (Maki), under [subagent execution](../../../docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/record-review-findings` on branch `record-review-findings`. Base revision: `b95ebe7` on `dev`. Scope: the finding schema and category vocabulary, `npm run findings` (`validate`, `index`, `checklist`) and its tests, `make verify` wiring, the protocol, governance, and skill text, and this change with its empty `findings.jsonl`. After the coordinator merged `origin/dev` at `1847570` (`add-fleet-skills`, merge commit `ccfc372`), the scope also covers one findings line each in the `taskelith-worker` handoff list and the `taskelith-coordinator` skill. Exclusions: no database, no owner-facing UI, no backfill of archived changes, and no other edits to the fleet skills. Commit types `chore`, `test`, and `docs`: `scripts/` and `docs/review-findings/` are outside the `files` allowlist of `package.json` (`dist/`, `docs/architecture.md`, `README.md`, `LICENSE`), so the published package does not change.

## Environment

macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1 from `.nvmrc`, npm as pinned by `make verify`, Docker for the services of `make test`.

## Author self-check

- AGENTS.md and ADR 0004: TypeScript only; pure rules (`scripts/review-findings.ts`) separate from file access, argument parsing, and the ajv adapter (`scripts/findings.ts`); small functions; every comment within two lines of 80 characters (`npm run verify:comments`); no new package (`ajv@8.20.0` is already installed for `@taskelith/plugin-sdk` and `@taskelith/contracts`; after coordinator decision B it is also declared as a root development dependency, with `package-lock.json` and `docs/dependencies` regenerated and its row in `docs/dependencies.md` updated); `make verify` drives the check.
- Coverage: `npm test` measures only built product modules, so the two script modules were measured separately (below) at 100 % lines and functions and 98.40 % branches, above the 75 % gate.
- Requirements: each ADDED requirement is under 400 characters, and `make verify` archives the change in a temporary copy and validates it strictly.
- Without backfill: `validate` requires `findings.jsonl` only in active changes; the 170 archived changes without one pass, and worker step 7 checks the file of a newly archived change.
- Evidence check: no external link is added; the results below come from the commands listed.

## Checks

- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/findings.ts' --test-coverage-include='scripts/review-findings.ts' test/review-findings.test.ts test/findings.test.ts`: 24 of 24 tests passed; `findings.ts` 100 % lines, 97.37 % branches, 100 % functions; `review-findings.ts` 100 % lines, 99.11 % branches, 100 % functions.
- `npm run verify:findings` on this repository: `Every findings file is valid: 1 file(s).`
- `npm run openspec -- validate record-review-findings --strict`: valid.
- `npm run verify:archive`: every active change archives into strictly valid specs.
- `npm run verify:comments`: every comment is within the rule.
- Sample run on a scratch fixture with two archived changes and five findings: `validate`, `index`, and `checklist --capability review-process --files 'scripts/**' --top 5` printed the expected counts, shares, and three checklist items.
- `make verify` failed first on `830e47a` only because the dependency inventory hashes `package.json`, which gained the `findings` and `verify:findings` scripts; `make dependency-inventory` regenerated `docs/dependencies/licenses.json`, whose only change is that hash (commit `1434376`).
- `make verify` passed on `1434376`: `npm run verify:findings` valid; 1,978 tests, 1,976 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.09 % branches, 99.04 % functions; 0 breaking contract changes; dependency inventory verified (731 paths); strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.
- After the coordinator's merge of `origin/dev` (`ccfc372`), the fleet skill lines, and the root `ajv` declaration, `make verify` passed on `bec4d52` (its working tree differed only by removing a blank line in this record): `npm run verify:findings` valid; 1,978 tests, 1,976 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.09 % branches, 99.04 % functions; 0 breaking contract changes against `1847570`; dependency inventory verified (731 paths); strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.
- After the review pass 1 fixes, `make verify` passed on `8b941ba`: `npm run verify:findings` valid with this change's eight findings; 1,983 tests, 1,981 passed, 0 failed, 2 skipped; coverage 99.29 % lines, 92.09 % branches, 99.04 % functions; no undeclared breaking contract change; dependency inventory verified (731 paths); strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed. The two script modules, measured separately with 29 tests: `findings.ts` 100 % lines, 97.56 % branches, 100 % functions; `review-findings.ts` 100 % lines, 99.12 % branches, 100 % functions.
- After the review pass 2 fixes, `make verify` passed on `e0c9d9b`: `npm run verify:findings` valid with this change's eleven findings; 1,985 tests, 1,983 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.10 % branches, 99.04 % functions; no undeclared breaking contract change; dependency inventory verified (731 paths); strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.

## Independent review

- **Pass 1 — Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a17a97-de81-7280-9fe9-e2e56a17146f`, revision `31139ee`.** Run by the worker session (Maki) with the protocol's invocation, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`; the output header confirmed the model, the reasoning effort, the read-only sandbox, and the session ID, and the working-tree snapshot was `c6ff865ef589081351cf7aaf97b5a9d22fdec1d48706e6e481bd3030e2343f9d` both before and after the pass, so the reviewer changed nothing. Findings: 0 Critical, 1 High, 4 Medium, 3 Low, all fixed in `da5d560` (code) and `37d21bc` (tests), with the protocol and skill text in the following docs commit, and recorded as eight lines of `findings.jsonl` with outcome `fixed` for the next pass to check. Each fix has a regression test; with the pass 1 code restored and the new tests, 8 tests failed (H1, M2 twice, M3, M4 with L6, L7, and the changed diagnostics), and all pass on the fixed code. M5 changes only a test, so it has no failing-before run.
  1. High, redaction (`scripts/review-findings.ts:109`, `scripts/findings.ts:111`): diagnostics echoed input through the JSON parse message and unknown property names. Fixed: an unparsable line gets `not a JSON value`; ajv diagnostics never name an unknown property; a line with a secret-like value gets only that diagnostic. Tests assert that the token is absent on the parse and the schema paths.
  2. Medium, contract-drift (`scripts/findings.ts:92`): `src/{a,{b,c}}.ts,docs/**` split wrongly. Fixed: `splitList` tracks brace depth; tested through `parseCommand` and `matchesQuery`.
  3. Medium, redaction (`docs/review-findings/finding.schema.json:106`): free text allowed C1 controls and U+2028/U+2029. Fixed in the shared text pattern; negative tests for title and resolution.
  4. Medium, redaction (`scripts/review-findings.ts:144`): username-only URL credentials were missed. Fixed: any non-empty URL user information is secret-like; tested with username only, user and password, and plain URLs.
  5. Medium, contract-drift (`test/review-findings.test.ts:55`): the test pinned exactly 15 categories. Fixed: it asserts the seeded categories, and a new test adds one vocabulary line and validates a finding in the new category.
  6. Low, redaction (`scripts/review-findings.ts:143`): the AWS pattern missed `ASIA`. Fixed and tested.
  7. Low, error-handling (`scripts/review-findings.ts:78`): category ids were not limited to 64 characters. Fixed with the line named; 64/65 boundary test.
  8. Low, process (ADR 0004 principle 7): no Makefile entry. Fixed: `make findings ARGS="<command>"`; the protocol, the requirements, and the skills point at it, and the npm scripts stay as the implementation.
- **Pass 2 — Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a17aa0-112c-7911-afe3-4cd8c6b40542`, revision `4a0a7da`.** Same invocation; the worker session confirmed the model, effort, and sandbox in the header, and the snapshot was `5731a2efaedca5d501ab6b0fe61bb29fa2497e800163ac34f0f0dffe0e1c81c3` before and after the pass. The reviewer confirmed pass 1 findings 1, 2, 3, 4, 6, and 7 as fixed and the defect of finding 5 as removed. Findings: 0 Critical, 0 High, 1 Medium, 2 Low, fixed in `ff53da9` (code) and `0b8f21b` (tests) and recorded as three `findings.jsonl` lines with outcome `fixed`. With the pass 2 code restored, the two new tests of findings 1 and 2 failed; all pass on the fixed code. Finding 3 changes only a test.
  1. Medium, error-handling (`Makefile:71`): `$(ARGS)` went through the shell, so `make findings ARGS='checklist --files scripts/**'` failed with `unexpected argument`. Fixed: the recipe runs with `set -f`, so the documented forms work as written; the protocol says so; a test runs the real Makefile entry with `scripts/*.ts`, which matches several files.
  2. Low, redaction (`scripts/review-findings.ts:148`): the NATS seed pattern missed `SN`, `SC`, and `SX`. Fixed; tested through full finding validation for all six seed kinds, with a short non-seed string accepted.
  3. Low, contract-drift (`test/review-findings.test.ts:66`): the extension test assumed `supply-chain` is never seeded. Fixed: the test picks an id that the vocabulary does not hold and uses it throughout.

## Limitations

- Follow-up: `scripts/integration-broker.ts` also imports an undeclared root dependency, `@nats-io/nkeys`; it is left unchanged by this change.
- The secret patterns are heuristics for common token shapes, not a guarantee.
- The checklist starts empty, because no archived change has findings yet.
- Branches with active changes that predate this change need an empty `findings.jsonl` after they merge `dev`.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
