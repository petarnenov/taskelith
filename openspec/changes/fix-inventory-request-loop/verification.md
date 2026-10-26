# Verification

Date: 2026-10-26. The author's verification and independent review pass 1 are recorded below.

## Scope and source

- **Source:** the coordinator's diagnosis of the G2 inventory request loop (about 80 requests every 3 seconds) and its choice of option A on 2026-10-26, with one condition: check whether the omitted-assignment request of `applySnapshot` can still loop while the assignment stays active, and report it if it does. It did; the coordinator then chose option 1 (design decision 2) in this change, with a test of a refused offer.
- **Base revision:** `26ff102` on `dev`.
- **Revisions verified:** `bf64a63` (option A: spec `4a605d0`, fix `bf64a63`), `0763564` (option 1: spec `87e6d96`, fix `0763564`), `943f358` (the coordinator's merge of `origin/dev`, the reviewed revision), and `76a0cfd` (the pass 1 fixes: docs `2db99a4`, code and tests `76a0cfd`).
- **Scope:** `receivePart` treats only a part without a `requestId` as unsolicited (option A); `applySnapshot` requests inventory for an unclassifiable omission only for a snapshot without a `requestId` (option 1); requirements "Inventory request" and "Omitted assignments" and wire contract section 6 say so; the integration tests cover both.
- **Out of scope:** any change to the request lifecycle (rejected option B), placement's retry of a refused offer, and wire schemas.

## Environment

macOS (Darwin 25.6.0, arm64), Node 24.22.1 from `.nvmrc` through nvm, Docker Desktop. The targeted runs used the services of `make services-up` (PostgreSQL on a per-worktree Compose project), stopped afterwards with `make services-down`; `make verify` started its own services.

## Author self-check

- The spec delta copies the full current text of requirement "Inventory request" and all four of its scenarios, adds one sentence (now 428 characters in all, below the archive limit), and adds the scenarios "Answer to a superseded request" and "Overlapping requests settle".
- Scenario "Offer not yet received" of requirement "Omitted assignments" still holds: `applySnapshot` requests inventory when the condition `snapshot.requestId === undefined` holds (lines 160 to 161 at `0763564`; `isUnsolicited(snapshot)` since `76a0cfd`), which an unsolicited snapshot meets.
- Each new scenario maps to a test in `apps/control-plane/test/inventory.integration.test.ts`:
  - "Answer to a superseded request": `only the newer of two requests is current, and a snapshot answering the first is not fresh`, which now expects 2 requests instead of 3;
  - "Overlapping requests settle": `two outstanding requests answered in turn settle without a further request`, which answers every request in the outbox in turn, up to 20, with a growing `snapshot`.
- The delta of requirement "Omitted assignments" copies its full current text and its three scenarios, changes its last clause (428 characters in all), and adds two scenarios, each mapped to a test in the same file:
  - "Superseded answer omits an offer": `an answer to a superseded request that omits an offer never accepted re-sends it and requests nothing`;
  - "Omitted offer under overlapping requests": `two outstanding requests settle while every answer omits an active offer never accepted`.
- After option 1, "Inventory request" no longer leaves an exception for "Omitted assignments": no report or snapshot with a `requestId` requests inventory, and wire contract section 6 names an unsolicited snapshot as the omission trigger.
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

## Residual risk under option A, and option 1

The design's section "Residual risk under option A alone" gives the causal chain with `file:line` references.

- **Finished assignment:** settles. `applySnapshot` considers only unfinished assignments (line 153). By reasoning, and by the refused-offer test below, whose refusal ends the assignment.
- **Active assignment, every snapshot omits it, two requests outstanding:** did not settle under option A alone. First run, before the test was committed (at `bf64a63`, with a 20-round helper): `no request stays unanswered: 22 !== 20`; a temporary log line showed 20 answers, 22 requests, and 21 offers.

Option 1 tests (committed in `0763564`), run first on the code of option A alone (`bf64a63` source, tests of `0763564`, after `npm run build`):

```
TASKELITH_POSTGRES_URL=<services-up URL> node --experimental-strip-types --test \
  --test-name-pattern='superseded request that omits|active offer never accepted|refuses the re-sent' \
  apps/control-plane/test/inventory.integration.test.ts
```

Before option 1:

```
✖ an answer to a superseded request that omits an offer never accepted re-sends it and requests nothing
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  3 !== 2
✖ two outstanding requests settle while every answer omits an active offer never accepted
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  20 !== 2
✔ two outstanding requests settle once the worker refuses the re-sent offer
ℹ pass 1
ℹ fail 2
```

The second test ran out of its 20 rounds. After option 1 (same command, after `npm run build`):

```
✔ an answer to a superseded request that omits an offer never accepted re-sends it and requests nothing
✔ two outstanding requests settle while every answer omits an active offer never accepted
✔ two outstanding requests settle once the worker refuses the re-sent offer
ℹ pass 3
ℹ fail 0
```

The whole inventory integration file then passed: 40 tests, 40 pass, 0 fail.

**G2 trigger (review pass 1, finding 9).** The test `two requests from an unsolicited snapshot applied later settle once answered in turn` reproduces the G2 path without `requestAll`: an unsolicited snapshot ahead of its observations requests inventory at receipt, and, applied in a later transaction, requests again for its omitted offer, so two requests come from separate transactions. The worker then answers in turn. With the tests of `76a0cfd`, run with `inventory-reconciliation.ts` of `26ff102` (before any fix) and of `bf64a63` (option A alone), after `npm run build`, pattern `'unsolicited snapshot applied later|refuses the re-sent'`:

```
26ff102:
✖ two requests from an unsolicited snapshot applied later settle once answered in turn
  20 !== 2
✖ two outstanding requests settle once the worker refuses the re-sent offer
  20 !== 2
bf64a63:
✖ two requests from an unsolicited snapshot applied later settle once answered in turn
  20 !== 2
✖ two outstanding requests settle once the worker refuses the re-sent offer
  3 !== 2
```

The refused-offer test now asserts exact counts (2 answers, 2 requests, 2 offers), so under option A alone it shows the extra request of the first stale answer (3 requests, then settled), and before any fix it loops. With `76a0cfd` both pass; the inventory integration file and `packages/modules/execution/test/inventory.test.ts` passed 51 of 51.

**Refused offer.** The worker journals an offer it cannot admit as `rejected` (`apps/worker/src/command-intake.ts:100-109`) and publishes `execution.assignment.refused` (`apps/worker/src/observation-messages.ts:27-31`). The control plane's `refusal` (`apps/control-plane/src/application/observation-effects.ts:82-88`, registered at line 324) ends the assignment and releases its reservation, so no later snapshot omits it. The test refuses the re-sent offer after the first stale answer, then answers the rest in turn: the exchange settles with 2 requests. Under option A alone it settled too, after one extra request (the run above).

## Checks

- `npm run openspec -- validate fix-inventory-request-loop --strict`: `Change 'fix-inventory-request-loop' is valid`.
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:archive`: every active change archives into strictly valid specs.
- `make verify` at `bf64a63` (option A): exit 0; 1905 tests, 1903 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.06%, functions 99.04%; 0 breaking contract changes against `26ff102`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed.
- `make verify` at `0763564` (option 1): exit 0; 1908 tests, 1906 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.06%, functions 99.04%; 0 breaking contract changes against `26ff102`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed.
- `make verify` at `943f358` (the coordinator's merge of `origin/dev`, run by the coordinator): exit 0; 1921 tests, 1919 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.07%, functions 99.04%.
- `make verify` at `76a0cfd` (after the pass 1 fixes): exit 0; 1923 tests, 1921 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.08%, functions 99.04%; no undeclared breaking contract change; `validate --all --strict`: 71 passed, 0 failed; the archive dry run and the package verification passed.

## Independent review

Prompts, logs, and snapshots are kept outside the worktree. The snapshot is a digest of the worktree taken before and after each review run.

### Failed attempt (not a pass)

- **Reviewer:** Claude Code, model `claude-fable-5-1`, assigned by the coordinator.
- **Revision:** `943f358`.
- **Invocation:** `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Result:** exit 1 with `Error: No messages returned from query`, empty output, and no session.
- **Snapshot:** before and after equal, `472f4d0b4ac09924c9d7aced0802d17a5e9bdac75791ac87045aeb2bb2ba380d`.
- Under the governance rule "Unavailable reviewer", Fable was paused for 30 minutes, and the coordinator (Niki) assigned Claude Code `claude-opus-5-5` as the replacement, as Codex `gpt-6-astra` was assigned to another task.

### Pass 1

- **Reviewer:** Claude Code, model `claude-opus-5-5`.
- **Revision:** `943f358`.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Model confirmation:** `modelUsage` lists only `claude-opus-5-5`.
- **Session ID:** `135cf321-b6fc-463e-84ad-2875bf3392fd`.
- **Snapshot:** before and after equal, `472f4d0b…380d`, as above.
- **Result:** no loop and no lost omission found. Critical 0, High 0, Medium 0, Low 10.

Findings and resolutions, all fixed in `2db99a4` and `76a0cfd`:
1. The THEN of scenario "Superseded answer omits an offer" gave a rationale that a redelivered older request can falsify and no test can check. Fixed: the rationale is removed.
2. Wire contract section 6 made the same claim and attributed the action to the snapshot. Fixed with the reviewer's wording: the control plane sends no request for a snapshot that answers a request, even a superseded one.
3. `design.md` made the same claim. Fixed: "a newer request was sent".
4. The self-check said line 162 was unchanged, which `0763564` made untrue. Fixed: the self-check names the condition an unsolicited snapshot meets.
5. No `make verify` was recorded for the reviewed merge `943f358`. Fixed: recorded under "Checks".
6. The review section named `claude-fable-5-1` for a pass made by `claude-opus-5-5`. Fixed: this section.
7. The refused-offer test accepted any count below 20. Fixed: it asserts 2 answers, 2 requests, and 2 offers.
8. The comment of `answerInTurn` said it returns how many were answered; it returns the position of the first request left unanswered. Fixed: the comment says so.
9. The real G2 trigger, two requests from separate transactions without `requestAll`, had no regression test. Fixed: a new test, failing before the fix as recorded above.
10. The rule "unsolicited" was computed in place twice. Fixed: `isUnsolicited` next to `isFreshReport` in `packages/modules/execution/src/domain/inventory.ts`, with a unit test, used by `receivePart` and `applySnapshot`.

The pass had only Low findings, so under the governance rule they were fixed without another review. **The fixes in `2db99a4` and `76a0cfd` are unreviewed.**

Out of scope, forwarded to the coordinator and not addressed here: `receivePart` (line 79) discards an unsolicited report whose `snapshot` is below the highest received, before its request. A worker journal restored from an older copy with a rolled-back counter would therefore get no inventory request on reconnect. This predates the change and is untested.

## Limitations and remaining gates

- The finished-assignment case is shown by reasoning and by the refused-offer test, not by an assignment that ends through an execution.
- A retryable refusal leads placement to offer a new attempt later; that path belongs to placement and is not covered here.
- `make verify` ran on macOS only, not on Linux; the change touches no shell script.
- The G2 deployment was not re-run with the fix.
- Remaining gates: integration into `dev` and archive.
