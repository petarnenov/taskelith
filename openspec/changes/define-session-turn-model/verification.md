# Verification: define-session-turn-model

Status: phase 2 developed; independent review pending.

## Scope and source

- G3 item 4 ([G3 work plan](/docs/g3-plan.md), row 4), size M-L, assigned by the coordinator on 2026-10-28. The brief's scope is the plan row: the pure domain of the session timeline, with ordered turns with immutable identity and a client idempotency key, serialized mutable turns, permission and input requests persisted before display, single consumption of a response, a duplicate response or a reused native request ID under another provider generation rejected, unresolved requests after a restart reconciled and never replayed, stream retention with cursor recovery, at most one active attempt per session as the [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 10 requires, and the handoff a session writes when its slot reports a limit, kept for the next session of the task.
- Sources named by the brief: [architecture section 7](/docs/architecture.md#7-plugins-and-execution-isolation), R29, the capacity reservation contract section 10, G2 item 7 (archived `define-execution-domain-model`), and item 3 (archived `define-agent-harness-port` and `align-harness-identifiers`).
- Excluded by the brief: persistence adapters, wire schemas and AsyncAPI (item 9), the session timeline implementation (item 13), the UI event stream (item 14), and the harness host (item 18).
- Phase 1 (`a6acbc51`): design only. `proposal.md`, `design.md` with six open questions, `tasks.md`, and a draft spec delta; no contract and no code.
- Phase 2: the away delegate's decisions on the open questions, relayed by the coordinator on 2026-10-28 ([design](design.md) decisions 20 to 25), the contract, the fail-before tests, and the domain module.

## Revision

- Base: `dev` `1c73e1a7`.
- Phase 1 commit: `a6acbc51` `docs: design the session turn model`.
- Phase 2 commits: `d16b3828` `docs: record the delegate decisions of the session turn model`; `a0fbf051` `docs: add the session timeline contract`; `c88e1ada` `test: add the failing session timeline tests`; `7041ebe2` `chore: implement the session timeline domain`; `a72e133d` `chore: define the shared harness values in the execution domain`; and the commit that adds this record.

## Way of working

- Developed by a subagent that the session briefed under the [subagent execution](/docs/agent-task-protocol.md#subagent-execution) rule; the session checks the result, runs the review, and hands off.

## Environment

Native Ubuntu Linux x86_64 host; Node.js v24.22.0.

## Author self-check before review

- Contract, spec delta, and design checked against each other and against the code (task 2.2): operation names, the order of checks, and the failure codes of the contract's section 2 table match the functions in `packages/modules/execution/src/domain/session-*.ts`; every spec scenario has a test in `packages/modules/execution/test/session-*.test.ts`.
- Neutrality (task 3.4): `grep -n -i -E "claude|codex|opencode|anthropic|openai|gpt|gemini|kimi|antigravity|agy|sonnet|opus" src/domain/session-*.ts test/session-*.ts` in `packages/modules/execution` found nothing (exit status 1).
- The first `make verify` on `7041ebe2` failed in `npm run check:boundaries`: seven R03 violations, because the session files imported types and `MAX_HARNESS_TEXT_LENGTH` from `ports/agent-harness.ts`, `ports/agent-harness-data.ts`, and `ports/standing-approval-rules.ts`, and a domain file may import no port. `a72e133d` moves `TURN_OUTCOMES`, `HARNESS_FAILURES`, `PERMISSION_DECISIONS`, `DELEGATION_OUTCOMES`, `MAX_HARNESS_TEXT_LENGTH`, their types, and `HarnessRequestKind` unchanged into `domain/harness-values.ts`, and `StandingRuleId` into `domain/identifiers.ts`; the port files re-export them, so the module's exports are unchanged ([design](design.md) decision 4).
- Unchanged and not edited, as the brief requires: `docs/g3-plan.md` and `docs/contracts/agent-harness-port.md`.

## Fail-before

On `c88e1ada` (`test: add the failing session timeline tests`), whose session timeline functions are stubs that throw `not implemented` and whose `parseSessionGeneration` returns an `internal` failure for every positive value, after `npm run build`: `node --experimental-strip-types --test packages/modules/execution/test/session-*.test.ts` reported `tests 49`, `pass 3`, `fail 46`, exit status 1. The 49 are the 47 tests of `session-turns` (19), `session-requests` (20), and `session-output` (8), and one file-level failure each for `session-attempts` and `session-handoff`, whose top-level `generation(...)` constants failed on the stubbed parser when the files loaded, so none of their 16 and 8 tests ran. Every failure is a stub's `Error: not implemented` or the stubbed parser's `internal` failure. The 3 passing tests pin contract constants that the stubs already declare (`TURN_STATES`, `REQUEST_STATES` with `DELIVERY_STATES`, and `OUTPUT_RETENTION_BYTES`) and test no behavior.

After the implementation (`7041ebe2`), the same command reported `tests 71`, `pass 71`, `fail 0`. One test changed with the implementation: the expired-cursor test of `session-output` appended `'y'` and `'z'` beyond a full window, which drops only one entry, so it asserted the wrong earliest position; it now appends two full chunks.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| Phase 1 working tree on `1c73e1a7` | `npm run openspec -- validate define-session-turn-model --strict` | Change 'define-session-turn-model' is valid |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:comments` | Every comment is within the comment length rule |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:links` | Every checked link conforms |
| Phase 1 working tree on `1c73e1a7` | `npm run verify:findings` | Every findings file is valid: 58 file(s); every pass summary file is valid: 38 file(s) |
| Working tree of `d16b3828` | `npm run openspec -- validate define-session-turn-model --strict`; `npm run verify:links`; `npm run verify:comments`; `npm run verify:archive` | Change valid; every checked link conforms; every comment within the rule; every active change archives into strictly valid specs |
| `7041ebe2` | `node --experimental-strip-types --test packages/modules/execution/test/session-*.test.ts` (after `npm run build`) | `tests 71`, `pass 71`, `fail 0` |
| `7041ebe2` | `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/execution/dist/domain/session-*.js' --test-coverage-include='packages/modules/execution/dist/domain/identifiers.js' packages/modules/execution/test/session-*.test.ts` | Lines, branches, functions: `session-attempts.js` 100, 100, 100; `session-handoff.js` 100, 96.15, 100; `session-output.js` 100, 93.75, 100; `session-records.js` 100, 100, 100; `session-requests.js` 100, 98.28, 100; `session-turns.js` 100, 100, 100 |
| `7041ebe2` | `make verify` | Failed: `npm run check:boundaries` reported seven R03 violations (author self-check above) |
| Working tree that became `a72e133d` | `node --experimental-strip-types --test packages/modules/execution/test/*.test.ts` (after `npm run build`) | `tests 240`, `pass 240`, `fail 0` |
| Working tree that became `a72e133d` | `make verify` | Passed, exit status 0: `tests 2619`, `suites 45`, `pass 2572`, `fail 0`, `skipped 47`; coverage over all files 99.33% lines, 92.72% branches, 99.00% functions; the new files `harness-values.js` and `identifiers.js` 100, 100, 100 and the session files as in the row above; boundary checks passed; `Totals: 70 passed, 0 failed (70 items)` in OpenSpec validation; every checked link conforms; every active change archives into strictly valid specs; every findings file valid (58 files, 38 pass summary files); packed file allowlist and installed CLI verification passed |

## Independent review

Pending. `passes.jsonl` and `findings.jsonl` are empty: no pass has run.

## Limitations

- The model is pure: persistence, uniqueness of an attempt across a task's sessions in storage, crash points, wire schemas, the UI stream, and the inbox items are items 9, 13, 14, and 18 (contract section 10).
- The acknowledgement inbox item of decision 23 has no item kind in the product ports contract section 4.1 yet ([design](design.md) source note 4).
- The UI POC README "Requests" line names a client turn key but not queueing; queueing rests on `docs/ui-poc/src/screens/Session.tsx` line 291 ([design](design.md) decision 21).

## Remaining gates

- The independent review by reviewers A and B, and `make verify` after its fixes.
- Follow-up for the coordinator, outside this change: add item 4 to the handoff owners of the [agent harness port contract](/docs/contracts/agent-harness-port.md) section 4.1 ([design](design.md) source note 2).
- Integration into dev by the coordinator (single pull request).
