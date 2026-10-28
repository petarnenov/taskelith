# Verification: define-session-turn-model

Status: phase 2 developed; review complete: passes 1 (reviewer A) and 2 (reviewer B) fixed, pass 3 (reviewer A) confirmed with no finding; three passes, the cap reached.

## Scope and source

- G3 item 4 ([G3 work plan](/docs/g3-plan.md), row 4), size M-L, assigned by the coordinator on 2026-10-28. The brief's scope is the plan row: the pure domain of the session timeline, with ordered turns with immutable identity and a client idempotency key, serialized mutable turns, permission and input requests persisted before display, single consumption of a response, a duplicate response or a reused native request ID under another provider generation rejected, unresolved requests after a restart reconciled and never replayed, stream retention with cursor recovery, at most one active attempt per session as the [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 10 requires, and the handoff a session writes when its slot reports a limit, kept for the next session of the task.
- Sources named by the brief: [architecture section 7](/docs/architecture.md#7-plugins-and-execution-isolation), R29, the capacity reservation contract section 10, G2 item 7 (archived `define-execution-domain-model`), and item 3 (archived `define-agent-harness-port` and `align-harness-identifiers`).
- Excluded by the brief: persistence adapters, wire schemas and AsyncAPI (item 9), the session timeline implementation (item 13), the UI event stream (item 14), and the harness host (item 18).
- Phase 1 (`a6acbc51`): design only. `proposal.md`, `design.md` with six open questions, `tasks.md`, and a draft spec delta; no contract and no code.
- Phase 2: the away delegate's decisions on the open questions, relayed by the coordinator on 2026-10-28 ([design](design.md) decisions 20 to 25), the contract, the fail-before tests, and the domain module.

## Revision

- Base: `dev` `1c73e1a7`; after pass 3, `052eb181` merged `origin/dev` `f6696995`, and `5db45ef1` merged `origin/dev` `3de597be`, the new merge base.
- Phase 1 commit: `a6acbc51` `docs: design the session turn model`.
- Phase 2 commits: `d16b3828` `docs: record the delegate decisions of the session turn model`; `a0fbf051` `docs: add the session timeline contract`; `c88e1ada` `test: add the failing session timeline tests`; `7041ebe2` `chore: implement the session timeline domain`; `a72e133d` `chore: define the shared harness values in the execution domain`; and the commit that adds this record.
- Review pass 1 fixes: `e076bed5` `test: build the session generations inside each test`; `f9d91d1b` `chore: record no entry for empty session output`; `87a5c2af` `chore: make the host the responder of delegation results`; `ff0e2ef5` `test: cover the bounds of every session answer text`; `ba741f9e` `docs: separate recording a session request from persisting it`; and the commit that records the pass.
- Review pass 2 fixes: `d8ea0a17` `test: cover requests of queued and ended turns and tidy the session tests`; `4f1594dd` `chore: bind no attempt to a stopped session`; `752cab87` `chore: let a standing rule give only a permission answer`; `33983762` `chore: compare the author of a retried session turn`; `93f2b51e` `chore: let the host deliver a delegation outcome as a session turn`; `1563c646` `docs: state the responder of an answer as its own requirement`; `93d8dfa9` `docs: state the failure codes of a generation start`; `dac55234` `chore: freeze only the new session output entry on append`; `4b942d6b` `chore: import the harness request kind at the top of the port data`; `bdb8b706` `docs: correct the identifiers coverage record of the session turn model`; and the commit that records the pass.
- Review pass 3: `5d19de54` `docs: record review pass 3 of the session turn model`; no fix.
- Merge of `dev`: `052eb181` merged `origin/dev` `f6696995` with no conflict. `git diff 1c73e1a7 origin/dev --stat` over this change's inputs (`docs/contracts/agent-harness-port.md`, `docs/contracts/capacity-reservation.md`, `docs/contracts/product-ports.md`, `packages/modules/execution`, `openspec/specs/execution-model`, `docs/operational-targets.md`, `docs/g3-plan.md`) is empty, and `openspec/specs/session-turn-model` does not exist on `dev`, so the merge invalidates no evidence and needs no review.
- Second merge of `dev`: `5db45ef1` merged `origin/dev` `3de597be` (#384 and #385) with no conflict; `git diff f6696995 origin/dev --stat` over the same inputs is empty, and `openspec/specs/session-turn-model` still does not exist on `dev`. #385 adds policy version 7 with a `route.json` record before pass 1; this change's three passes ran before it, so the change has no `route.json`.

## Way of working

- Developed by a subagent that the session briefed under the [subagent execution](/docs/agent-task-protocol.md#subagent-execution) rule; the session checks the result, runs the review, and hands off.

## Environment

Native Ubuntu Linux x86_64 host; Node.js v24.22.0.

## Author self-check before review

- Contract, spec delta, and design checked against each other and against the code (task 2.2): operation names, the order of checks, and the failure codes of the contract's section 2 table match the functions in `packages/modules/execution/src/domain/session-*.ts`; every spec scenario has a test in `packages/modules/execution/test/session-*.test.ts`.
- Neutrality (task 3.4): `grep -n -i -E "claude|codex|opencode|anthropic|openai|gpt|gemini|kimi|antigravity|agy|sonnet|opus" src/domain/session-*.ts test/session-*.ts` in `packages/modules/execution` found nothing (exit status 1).
- The first `make verify` on `7041ebe2` failed in `npm run check:boundaries`: seven R03 violations, because the session files imported types and `MAX_HARNESS_TEXT_LENGTH` from `ports/agent-harness.ts`, `ports/agent-harness-data.ts`, and `ports/standing-approval-rules.ts`, and a domain file may import no port. `a72e133d` moves `TURN_OUTCOMES`, `HARNESS_FAILURES`, `PERMISSION_DECISIONS`, `DELEGATION_OUTCOMES`, `MAX_HARNESS_TEXT_LENGTH`, their types, and `HarnessRequestKind` unchanged into `domain/harness-values.ts`, and `StandingRuleId` into `domain/identifiers.ts`; the port files re-export them, so the module's exports are unchanged ([design](design.md) decision 4).
- Evidence check: not recorded before pass 1, and recorded here after pass 3. The change's records, its spec delta, and `docs/contracts/session-timeline.md` have no external link (`grep` for `http` found nothing), and every repository link conforms and resolves, as `npm run verify:links` reported in every `make verify` of the checks below, pass 1 onward.
- Unchanged and not edited, as the brief requires: `docs/g3-plan.md` and `docs/contracts/agent-harness-port.md`.

## Fail-before

On `c88e1ada` (`test: add the failing session timeline tests`), whose session timeline functions are stubs that throw `not implemented` and whose `parseSessionGeneration` returns an `internal` failure for every positive value, after `npm run build`: `node --experimental-strip-types --test packages/modules/execution/test/session-*.test.ts` reported `tests 49`, `pass 3`, `fail 46`, exit status 1. The 49 are the 47 tests of `session-turns` (19), `session-requests` (20), and `session-output` (8), and one file-level failure each for `session-attempts` and `session-handoff`, whose top-level `generation(...)` constants failed on the stubbed parser when the files loaded, so none of their 16 and 8 tests ran. Every failure is a stub's `Error: not implemented` or the stubbed parser's `internal` failure. The 3 passing tests pin contract constants that the stubs already declare (`TURN_STATES`, `REQUEST_STATES` with `DELIVERY_STATES`, and `OUTPUT_RETENTION_BYTES`) and test no behavior.

After the implementation (`7041ebe2`), the same command reported `tests 71`, `pass 71`, `fail 0`. One test changed with the implementation: the expired-cursor test of `session-output` appended `'y'` and `'z'` beyond a full window, which drops only one entry, so it asserted the wrong earliest position; it now appends two full chunks.

### Follow-up check after review pass 1

The record above stays as it was; pass 1 finding 3 showed that 24 tests never ran in it. `e076bed5` builds the generations inside each test (`generationStart` in `session-attempts`, `firstTurnEnd` in `session-handoff`). In a scratch directory outside the repository, the tree of `ba741f9e` with `packages/modules/execution/src` replaced by that of `c88e1ada` (the stubs), after `npm run build`, `node --experimental-strip-types --test --test-reporter=tap packages/modules/execution/test/session-<file>.test.ts` reported, each with exit status 1:

| File | Tests | Pass | Fail | Failures |
| --- | --- | --- | --- | --- |
| `session-attempts` | 16 | 0 | 16 | 15 `not implemented`; 1 the stubbed parser's `internal` failure |
| `session-handoff` | 8 | 0 | 8 | 7 `not implemented`; 1 the stubbed parser's `internal` failure |
| `session-requests` | 24 | 1 | 23 | 18 `not implemented`; 5 the stubbed parser's `internal` failure |

The passing test pins `REQUEST_STATES` and `DELIVERY_STATES`. The four answer bound tests of finding 4 (permission message, input text, delegation summary, delegation ID) are among the failures. Nothing of the scratch directory was committed.

### Fail-before of the pass 1 behavior fixes

- Finding 1: with the new tests of `f9d91d1b` on the domain of `e076bed5` (before the fix), `node --experimental-strip-types --test --test-reporter=tap packages/modules/execution/test/session-output.test.ts` reported `tests 10`, `pass 9`, `fail 1`: "empty output records no entry and takes no position" failed, the 1000 empty appends reaching `lastPosition` 1001. After the fix: `tests 10`, `pass 10`, `fail 0`.
- Finding 2: with the new tests of `87a5c2af` on the domain of `f9d91d1b` (before the fix), `session-requests.test.ts` reported `tests 21`, `pass 20`, `fail 1`: "only the host returns a delegation result, and the host answers nothing else" failed with `expected a failure`. After the fix, `session-*.test.ts` reported `tests 74`, `pass 74`, `fail 0`.

### Fail-before of the pass 2 behavior fixes

Each run below used `packages/modules/execution/dist` built by `npm run build` from the commit before the fix, with the new tests in the working tree; the command is `node --experimental-strip-types --test --test-reporter=tap packages/modules/execution/test/<file>`.

| Finding | Domain of | Test file | Before the fix | After the fix |
| --- | --- | --- | --- | --- |
| M1 | `d8ea0a17` | `session-attempts.test.ts` | `tests 17`, `pass 16`, `fail 1`: "a stopped session binds no attempt, which stays free for the next session" with `expected a failure` | `tests 17`, `pass 17`, `fail 0` |
| M2 | `4f1594dd` | `session-requests.test.ts` | `tests 27`, `pass 26`, `fail 1`: "a standing rule answers only a permission request" with `expected a failure` | `session-*.test.ts`: `tests 81`, `pass 81`, `fail 0` |
| L1 | `752cab87` | `session-turns.test.ts` | `tests 20`, `pass 19`, `fail 1`: "a key reused by another author fails with conflict" with `expected a failure` | `session-*.test.ts`: `tests 82`, `pass 82`, `fail 0` |
| M3 | `33983762` | `session-*.test.ts` | `tests 86`, `pass 81`, `fail 5` | `tests 86`, `pass 86`, `fail 0` |

The five M3 failures: "a host turn needs a delegation request that can no longer be answered" (`expected a failure`); "a retried host turn is a duplicate, and its key from a person fails with conflict"; and three tests that retry a person's turn ("a retried submission returns the existing turn, and the timeline has no new turn", "a turn without an outcome at its generation end is outcome-unknown, final, and never redelivered", and "an account-limit-reached outcome stops the session, and a new turn fails"). The last four failed with `conflict`, because the author became an object that the old domain compared by reference. The two new tests that record a host turn passed before the fix, since the old domain took any author. The L4 tests pin behavior the domain already had and passed when added (`d8ea0a17`: `session-*.test.ts` `tests 79`, `pass 79`, `fail 0`); the L2 and L3 changes keep behavior, and every test passed after each.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| Phase 1 working tree on `1c73e1a7` | `npm run openspec -- validate define-session-turn-model --strict` | Change 'define-session-turn-model' is valid |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:comments` | Every comment is within the comment length rule |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:links` | Every checked link conforms |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:findings` | Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s) |
| Working tree of `d16b3828` | `npm run openspec -- validate define-session-turn-model --strict`; `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive` | Change valid; every checked link conforms; every comment within the rule; every active change archives into strictly valid specs |
| `7041ebe2` | `node --experimental-strip-types --test packages/modules/execution/test/session-*.test.ts` (after `npm run build`) | `tests 71`, `pass 71`, `fail 0` |
| `7041ebe2` | `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/execution/dist/domain/session-*.js' --test-coverage-include='packages/modules/execution/dist/domain/identifiers.js' packages/modules/execution/test/session-*.test.ts` | Lines, branches, functions: `session-attempts.js` 100, 100, 100; `session-handoff.js` 100, 96.15, 100; `session-output.js` 100, 93.75, 100; `session-records.js` 100, 100, 100; `session-requests.js` 100, 98.28, 100; `session-turns.js` 100, 100, 100; the figure of `identifiers.js`, which the command includes, was not recorded (review pass 2, finding L6), and the pass 2 row below measures it |
| `7041ebe2` | `make verify` | Failed: `npm run check:boundaries` reported seven R03 violations (author self-check above) |
| Working tree that became `a72e133d` | `node --experimental-strip-types --test packages/modules/execution/test/*.test.ts` (after `npm run build`) | `tests 240`, `pass 240`, `fail 0` |
| Working tree that became `a72e133d` | `make verify` | Passed, exit status 0: `tests 2619`, `suites 45`, `pass 2572`, `fail 0`, `skipped 47`; coverage over all files 99.33% lines, 92.72% branches, 99.00% functions; the new file `harness-values.js` and the changed file `identifiers.js` 100, 100, 100 and the session files as in the row above; boundary checks passed; `Totals: 70 passed, 0 failed (70 items)` in OpenSpec validation; every checked link conforms; every active change archives into strictly valid specs; every findings file valid (58 files, 38 pass summary files); packed file allowlist and installed CLI verification passed |
| Working tree of the pass 1 record, on `ba741f9e` | `node --experimental-strip-types --test --test-reporter=tap packages/modules/execution/test/session-*.test.ts` (after `npm run build`) | `tests 77`, `pass 77`, `fail 0` |
| Same | Coverage command of the `7041ebe2` row, session files only | Lines, branches, functions: `session-attempts.js` 100, 100, 100; `session-handoff.js` 100, 96.15, 100; `session-output.js` 100, 94.12, 100; `session-records.js` 100, 100, 100; `session-requests.js` 100, 98.36, 100; `session-turns.js` 100, 100, 100 |
| Same | `npm run openspec -- validate define-session-turn-model --strict` | Change 'define-session-turn-model' is valid |
| Same | `make findings ARGS="validate"` | Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s) |
| Same | `make verify` | Passed, exit status 0: `tests 2625`, `suites 45`, `pass 2578`, `fail 0`, `skipped 47`; coverage over all files 99.33% lines, 92.72% branches, 99.00% functions; boundary checks passed; `Totals: 70 passed, 0 failed (70 items)`; every checked link conforms; every active change archives into strictly valid specs; every comment within the rule; every findings file valid; packed file allowlist and installed CLI verification passed |
| Pass 2 fixes, on `4b942d6b` | `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/execution/dist/domain/session-*.js' --test-coverage-include='packages/modules/execution/dist/domain/identifiers.js' packages/modules/execution/test/session-*.test.ts` (after `npm run build`) | `tests 86`, `pass 86`, `fail 0`; lines, branches, functions: `identifiers.js` 85.71, 85.71, 100 (lines 4-5, `parseRecoveryEpoch`, which no session test calls); `session-attempts.js` 100, 100, 100; `session-handoff.js` 100, 96.15, 100; `session-output.js` 100, 94.12, 100; `session-records.js` 100, 100, 100; `session-requests.js` 100, 98.31, 100; `session-turns.js` 100, 100, 100 |
| Same | `node --experimental-strip-types --test --test-reporter=tap packages/modules/execution/test/*.test.ts` (after `npm run build`) | `tests 255`, `pass 255`, `fail 0` |
| Started on `4b942d6b`; `bdb8b706`, a record-only commit, landed during the run | `make verify` | Passed, exit status 0: `tests 2634`, `suites 45`, `pass 2587`, `fail 0`, `skipped 47`; coverage over all files 99.33% lines, 92.74% branches, 99.00% functions; `harness-values.js` and `identifiers.js` 100, 100, 100 and the session files as in the row above; boundary checks passed; `Totals: 70 passed, 0 failed (70 items)`; every checked link conforms; every active change archives into strictly valid specs; every comment within the rule; every findings file valid (58 files, 38 pass summary files, before the pass 2 lines were added); packed file allowlist and installed CLI verification passed |
| Working tree of the pass 2 record | `npm run openspec -- validate define-session-turn-model --strict`; `npm run verify:links`; `npm run verify:archive`; `npm run verify:comments`; `make findings ARGS="validate"` | Change 'define-session-turn-model' is valid; every checked link conforms; every active change archives into strictly valid specs; every comment within the rule; every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s) |
| `052eb181`, tree `10340418`, after the first merge of `dev` | `make verify` | Passed, exit status 0, profile full: `tests 2754`, `pass 2707`, `fail 0`, `skipped 47`; coverage over all files 99.33% lines, 92.74% branches, 99.00% functions; superseded by the second merge |
| After the second merge of `dev` | `make verify` (log `dstm-verify-merged.log` in the session scratchpad) | Generated part below |
| Same, with this record | `make record CHANGE=define-session-turn-model LOG=<log>`; `make record-check CHANGE=define-session-turn-model`; `make findings ARGS="validate"` | Generated part written; `the generated part matches the tree`; every findings file is valid: 61 file(s); every pass summary file is valid: 41 file(s) |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `10340418de3b1fa4321c2afd8d411cc720be110b`; tests 2754, pass 2707, fail 0, skipped 47; all files 99.33% lines, 92.74% branches, 99.00% functions.
- `npm run openspec -- validate define-session-turn-model --strict`: passed, `Change 'define-session-turn-model' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 61 file(s); every pass summary file is valid: 41 file(s).`.
- Spec diff against the merge base `f6696995dce0` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a1810d-68db-72f2-bb07-f7912fe9652f` | 0 | 0 | 3 | 2 |
| 2 | B | `claude claude-opus-5-5#high` | `3bad015b-b840-418b-aeb4-1944bbc559ff` | 0 | 0 | 3 | 7 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a1818b-d77c-73d0-a4cb-bc5a1061d753` | 0 | 0 | 0 | 0 |
<!-- make record: end -->

## Independent review

- Pass 1, reviewer A: Codex `gpt-6.1-sol`, variant `medium`, session `01a1810d-68db-72f2-bb07-f7912fe9652f`; 0 critical, 0 high, 3 medium, 2 low, all fixed ([findings](findings.jsonl), [passes](passes.jsonl)). Finding 1 is design decision 32 and finding 2 decision 33. The findings outside this directory name the capability `execution-model`, the closest existing one, because `make findings` accepts only directories under `openspec/specs` and rejects `session-turn-model` as unknown.
- Pass 2, reviewer B: Claude Code `claude-opus-5-5`, variant `high`, session `3bad015b-b840-418b-aeb4-1944bbc559ff`; 0 critical, 0 high, 3 medium, 7 low, all fixed ([findings](findings.jsonl), [passes](passes.jsonl)). M1 is design decision 34 and M3 decision 35; M2 extends decision 33 and names `missedBy` pass 1 (reviewer A), because it is the gap of pass 1 finding 2 for standing rules. L2 has the category `docs` because the vocabulary has no performance category. L6 and L7 concern this change's records and name no capability.
- Pass 3, reviewer A: Codex `gpt-6.1-sol`, variant `medium`, session `01a1818b-d77c-73d0-a4cb-bc5a1061d753`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`; the header confirmed `model: gpt-6.1-sol` and `reasoning effort: medium`, and the snapshot was unchanged (`01321953…`). A confirmation pass: all 10 pass 2 fixes correct and complete, no new problem; 0 critical, 0 high, 0 medium, 0 low ([passes](passes.jsonl)). The reviewer ran `session-*.test.ts` (86/86) and the execution tests (255/255) with `--test-isolation=none`; it could not reproduce the coverage in its read-only sandbox.
- The review is complete: three passes, the cap reached.

## Limitations

- The model is pure: persistence, uniqueness of an attempt across a task's sessions in storage, crash points, wire schemas, the UI stream, and the inbox items are items 9, 13, 14, and 18 (contract section 10).
- The acknowledgement inbox item of decision 23 has no item kind in the product ports contract section 4.1 yet ([design](design.md) source note 4).
- A delegation result whose delivery is `refused` allows no host outcome turn, because `refused` does not tell the port's `conflict` from `not-found`; how the host returns that outcome is item 18's and item 38's ([design](design.md) decision 35).
- The UI POC README "Requests" line names a client turn key but not queueing; queueing rests on `docs/ui-poc/src/screens/Session.tsx` line 291 ([design](design.md) decision 21).

## Remaining gates

- Follow-up for the coordinator, outside this change: add item 4 to the handoff owners of the [agent harness port contract](/docs/contracts/agent-harness-port.md) section 4.1 ([design](design.md) source note 2).
- Integration into dev by the coordinator (single pull request).
