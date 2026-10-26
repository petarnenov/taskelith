# Verification

Date: 2026-10-26. The author's verification and the independent review are recorded below.

## Scope and source

This change makes the worker end an acknowledged assignment locally when launch authorization rejects it with `assignment-not-active`, as `docs/contracts/capacity-reservation.md:151` (section 8) requires. The coordinating session assigned it and ran it in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)).
- **Base revision:** `a38aefc` on `dev`.
- **Revision verified:** `bedf3d7` (the fix, the tests, and these records before this file); after review pass 1, `f5ed7de`.
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

- **Fails on the old code.** With the tests added and the source of `a38aefc`, after `npm run build`: `node --experimental-strip-types --test --test-name-pattern="assignment-not-active|ended locally" --test-reporter=spec apps/worker/test/command-intake.test.ts` gave 1 pass, 1 fail. `a launch rejected with assignment-not-active ends its assignment` failed with `actual: [ 'assignment-1' ]`, `expected: [ 'assignment-1', 'assignment-2' ]`: the worker refused the second offer. The late-end test then lacked its assertion that the assignment is ended before the end command.
- **All new tests on the old code, after review pass 1.** With the tests of `f5ed7de` and `packages/modules/execution/src` and `packages/adapters/worker-journal/src` checked out from `a38aefc`, after `npm run build`: `node --experimental-strip-types --test --test-name-pattern="assignment-not-active|ended locally|ended by a rejection" --test-reporter=spec apps/worker/test/command-intake.test.ts packages/adapters/worker-journal/test/worker-journal.test.ts` gave 0 pass, 4 fail: 2.1 (`actual: [ 'assignment-1' ]`), the D4 test and 2.2 (`ended` was `false`, expected `true`), and 2.3 (`actual: [ false, false ]`, expected `[ true, false ]`). The sources were then restored from `HEAD` and rebuilt; nothing of this was committed.
- **Links.** The change adds no external link; every link is relative to the repository.
- **Passes on the new code.** `node --experimental-strip-types --test apps/worker/test/*.test.ts packages/adapters/worker-journal/test/*.test.ts packages/modules/execution/test/*.test.ts` after `npm run build`: 481 tests, 479 pass, 0 fail, 2 skipped, including the three new tests.

## Checks

- `npm run openspec -- validate end-assignment-on-not-active --strict`: valid.
- `make verify` at `bedf3d7`: exit 0; 1920 tests, 1918 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.09%, functions 99.04%. No flaky rerun was needed.
- `make verify` at `f5ed7de` (after the pass 1 fixes): exit 0; 1921 tests, 1919 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.09%, functions 99.04%; no flaky rerun was needed. This file and `tasks.md` are the only later changes.

Environment: macOS (Darwin 25.6.0), Node v24.22.1 from `.nvmrc`, Docker test services started by `make verify`.

## Independent review

### Review pass 1

- **Reviewer:** Claude Code, model `claude-opus-5-5`, effort high, read-only (plan mode, editing tools disallowed), assigned and run by the coordinating session from the worktree.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Revision:** `0eb244b`, diff `a38aefc..0eb244b`.
- **Model confirmation:** `claude-opus-5-5` in the JSON `modelUsage`; session `c99007c2-2e37-4b2c-9c4b-7763fcfbf69d`.
- **Snapshot:** `49c533979bde1bc08a9d0e5bbb4e784a50d2cd49143754728becbba3a0c53f52` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 0 Medium, 5 Low. As the Low-only rule allows, they were fixed without another pass; the fixes are unreviewed.
  1. **L1:** the requirement's "SHALL no longer count" contradicted design D4 and the scenario "Ended assignment with a live execution". **Fixed** in `f5ed7de`: the worker stops counting it except through an execution that still holds a slot; a scenario for a granted execution was added, and the proposal aligned.
  2. **L2:** `JournaledIntent.ended` did not say that a rejection for which `endsAssignment` holds also ends it. **Fixed** in `b670816` with a comment on the field.
  3. **L3:** `endedByRejection` was typed with `string`, the comment above `toIntent` described only one field, and `endsItsAssignment` was a near-homonym of `endsAssignment`. **Fixed** in `b670816`: `ReadonlySet<AssignmentId>`, the comment moved to the `ended` line, the helper renamed `endedByItsRejection`.
  4. **L4:** test 2.1 did not check the reported state, and D4 was untested. **Fixed** in `fd62d87`: 2.1 asserts the inventory reports `ended`; a new test grants the execution, rejects its re-authorization with `assignment-not-active`, and shows `worker-slots-exhausted` until the seal, with `seal-execution` as the only recovery action. The behaviour matched D4.
  5. **L5:** the evidence check lacked the links check, and 2.2 and 2.3 were not run on the old code. **Fixed** in this file: both checks are recorded above.

## Archive checks

Worker step 7, run by the coordinating session after review pass 1 and its fixes. The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive end-assignment-on-not-active --yes` (base `bb5dc3e`).

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`: exit 0; 1921 tests, 1919 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.09%, functions 99.04%.
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-26-end-assignment-on-not-active` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/worker-runtime/spec.md`, which gains the requirement "Assignment ended by a launch rejection" with its three scenarios, the intended edit.

## Limitations

- The local end lives in the SQLite journal's snapshot read; another journal implementation would have to apply `endsAssignment` too.
- The inventory reports such an assignment as `ended` before the control plane's end command; the control plane's reconciliation acts only on omitted assignments.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
- No deployment validation was done; none is claimed.
