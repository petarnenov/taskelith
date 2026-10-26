# Verification

Date: 2026-10-26. The author's verification is recorded below; the independent review is pending.

## Scope and source

- **Source:** the coordinator's diagnosis of the G2 inventory request loop (about 80 requests every 3 seconds) and its choice of option A on 2026-10-26, with one condition: check whether the omitted-assignment request of `applySnapshot` can still loop while the assignment stays active, prove it with a test, and if it does not settle, record the evidence and report it without changing that path.
- **Base revision:** `26ff102` on `dev`.
- **Revision verified:** `bf64a63` (the spec commit `4a605d0` and the fix commit `bf64a63`).
- **Scope:** `receivePart` treats only a part without a `requestId` as unsolicited; requirement "Inventory request" and wire contract section 6 say so; the integration tests cover it.
- **Out of scope:** the omitted-assignment request of `applySnapshot` (line 162), any change to the request lifecycle (rejected option B), and wire schemas.

## Environment

macOS (Darwin 25.6.0, arm64), Node 24.22.1 from `.nvmrc` through nvm, Docker Desktop. The targeted runs used the services of `make services-up` (PostgreSQL on a per-worktree Compose project), stopped afterwards with `make services-down`; `make verify` started its own services.

## Author self-check

- The spec delta copies the full current text of requirement "Inventory request" and all four of its scenarios, adds one sentence (438 characters in all, below the archive limit), and adds the scenarios "Answer to a superseded request" and "Overlapping requests settle".
- Scenario "Offer not yet received" of requirement "Omitted assignments" still holds: an unsolicited snapshot has no `requestId`, and line 162 is unchanged.
- Each new scenario maps to a test in `apps/control-plane/test/inventory.integration.test.ts`:
  - "Answer to a superseded request": `only the newer of two requests is current, and a snapshot answering the first is not fresh`, which now expects 2 requests instead of 3;
  - "Overlapping requests settle": `two outstanding requests answered in turn settle without a further request`, which answers every request in the outbox in turn, up to 20, with a growing `snapshot`.
- The comment length rule holds (`npm run verify:comments`).

## Evidence: fail before, pass after

Both tests were added before the fix and run against the unfixed code (base `26ff102`, after `npm run build`):

```
TASKELITH_POSTGRES_URL=<services-up URL> node --experimental-strip-types --test \
  --test-name-pattern='outstanding|newer of two' apps/control-plane/test/inventory.integration.test.ts
```

Before the fix:

```
✖ only the newer of two requests is current, and a snapshot answering the first is not fresh
  AssertionError [ERR_ASSERTION]: it answers a request, so it requests nothing more
  3 !== 2
✖ two outstanding requests answered in turn settle without a further request
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  20 !== 2
```

The second test ran out of its 20 rounds: every answer issued one more request.

After the fix (same command, after `npm run build`): both pass. The whole file then passed: 37 tests, 37 pass, 0 fail.

## Residual risk: the omitted-assignment request

The design's section "Residual risk" gives the causal chain with `file:line` references. Summary:

- **Finished assignment:** settles. `applySnapshot` considers only unfinished assignments (line 153). By reasoning; no test was added.
- **Active assignment, every snapshot omits it, two requests outstanding:** does **not** settle. The coordinator's condition applies, so line 162 is unchanged and the test is not committed. The test, run after the fix in the same file (helper `answerInTurn` as committed):

  ```ts
  test('two outstanding requests settle while every answer omits an active offer never accepted', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    await inventory.requestAll([WORKER as WorkerId]);
    const answered = await answerInTurn({ throughSequence: 1 });
    assert.equal((await requests()).length, answered, 'no request stays unanswered');
    assert.ok(answered < 20, `the exchange settles, after ${answered} answers`);
    assert.equal((await assignmentOf(at)).state, at.assignment.state);
  });
  ```

  Result: `AssertionError [ERR_ASSERTION]: no request stays unanswered`, `22 !== 20`. A temporary log line in the same run showed 20 answers, 22 requests, and 21 offers of the assignment: each answer re-sent the offer and issued one request.
- **Open question for the coordinator:** whether a worker can keep omitting an offer it is re-sent (a worker that accepts it ends the loop), and whether line 162 should change (for example rejected option C). Reported, not decided.

## Checks

- `npm run openspec -- validate fix-inventory-request-loop --strict`: `Change 'fix-inventory-request-loop' is valid`.
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:archive`: every active change archives into strictly valid specs.
- `make verify` at `bf64a63`: exit 0; 1905 tests, 1903 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.06%, functions 99.04%; 0 breaking contract changes against `26ff102`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed.

## Independent review

pending: independent review by Claude Code (claude-fable-5-1)

## Limitations and remaining gates

- The finished-assignment case is shown by reasoning only.
- The residual loop of the active, always omitted assignment remains, pending the coordinator's decision.
- The G2 deployment was not re-run with the fix.
- Remaining gates: independent review, integration into `dev`, and archive.
