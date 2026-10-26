# Verification

Date: 2026-10-26. The author's verification is recorded below; the independent review is pending.

## Scope and source

- **Source:** the coordinator's diagnosis of the G2 inventory request loop (about 80 requests every 3 seconds) and its choice of option A on 2026-10-26, with one condition: check whether the omitted-assignment request of `applySnapshot` can still loop while the assignment stays active, and report it if it does. It did; the coordinator then chose option 1 (design decision 2) in this change, with a test of a refused offer.
- **Base revision:** `26ff102` on `dev`.
- **Revisions verified:** `bf64a63` (option A: spec `4a605d0`, fix `bf64a63`) and `0763564` (option 1: spec `87e6d96`, fix `0763564`).
- **Scope:** `receivePart` treats only a part without a `requestId` as unsolicited (option A); `applySnapshot` requests inventory for an unclassifiable omission only for a snapshot without a `requestId` (option 1); requirements "Inventory request" and "Omitted assignments" and wire contract section 6 say so; the integration tests cover both.
- **Out of scope:** any change to the request lifecycle (rejected option B), placement's retry of a refused offer, and wire schemas.

## Environment

macOS (Darwin 25.6.0, arm64), Node 24.22.1 from `.nvmrc` through nvm, Docker Desktop. The targeted runs used the services of `make services-up` (PostgreSQL on a per-worktree Compose project), stopped afterwards with `make services-down`; `make verify` started its own services.

## Author self-check

- The spec delta copies the full current text of requirement "Inventory request" and all four of its scenarios, adds one sentence (now 428 characters in all, below the archive limit), and adds the scenarios "Answer to a superseded request" and "Overlapping requests settle".
- Scenario "Offer not yet received" of requirement "Omitted assignments" still holds: an unsolicited snapshot has no `requestId`, and line 162 is unchanged.
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

**Refused offer.** The worker journals an offer it cannot admit as `rejected` (`apps/worker/src/command-intake.ts:100-109`) and publishes `execution.assignment.refused` (`apps/worker/src/observation-messages.ts:27-31`). The control plane's `refusal` (`apps/control-plane/src/application/observation-effects.ts:82-88`, registered at line 324) ends the assignment and releases its reservation, so no later snapshot omits it. The test refuses the re-sent offer after the first stale answer, then answers the rest in turn: the exchange settles. It settles under option A alone too, as the run above shows.

## Checks

- `npm run openspec -- validate fix-inventory-request-loop --strict`: `Change 'fix-inventory-request-loop' is valid`.
- `npm run verify:comments`: every comment is within the rule.
- `npm run verify:archive`: every active change archives into strictly valid specs.
- `make verify` at `bf64a63` (option A): exit 0; 1905 tests, 1903 pass, 0 fail, 2 skipped; coverage lines 99.29%, branches 92.06%, functions 99.04%; 0 breaking contract changes against `26ff102`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed.
- `make verify` at `0763564` (option 1): exit 0; 1908 tests, 1906 pass, 0 fail, 2 skipped; coverage lines 99.28%, branches 92.06%, functions 99.04%; 0 breaking contract changes against `26ff102`; `validate --all --strict`: 70 passed, 0 failed; the archive dry run and the package verification passed.

## Independent review

pending: independent review by Claude Code (claude-fable-5-1)

## Limitations and remaining gates

- The finished-assignment case is shown by reasoning and by the refused-offer test, not by an assignment that ends through an execution.
- A retryable refusal leads placement to offer a new attempt later; that path belongs to placement and is not covered here.
- The G2 deployment was not re-run with the fix.
- Remaining gates: independent review, integration into `dev`, and archive.
