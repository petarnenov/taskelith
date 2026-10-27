# Verification: check-change-record-links

## Scope and source

Owner-delegated decision D+A+B2, relayed by the worker session Pepi's brief on 2026-10-27: a record link convention, the `npm run verify:links` check in `make verify`, a baseline of the archived links that break it, the fix of the broken document links, and the rule in worker step 6 and the evidence check. Developed by a subagent briefed by the worker session, under [subagent execution](/docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/check-change-record-links` on branch `check-change-record-links`. Base revision: `bd6108d4` on `dev`. Scope: `scripts/check-record-links.ts`, `scripts/record-links-baseline.tsv`, `test/check-record-links.test.ts`, `package.json`, `Makefile`, `docs/dependencies.md`, `docs/agent-task-protocol.md`, `docs/governance.md`, and this change with its empty `findings.jsonl`. Exclusions: no file under `openspec/changes/archive/` changes. Commit types `chore`, `test`, and `docs`: the touched files are outside the published package's `files` allowlist.

## Links on the base

The checker, run on `bd6108d4` plus this change's script, reports 332 failing links:

- 331 in 175 files of 82 of the 193 archived changes, each a relative link that leaves its change directory. 324 miss their target: 323 are one `../` too shallow and resolve with one more, and 1, `../run-g2-failure-scenarios-composition/verification.md` in `2026-10-26-harden-worker-container-seccomp/verification.md` line 5, links a sibling change that was active when written and has since been archived under a date. 7 resolve: 5 with `../../../../docs/` and 2 to a sibling archived change, `../2026-10-27-run-g2-native-acceptance-x86-64/verification.md`, in `2026-10-27-alternate-reviewers-per-pass` and `2026-10-27-require-finding-capability`. Of the 331 occurrences, 323 are distinct pairs of file and target.
- `docs/dependencies.md` line 126 linked the active path of `compose-minimal-local-installation-images`, archived as `2026-10-25-compose-minimal-local-installation-images`.

The brief cited about 285 broken links in 71 archived changes and a second broken link at `docs/local-installation.md:62`. The counts above are the checker's on `bd6108d4`. Line 62 of `docs/local-installation.md` already links the archived paths on `bd6108d4`, as written in `5af2f9f8`, and the checker reports no problem in that file, so it is not edited. `openspec/specs/` and `docs/qualification/` have no failing link.

## Revision

Tests in `a826db45`; the checker, the baseline, and the `package.json` and `Makefile` entries in `64033fc2`; the `docs/dependencies.md` link in `a10fee17`; worker step 6 and the evidence check in `7cb246df`; this change's records in `461b5a54`; the escape tests' examples changed to a link that resolves only once archived and one that resolves only before in `6ed4ab5c`, after which the checks below ran again. This record's update follows in the next commit.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`, npm 12.2.1, dependencies from `make setup`; workspace packages built with `npm run build` for the type check; no Docker.

## Author self-check

- AGENTS.md and ADR 0004: TypeScript only, no new dependency; small functions with one job each, pure parsing and baseline functions, file access in `LinkChecker`, `markdownFiles`, and `linkReport`; every comment within two lines of 80 characters.
- Contract-drift: the `integration-flow`, `agent-task-protocol`, and `review-process` requirements, worker step 6, the evidence check, and the script state the same rule, and each scenario of the record link check and its baseline has a test.
- Packaged documents: the check accepts relative links under `docs/`, so `docs/architecture.md` keeps the relative links that `scripts/verify-package.ts` requires.
- Error-handling: a baseline line without exactly one tab and an entry outside `openspec/changes/archive/` throw with the line or path; stale entries fail the check.
- Redaction: the output holds only repository paths, line numbers, and link targets from tracked files.
- Requirements: 480, 404, 320, and 182 characters, under OpenSpec's 500; `npm run verify:archive` archived this change in a temporary copy and validated it strictly.
- Coverage: `npm test` covers only built product modules, so the script was measured separately: 96.19 % lines, 95.83 % branches, 100 % functions. The uncovered lines are the `decoded` fallback for a malformed percent escape and the command-line entry.
- Evidence check: no external link is added; every link in this change's records is root-relative or inside the change directory, and `npm run verify:links` passes with the change placed at its archived path. The counts and citations above come from the commands below on the stated revisions.

## Test-first evidence

The tests were written before the implementation. Against a stub that exported the checker's interface with empty results, `node --experimental-strip-types --test test/check-record-links.test.ts` reported 18 tests, 0 passed, 18 failed. At `a826db45`, which holds the tests without the script, the test file fails to load with `ERR_MODULE_NOT_FOUND`. With the checker: 18 passed, 0 failed.

## Checks

- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/check-record-links.ts' test/check-record-links.test.ts`: 18 of 18 passed; coverage as above.
- `npm run check:boundaries`, which runs `tsc -p tsconfig.check.json` over `scripts/` and `test/`, after `npm run build`: passed.
- `npm run verify:links`: `Every checked link conforms; 331 archived links remain in scripts/record-links-baseline.tsv.`
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:findings`: `Every findings file is valid: 20 file(s).`
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `git diff --stat origin/dev -- openspec/changes/archive`: empty.

## Independent review

Not started.

## Limitations

- `make verify` was not run by the author subagent: the machine's Docker slot was held by another session, and `make verify` starts integration services.
- `npm test` was not run for the same reason; only the checker's test file ran.
- Reference-style link definitions are not checked; no checked file uses them.

## Remaining gates

- `make verify`.
- Independent review, reviewer A for passes 1 and 3 and reviewer B for pass 2.
- Archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
