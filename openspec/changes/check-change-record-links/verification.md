# Verification: check-change-record-links

## Scope and source

Owner-delegated decision D+A+B2 (away run `20261027T062002Z-opencode-43478`), briefed by the coordinator Niki to the worker session Pepi on 2026-10-27: a record link convention, the `npm run verify:links` check in `make verify`, a baseline of the archived links that break it, the fix of the broken document links, and the rule in worker step 6 and the evidence check. Developed by a subagent briefed by the worker session, under [subagent execution](/docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/check-change-record-links` on branch `check-change-record-links`. Base revision: `bd6108d4` on `dev`. Scope: `scripts/check-record-links.ts`, `scripts/record-links-baseline.tsv`, `test/check-record-links.test.ts`, `package.json`, `package-lock.json`, `Makefile`, `docs/dependencies.md`, `docs/dependencies/licenses.json`, `docs/dependencies/sbom.cdx.json`, `docs/agent-task-protocol.md`, `docs/governance.md`, and this change with its empty `findings.jsonl` and `passes.jsonl`. Exclusions: no file under `openspec/changes/archive/` changes. Commit types `chore`, `test`, and `docs`: the published package's runtime code and packaged documents do not change; its `package.json` gains the `verify:links` script and the `marked` development dependency, which the tarball does not contain.

## Links on the base

The checker, run on `bd6108d4` plus this change's script, reports 332 failing links:

- 331 in 175 files of 82 of the 193 archived changes, each a relative link that leaves its change directory. 324 miss their target: 323 are one `../` too shallow and resolve with one more, and 1, `../run-g2-failure-scenarios-composition/verification.md` in `2026-10-26-harden-worker-container-seccomp/verification.md` line 5, links a sibling change that was active when written and has since been archived under a date. 7 resolve: 5 with `../../../../docs/` and 2 to a sibling archived change, `../2026-10-27-run-g2-native-acceptance-x86-64/verification.md`, in `2026-10-27-alternate-reviewers-per-pass` and `2026-10-27-require-finding-capability`. Of the 331 occurrences, 323 are distinct pairs of file and target.
- `docs/dependencies.md` line 126 linked the active path of `compose-minimal-local-installation-images`, archived as `2026-10-25-compose-minimal-local-installation-images`.

The brief cited about 285 broken links in 71 archived changes and a second broken link at `docs/local-installation.md:62`. The counts above are the checker's on `bd6108d4`. Line 62 of `docs/local-installation.md` already links the archived paths on `bd6108d4`, as written in `5af2f9f8`, and the checker reports no problem in that file, so it is not edited. `openspec/specs/` and `docs/qualification/` have no failing link.

## Revision

Tests in `a826db45`; the checker, the baseline, and the `package.json` and `Makefile` entries in `64033fc2`; the `docs/dependencies.md` link in `a10fee17`; worker step 6 and the evidence check in `7cb246df`; this change's records in `461b5a54`; the escape tests' examples changed to a link that resolves only once archived and one that resolves only before in `6ed4ab5c`, after which the checks below ran again. The record update `b8d6d1e6` followed. Merge `c8d595e5` brought `origin/dev` at `34af90f4` (#343, review pass statistics), which added `passes.jsonl` to worker steps 2, 5, and 6; the conflict in step 6 was resolved by keeping dev's text and adding this change's link sentence after the example, and this change gained its empty `passes.jsonl`. After the merge `npm run verify:links`, `npm run verify:findings` (21 findings files, 2 pass summary files), `npm run verify:comments`, and `npm run openspec -- validate --all --strict --no-interactive` (70 passed) passed again, and `git diff --stat bd6108d4 -- openspec/changes/archive` shows only #343's archived change. Review pass 1 fixes: regression tests in `b05f198b`; the `marked` lexer, the spec delta rule for fragment-only links, `package.json`, `package-lock.json`, and the regenerated inventory in `1e8bfbf3`; the register row in `74b38c29`; the requirement, proposal, design, and tasks in `bab53323`; `findings.jsonl`, `passes.jsonl`, and this record in the commit after it.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`, npm 12.2.1, dependencies from `make setup`; workspace packages built with `npm run build` for the type check; no Docker.

## Author self-check

- AGENTS.md and ADR 0004: TypeScript only; one new development dependency, `marked@15.0.12`, exact-pinned at the version the lockfile already resolved, registered in `docs/dependencies.md`, and absent from the tarball; small functions with one job each, pure parsing and baseline functions, file access in `LinkChecker`, `markdownFiles`, and `linkReport`; every comment within two lines of 80 characters.
- Contract-drift: the `integration-flow`, `agent-task-protocol`, and `review-process` requirements, worker step 6, the evidence check, and the script state the same rule, and each scenario of the record link check and its baseline has a test.
- Packaged documents: the check accepts relative links under `docs/`, so `docs/architecture.md` keeps the relative links that `scripts/verify-package.ts` requires.
- Error-handling: a baseline line without exactly one tab and an entry outside `openspec/changes/archive/` throw with the line or path; stale entries fail the check.
- Redaction: the output holds only repository paths, line numbers, and link targets from tracked files.
- Requirements: 489, 404, 320, and 182 characters, under OpenSpec's 500; `npm run verify:archive` archived this change in a temporary copy and validated it strictly.
- Coverage: `npm test` covers only built product modules, so the script was measured separately: 96.13 % lines, 89.47 % branches, 100 % functions. The uncovered lines are the fallback for an unknown named entity, the `decoded` fallback for a malformed percent escape, and the command-line entry.
- Evidence check: no external link is added; every link in this change's records is root-relative or inside the change directory, and `npm run verify:links` passes with the change placed at its archived path. The counts and citations above come from the commands below on the stated revisions.

## Test-first evidence

The tests were written before the implementation. Against a stub that exported the checker's interface with empty results, `node --experimental-strip-types --test test/check-record-links.test.ts` reported 18 tests, 0 passed, 18 failed. At `a826db45`, which holds the tests without the script, the test file fails to load with `ERR_MODULE_NOT_FOUND`. With the checker: 18 passed, 0 failed.

Review pass 1: the six regression tests of `b05f198b` ran against the script of `848802f7`, which `b05f198b` still holds unchanged: 24 tests, 19 passed, 5 failed. The failures were the parentheses, title, and line-break destinations (M1), indented, block-quoted, and multi-line code and an invalid closing fence (M2), the ATX and Setext anchors (M3), the fragment-only link in a spec delta (M4), and reference-style links (L5); the URI scheme boundary test passed, because the script already skipped every scheme. After `1e8bfbf3`: 24 passed, 0 failed.

## Checks

After the review pass 1 fixes, on `bab53323` with this record's update:

- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/check-record-links.ts' test/check-record-links.test.ts`: 24 of 24 passed; coverage as above.
- `npm run check:boundaries`, which runs `tsc -p tsconfig.check.json` over `scripts/` and `test/`, after `npm run build`: passed.
- `npm run verify:links`: `Every checked link conforms; 331 archived links remain in scripts/record-links-baseline.tsv.` The lexer finds the same 331 archived problems as the earlier patterns: no new entry and no stale one.
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:findings`: `Every findings file is valid: 21 file(s); every pass summary file is valid: 2 file(s).`
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `make dependency-inventory`: regenerated `docs/dependencies/licenses.json` (input hashes) and `docs/dependencies/sbom.cdx.json` (`marked@15.0.12` as a direct dependency); `npm install --save-dev --save-exact --ignore-scripts marked@15.0.12` changed the lockfile only in its root entry, so no resolution changed. `npm run verify:dependencies`: 731 package paths verified.
- `npm run verify:package`: packed file allowlist and installed CLI verification passed; `npm pack --dry-run` lists only `LICENSE`, `README.md`, `dist/cli.js`, `docs/architecture.md`, and `package.json`, with no bundled dependency.
- `git diff --stat origin/dev -- openspec/changes/archive`: empty.

Before review pass 1:

- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/check-record-links.ts' test/check-record-links.test.ts`: 18 of 18 passed; coverage as above.
- `npm run check:boundaries`, which runs `tsc -p tsconfig.check.json` over `scripts/` and `test/`, after `npm run build`: passed.
- `npm run verify:links`: `Every checked link conforms; 331 archived links remain in scripts/record-links-baseline.tsv.`
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:findings`: `Every findings file is valid: 20 file(s).`
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `git diff --stat origin/dev -- openspec/changes/archive`: empty.
- `make verify` on `e68d1528` (2026-10-27, worker session, Docker Desktop, iMac slot): failed at `npm run verify:dependencies` with `Dependency inventory is stale; changed inputs: package.json`, because the new `verify:links` script changed `package.json`. `make dependency-inventory` regenerated `docs/dependencies/licenses.json`, committed as `a0c58359`.
- `make verify` on `a0c58359` (finished 2026-10-27T12:00:41Z): passed. 2131 tests, 2129 passed, 0 failed, 2 skipped; coverage of all files 99.29 % lines, 92.11 % branches, 99.00 % functions; contract documents without undeclared breaking change; 731 package paths verified; OpenSpec 70 passed, 0 failed; `Every checked link conforms; 331 archived links remain in scripts/record-links-baseline.tsv.`; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed.
- `make verify` on `34feb40b`, after the review pass 1 fixes (finished 2026-10-27T12:13:52Z): passed. 2137 tests, 2135 passed, 0 failed, 2 skipped; coverage of all files 99.29 % lines, 92.10 % branches, 99.00 % functions; contract documents without undeclared breaking change; 731 package paths verified; OpenSpec 70 passed, 0 failed; `Every checked link conforms; 331 archived links remain in scripts/record-links-baseline.tsv.`; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed.

## Independent review

### Review pass 1

Reviewer A, Codex CLI (gpt-6-astra), model `gpt-6-astra`, effort medium, sandbox `read-only`. Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Session `01a17d3c-4cc5-71a1-9d83-43ca490f6410`, on `848802f7`. Snapshot before and after: `5bf3aa698e792d6cd455077768966309b0025351afce21ccafcb509111d6136c`, unchanged. The reviewer's sandbox could not run the tests (`EPERM` on `mkdtemp`: 7 passed, 11 failed). Result: 0 Critical, 0 High, 4 Medium, 3 Low, all in `findings.jsonl` and fixed; the Low findings came with Medium ones, so pass 2 checks them.

- M1 contract-drift, `scripts/check-record-links.ts`: the link pattern cut `missing(foo).md`, missed titles in parentheses, and missed destinations on the next line. Links now come from `marked`'s GFM lexer (`1e8bfbf3`), with a regression test.
- M2 contract-drift, same file: indented code, fences in block quotes, and multi-line code spans were read as text, and a fence closed despite trailing text. The lexer separates code and raw HTML (`1e8bfbf3`), with a regression test.
- M3 contract-drift, same file: anchors kept `_` emphasis and raw entities and ignored Setext headings. Anchors are now slugs of the rendered heading text with entities decoded and the `-1` numbering kept (`1e8bfbf3`), with a regression test.
- M4 contract-drift, same file: a fragment-only link in a spec delta escaped the root-relative rule. The rule now runs first (`1e8bfbf3`), with a regression test.
- L5 contract-drift, the requirement and the script: the requirement excluded only `http`, `https`, and `mailto` and promised every link. Reference-style links are now checked at each use (`1e8bfbf3`), and the requirement, proposal, and design name inline and reference links and exclude any URI scheme (`bab53323`), with tests.
- L6 evidence-mismatch, `proposal.md` and this record: they said the changed files were outside the published package. Both now say that runtime code and packaged documents are unchanged and that `package.json` gains a script and a development dependency (`bab53323` and this record).
- L7 evidence-mismatch, `tasks.md`: task 4.3 stayed open after a passing `make verify`. Ticked in `bab53323`.

## Limitations

- The author subagent ran neither `make verify` nor `npm test`, because the machine's Docker slot was held by another session; the worker session ran `make verify`, which includes the tests, as recorded under Checks.
- A reference-style definition that no link uses is not checked.

## Remaining gates

- Independent review pass 2 by reviewer B, and pass 3 by reviewer A if pass 2 has findings above Low.
- Archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
