# Verification

Date: 2026-10-26. The author's verification is recorded below; the independent review is pending.

## Scope and source

This change makes the worker end an acknowledged assignment locally when launch authorization rejects it with `assignment-not-active`, as `docs/contracts/capacity-reservation.md:151` (section 8) requires. The coordinating session assigned it and ran it in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)).
- **Base revision:** `a38aefc` on `dev`.
- **Revision verified:** `bedf3d7` (the fix, the tests, and these records before this file).
- **Scope:** `endsAssignment` in the execution domain, the snapshot read of the SQLite worker journal, their tests, and the worker-runtime delta.
- **Out of scope:** the control plane's handling of `assignment-not-active` (only recorded), every other rejection reason, and the launch orchestrator, which already stops launching after a final rejection.

## Contract rule

- `docs/contracts/capacity-reservation.md:151`: the worker ends an acknowledged assignment locally on an assignment-ended command or an `assignment-not-active` rejection, and stops counting it.
- `docs/contracts/capacity-reservation.md:143`: only assignments that have not ended, and non-terminal executions, are counted.
- `docs/contracts/launch-authorization.md:116`: `assignment-not-active` is not retryable; the current owner decides.
- `docs/contracts/worker-journal.md:93` and `:111`: W3 journals a non-retryable rejection with its observation; nothing is retried after it.

The local end has the effect of an end command: not counted, not launched, reported `ended`. An end command publishes no observation and the rejection's observation is already journaled at W3, so nothing new is published or journaled (design D1, D3). No contract changes.

## Author self-check

- The end is derived from the durable W3 row, so it holds after a restart and needs no new write point or journal format.
- A late `execution.assignment.end` takes the existing W1 path: journaled once, no outbox entry, no recovery action; its redelivery is a `duplicate`.
- Every new comment is at most two lines of at most 80 characters.
- Commit types are `chore`, `test`, and `docs`; no package published from this repository changes.

## Evidence check

- **Fails on the old code.** With the tests added and the source of `a38aefc`, after `npm run build`: `node --experimental-strip-types --test --test-name-pattern="assignment-not-active|ended locally" --test-reporter=spec apps/worker/test/command-intake.test.ts` gave 1 pass, 1 fail. `a launch rejected with assignment-not-active ends its assignment` failed with `actual: [ 'assignment-1' ]`, `expected: [ 'assignment-1', 'assignment-2' ]`: the worker refused the second offer. (The late-end test then lacked its assertion that the assignment is ended before the end command; that assertion was added afterwards and also fails on the old code.)
- **Passes on the new code.** `node --experimental-strip-types --test apps/worker/test/*.test.ts packages/adapters/worker-journal/test/*.test.ts packages/modules/execution/test/*.test.ts` after `npm run build`: 481 tests, 479 pass, 0 fail, 2 skipped, including the three new tests.

## Checks

- `npm run openspec -- validate end-assignment-on-not-active --strict`: valid.
- `make verify` at `bedf3d7`: exit 0; 1920 tests, 1918 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.09%, functions 99.04%. No flaky rerun was needed. This file is the only later change.

Environment: macOS (Darwin 25.6.0), Node v24.22.1 from `.nvmrc`, Docker test services started by `make verify`.

## Independent review

Pending; the coordinating session runs it.

## Limitations

- The local end lives in the SQLite journal's snapshot read; another journal implementation would have to apply `endsAssignment` too.
- The inventory reports such an assignment as `ended` before the control plane's end command; the control plane's reconciliation acts only on omitted assignments.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
- No deployment validation was done; none is claimed.
