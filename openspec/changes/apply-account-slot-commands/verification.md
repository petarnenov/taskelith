# Verification: apply-account-slot-commands

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12d A, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `115c16c4` (#414, 12c): the slot commands besides adding, the orphan sweep of account pool contract section 8.1 with the list operation of section 6.2, and the later-epoch rule of section 13 on the worker ([design](design.md), decisions 1 to 9). The coordinator approved the split of 12d into A, B, and C on 2026-10-29 and answered Q1 to Q9; the design records the decisions verbatim. A applies the split, Q2, Q4 (grace age and list operation), and Q7.

## Revision

- Base: `dev` `115c16c4`, the brief's checklist base and the branch's merge base with `origin/dev`. `git fetch origin` before routing showed `origin/dev` at `2250f3f7` (#415, `assign-fable-to-review-pass-2`); it is not merged into this branch.
- `989ac398` `chore: start the apply-account-slot-commands change` (the brief's `checklist.json`, saved `--at 115c16c41016ae5f45dee6609558a9299ef8b165 --size L`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `45bd8e04` `chore: apply the account slot commands, the credential sweep, and the later recovery epoch rule`.
- `94e23088` `docs: record the apply-account-slot-commands design, spec delta, and contract updates`: the proposal, the design, the spec delta, the task list, account pool contract status and sections 6.2, 8.1, and 13, and `docs/g3-plan.md` row 12.
- `755e916c` `docs: route the apply-account-slot-commands change` (`route.json`, unedited): "route: elevated (lines, files, security, contracts, size), rule version 2", features 1197 lines and 24 files; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.79) and agrees; recommendation only. The brief assigns the three passes at effort `medium`.
- `bf45659e` `docs: record the verification of apply-account-slot-commands` (this record) and `38b83883` `docs: record the make verify of apply-account-slot-commands`, the `make record` of a passing `make verify` on the tree of the record commit (log `verify-12dA-1.log` in the session scratchpad).
- `f9093de0` `docs: record the coordinator decisions on apply-account-slot-commands`: the records round of 2026-10-29. The design replaces its open question with the coordinator's Q2 correction and records the accepted deviations 1 to 4; account pool contract section 6.2 names the race that the pairs of `listStored` close.
- `0b0c1066` `docs: route the apply-account-slot-commands change again` (`route.json`, unedited). The contract edit changed the tree outside the change's directory, so the routed commit `94e23088` no longer matched `HEAD`, and worker step 4 says: "if that run's fixes change the diff, delete `route.json`, route again, and record why in `verification.md`" (protocol "Route gate" would otherwise route at pass 1). The new record routes `f9093de0` with the same features, tier, and plan as before.
- `docs: record the review plan of apply-account-slot-commands` and `docs: record the make verify of apply-account-slot-commands again`, the `make record` of a passing `make verify` on the tree of the review plan commit (log `verify-12dA-2.log` in the session scratchpad).
- Governance v9 (`assign-fable-to-review-pass-2`, #415, `2250f3f7`) landed on `dev` after this change's route was first recorded; it is not merged into this branch.

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test`.

## Author self-check

- Scope: A only. No control-plane source changes: no route, composition, wire reason, admitted pair, cooldown setting, or sweep loop (B), and no key rotation or contract section 11 change (C). The one control-plane file touched is the test double `counted` of `apps/control-plane/test/slot-credential-delivery.integration.test.ts`, which must implement the new port operation `SlotCredentials.listStored` to compile.
- Wire: no change; `git diff 115c16c4 HEAD -- packages/contracts openapi` is empty.
- Dependencies: none added; `package.json` and `package-lock.json` are unchanged.
- Migration: `1792933500000_slot-credential-stored-at.sql`, the number the coordinator assigned; it adds `slot_credentials.stored_at timestamptz NOT NULL DEFAULT now()`, so rows stored before it are dated at the migration, and its down migration drops the column. A test checks both and the dating of a row stored after it.
- Secrecy: the new failures name slot identifiers only, and the listing returns identifiers and versions only. Tests check that a refused rotation's result, in JSON and inspection form, does not hold the new credential, in memory and on PostgreSQL. No test, log, or record holds a real credential: the fixtures are `fixture-...` texts and random `sentinel-...` values.
- Hexagonal: the commands and the sweep are Scheduling application functions over the ports `AccountSlots`, `SlotCredentials`, `AssignmentRepository`, `CapacityLedger`, and `LaunchRecords`; the new port operations have in-memory and PostgreSQL adapters and shared conformance cases. The neutrality test of the pool lists the two new source files and the new test file.
- Spec delta: three added requirements of `account-pool-port`, 368 to 397 characters, and one modified, "Run slot credential port on the worker", 430 characters, which keeps all six of its scenarios, rewords "New recovery epoch" to a later epoch, and adds "Call of an older recovery epoch". None is removed.
- Contracts: account pool contract status line; section 6.2 adds `listStored`; section 8.1 adds the sweep's rules and the command outcomes of Q2; section 13 states the later-epoch rule. `docs/g3-plan.md` row 12 records the split A, B, C.
- Comments: `npm run verify:comments` passes.

## Fail-before

Each behavior was broken in place on `755e916c` (the code of `45bd8e04`), the build and the named tests run against a fresh PostgreSQL service, and the source restored with `git checkout HEAD`; each log starts with the mutation's diff and is in the session scratchpad. The tests in each run were the in-memory command test and the PostgreSQL command test (20 tests) unless stated.

- Sweep grace ignored (`fb-12dA-sweep-grace.log`): the sweep lists versions stored before `now`. Pass 18, fail 2: the in-memory and the PostgreSQL grace tests, each of which found the version within the grace age discarded.
- Revocation cancels no holder (`fb-12dA-revoke-holders.log`): the loop over `listHeldForCredential` iterates nothing. Pass 17, fail 3: the in-memory release of an unlaunched attempt, the PostgreSQL launched attempt (no grant revoked, no cancellation command), and the re-delivery race (attempt not cancelled).
- Rotation cleanup failure propagated (`fb-12dA-rotate-cleanup.log`): `discardOlderThan` is awaited without `settled`. Pass 19, fail 1: the rotation whose cleanup fails rejected instead of answering the switch.
- Q2 outcomes broken (`fb-12dA-q2-outcomes.log`), three mutants at once: a repeated revocation writes, an update of a revoked slot is allowed, and a removed slot is treated like any other. Pass 15, fail 5: the repeated revocation, reinstatement, removal, update, and rotation tests.
- Sweep keeps a removed slot's credential (`fb-12dA-sweep-removed.log`): a removed record gets `discardOlderThan` instead of `destroy`. Pass 19, fail 1: the removal whose destroy fails kept its version after the sweep.
- Listing without code-unit order (`fb-12dA-listing-collation.log`): the PostgreSQL listing orders by `slot_id` without `COLLATE "C"`. The PostgreSQL account pool tests: pass 19, fail 1, the listing conformance case, which found `Slot-z-upper` after the lower-case identifiers.
- New port operations and migration absent (`fb-12dA-base-ports.log`): the Scheduling and PostgreSQL sources and migrations of `989ac398` with this change's conformance suites and tests. `npm run build` fails, because the base ports have no `listStored` or `listHeldForCredential`; the run then counts tests 122, pass 113, fail 9, all migration tests, each expecting `1792933500000_slot-credential-stored-at` in the applied list or its column. The repository conformance results of that run come from the earlier build and prove nothing.
- Later-epoch rule absent (`fb-12dA-worker-epoch.log`): the worker of `989ac398` with the new worker tests, `--test-timeout=10000`. Pass 16, fail 1, cancelled 1: a call of epoch 1 after a delivery of epoch 2 dropped the held delivery and fetched, and the call of an older epoch during a later fetch dropped that fetch and waited for an answer that never came, until the timeout.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts` after `npm run build` | `45bd8e04` working tree | tests 224, pass 224, fail 0 |
| `node --experimental-strip-types --test apps/worker/test/run-slot-credentials.test.ts` after `npm run build` | `45bd8e04` working tree | tests 18, pass 18, fail 0 |
| `node --experimental-strip-types --test` of the PostgreSQL command, account pool, migration, conformance, and selection tests, against a fresh service | `45bd8e04` working tree | tests 101, pass 100, fail 1 (the outbox order of one assertion, fixed before the commit); the command test then three runs of 5, pass 5 each |
| `npx tsc -p tsconfig.check.json --noEmit` | `45bd8e04` working tree | no error |
| `npm run verify:comments` | `45bd8e04` working tree | `Every comment is within the comment length rule.` |
| `npm run openspec -- validate apply-account-slot-commands --strict` | `94e23088` working tree | `Change 'apply-account-slot-commands' is valid` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `05357fdea4faf7c9f1f82422d0b569bb51a4e93d`; tests 3927, pass 3918, fail 0, skipped 9; all files 99.38% lines, 92.52% branches, 98.85% functions.
- `npm run openspec -- validate apply-account-slot-commands --strict`: passed, `Change 'apply-account-slot-commands' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 91 file(s); every pass summary file is valid: 71 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `115c16c41016` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run. Review plan, each pass invoked with `env -u JEV_MAF_LAB`:

- Pass 1: `codex gpt-6-astra#medium` (A).
- Pass 2: `claude claude-fable-5-1#medium` (B), by the owner decision of 2026-10-29 (governance v9, landed on `dev` as #415 `2250f3f7` after this change's route was recorded).
- Pass 3: `codex gpt-6.1-sol#medium` (A), only after a pass 2 with a Medium or worse finding.

`route.json` recommends `claude claude-opus-5-5#xhigh` for pass 2 and effort `high` for passes 1 and 3. The effort is `medium` because routed effort is not authorized; the pass 2 reviewer is `claude-fable-5-1` by the owner decision.

## Limitations

- Nothing calls the commands or the sweep outside tests: B adds the HTTP operations and the sweep loop.
- The re-delivery race forms no serialization cycle, so PostgreSQL commits both transactions in the order delivery, revocation, without a retry; in the observed runs the delivery committed with one attempt each. The test asserts that serial outcome and asserts a retry only in the branch where the delivery is refused ([design](design.md), decision 8).
- The races run one interleaving each: the first attempt of each racer waits after its read for the other.
- The test's re-delivery transaction repeats the checks and the record of `SlotCredentialDeliveryService` with the Scheduling functions, because this change touches no control-plane source.

## Remaining gates

- Independent review passes 1 to 3 as governance requires.
- Architect check by the coordinator of any unreviewed fixes.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
