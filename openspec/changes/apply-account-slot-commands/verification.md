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
- Pass 1 fixes: `7995b967` `chore: derive the slot revocation command id through a bounded port` (finding 1) and `1866701d` `test: cover the rotation interleavings and the removal of a reserved slot` (findings 3 and 4), then `docs: record review pass 1 of apply-account-slot-commands` (these records and design decisions 3 and 8) and the `make record` of a passing `make verify` on its tree (log `verify-12dA-3.log` in the session scratchpad). `route.json` is not regenerated after review fixes.
- Governance v9 (`assign-fable-to-review-pass-2`, #415, `2250f3f7`) landed on `dev` after this change's route was recorded; the route is not run again, and v9 reaches this branch with the merge below.
- Pass 2 fixes, all unreviewed: `566776ce` (finding 4), `9c483f74` (findings 3 and 5), `285df9d1` (finding 5), `b6ab9ee2` (finding 1), `ef812f11` (finding 2), and, in its own commit, `6817cffb`, the add deadline of coordinator decision M2 (finding 6 and pass 1 finding 2); then `docs: record review pass 2 of apply-account-slot-commands`.
- `635ef25c`, the merge of `origin/dev` at `2250f3f7` (#415, governance v9) without conflicts, as the coordinator asked before the handoff; it changes governance, the review scripts and their tests, and no file of this change. Unreviewed, for the architect check. Then `docs: record the merge of dev into apply-account-slot-commands` and the `make record` of a passing `make verify` on its tree (log `verify-12dA-4.log` in the session scratchpad).
- `docs: record the architect check of the apply account slot commands fixes` (this record): the coordinator's architect check of the unreviewed fixes and the merge, under "Pass 2".

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
| `node --experimental-strip-types --test packages/modules/scheduling/test/*.test.ts` after `npm run build` | `1866701d` | tests 228, pass 228, fail 0 |
| `node --experimental-strip-types --test` of the PostgreSQL command and account pool tests, against a fresh service, three runs | `1866701d` | tests 32, pass 32, fail 0 each |
| `npm run openspec -- validate apply-account-slot-commands --strict` | `94e23088` working tree | `Change 'apply-account-slot-commands' is valid` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `279a87294d0f4920f25b81b05e27d46ed4daf7a2`; tests 3939, pass 3930, fail 0, skipped 9; all files 99.38% lines, 92.54% branches, 98.85% functions.
- `npm run openspec -- validate apply-account-slot-commands --strict`: passed, `Change 'apply-account-slot-commands' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 92 file(s); every pass summary file is valid: 72 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `2250f3f7f140` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18631-b706-7942-9241-c7d54d8f7cbe` | 0 | 1 | 3 | 0 |
| 2 | B | `claude claude-fable-5-1#medium` | `eb578367-67a9-4d49-952b-6f6459c7ba09` | 0 | 0 | 0 | 6 |
<!-- make record: end -->

## Independent review

Passes 1 and 2 ran, and pass 2 reported only Low findings, so the review ended after pass 2 and its fixes are unreviewed (governance "Architect check of unreviewed fixes"). Review plan, each pass invoked with `env -u JEV_MAF_LAB`:

- Pass 1: `codex gpt-6-astra#medium` (A).
- Pass 2: `claude claude-fable-5-1#medium` (B), by the owner decision of 2026-10-29 (governance v9, landed on `dev` as #415 `2250f3f7` after this change's route was recorded).
- Pass 3: `codex gpt-6.1-sol#medium` (A), only after a pass 2 with a Medium or worse finding.

`route.json` recommends `claude claude-opus-5-5#xhigh` for pass 2 and effort `high` for passes 1 and 3. The effort is `medium` because routed effort is not authorized; the pass 2 reviewer is `claude-fable-5-1` by the owner decision.

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, session `01a18631-b706-7942-9241-c7d54d8f7cbe`. The coordinator ran the pass and handed over its report; the branch head at the hand-over was `cbddfbb6`, clean.
- Result: Critical 0, High 1, Medium 3, Low 0, matching the pass 1 line of `passes.jsonl`; findings 1, 3, and 4 are fixed and finding 2 is deferred to the coordinator, as `findings.jsonl` records.
  1. High, error-handling (`account-slot-commands.ts`): the revocation built its end command identifier as `<assignment>.slot-revoked`, so a valid 128-character assignment identifier gave an invalid `EventId` and the revoke transaction failed with `invalid`. Fixed in `7995b967`: `revokeAccountSlot` takes `SlotRevocationPorts`, the store and `commandIdFor` (`RevocationCommandIds`), a deterministic derivation bounded for every valid assignment identifier; B derives it as a SHA-256 digest, like the control plane's `worker-revocation.ts`, because the Scheduling package has no Node.js types (design decision 3). The in-memory revocation test runs with the shortest and the longest assignment identifier and checks the release, the ended assignment, and the end command's identifier.
  2. Medium, concurrency-race (`sweep-slot-credentials.ts`): an add-slot command delayed past the grace age between its store and its `add` commit can commit a record that names a version the sweep read as unnamed and then discards. Not fixed, see "Limitations".
  3. Medium, missing-fail-before-test (`account-slot-commands.test.ts`): the rotation interleavings of contract section 9 were untested. Fixed in `1866701d`: in memory, with one-shot hooks before and after a rotation's store and before its cleanup, another rotation between the store and the switch wins and the outer switch is a `conflict`, a rotation that switches before an earlier rotation's cleanup stays deliverable, and an orphan above the current version stays until the next successful rotation discards it; on PostgreSQL, two rotations that read the same revision are gated after the held count read of their switches (`gatedFirstCall`, first call only), the loser is retried and answers `conflict`, the record names the winner's version, which reveals, and only a higher orphan stays; and the switch before an earlier cleanup is repeated against `PostgresSlotCredentials`.
  4. Medium, missing-fail-before-test (`account-slot-commands.test.ts`): no test removed a reserved `active` slot. Fixed in `1866701d`: a PostgreSQL test removes the slot of a launched attempt with an earlier delivery; the credential is destroyed, the outbox holds only the offer, the attempt has no cancellation, the reservation stays held, the re-delivery is refused with `removed`, and the drain (the terminal fact, the attempt's end, and `releaseInTransaction` in one transaction) releases it with the end command.
- Fail-before. Each log is in the session scratchpad and starts with its mutation's diff where there is one; mutants were applied to `account-slot-commands.ts` with the new tests in place, built, run against a fresh PostgreSQL service, and restored with `git checkout`. Counts, as tests/pass/fail, are for the in-memory command test, then the PostgreSQL command test.
  - Finding 1 (`fb-12dA-P1-F1-long-assignment.log`): the new tests against the source of `cbddfbb6`: tests 16, pass 14, fail 2; the longest identifier failed with `invalid` ("EventId must be 1-128 printable ASCII characters"), and the end command was `assignment-1.slot-revoked`, not the derived one.
  - Finding 3, switch without compare-and-set (`fb-12dA-P1-F3-switch-without-compare.log`): the switch checks only the state. 19/17/2 and 8/7/1: another rotation between store and switch, the higher orphan, and the PostgreSQL race.
  - Finding 3, blind advance (`fb-12dA-P1-F3-blind-advance.log`): the cleanup advance writes the switched record at the current revision. 19/18/1 and 8/7/1: both switch-before-cleanup tests, whose record named the discarded version 2.
  - Finding 3, predecessor only (`fb-12dA-P1-F3-discard-predecessor.log`): the cleanup discards only the version below its own. 19/15/4 and 8/6/2, the higher orphan test among them.
  - Finding 4, no destroy (`fb-12dA-P1-F4-removal-keeps-credential.log`): 19/18/1 and 8/7/1, the new removal test among them.
  - Finding 4, removal cancels its holders (`fb-12dA-P1-F4-removal-cancels.log`): 19/19/0 and 8/7/1; the new test found a cancellation command written by the removal.
- After the fixes: the checks under "Checks"; `npm run verify:comments`, `npm run check:boundaries`, `npm run openspec -- validate apply-account-slot-commands --strict`, and `make findings ARGS="validate"` passed. The `make verify` of the fixed tree is under "Generated checks".
- Pass 1 found High and Medium findings and the fixes change code and tests, so pass 2 by reviewer B is required.

### Pass 2

- Reviewer B: Claude Code, model `claude-fable-5-1`, effort `medium`, session `eb578367-67a9-4d49-952b-6f6459c7ba09`. The coordinator ran the pass and handed over its report; the branch head at the hand-over was `0ba4dca7`, clean.
- The reviewer differs from `route.json`, which recommends `claude claude-opus-5-5#xhigh` for pass 2: owner decision 2026-10-29 (governance v9).
- Result: Critical 0, High 0, Medium 0, Low 6, matching the pass 2 line of `passes.jsonl`. The pass is Low-only, so no pass 3 runs; every finding is fixed without another review (`fixed-unreviewed` in `findings.jsonl`). The reviewer confirmed the pass 1 fixes of findings 1, 3, and 4 and found finding 2 honestly recorded as open.
  1. Low, evidence-mismatch (`repositories.ts:261`): `listHeldForCredential` used `$1 = ANY (provider_credentials)`, which the partial GIN index `assignments_held_by_credential` cannot serve, and the design called the sequential scan unavoidable. Fixed in `b6ab9ee2`: the read uses `provider_credentials @> ARRAY[$1::text]`, as `heldForCredential` does, and the design risk says so. Unreviewed.
  2. Low, contract-drift (`account-slot-commands.ts:139`): a holder with a non-terminal execution was invalidated and its assignment kept its state, while contract section 8.1 said the revocation cancels the assignment, and the PostgreSQL test read the state without asserting it. Fixed in `ef812f11` by the reviewer's second option, the wording: ending the assignment in the revocation would make the re-delivery check of section 7.3 refuse with `assignment-not-active` before the `attempt-not-launchable` that section 8.1 requires, so section 8.1 and design decision 3 now say that the assignment keeps its state and held reservation until the transaction of the execution's terminal fact ends it with `attempt-ended`; the test asserts the unchanged state. Unreviewed.
  3. Low, error-handling (`sweep-slot-credentials.ts:29`): a rejecting `discard`, `destroy`, or `discardOlderThan` for one slot rejected the whole sweep and skipped every later slot. Fixed in `9c483f74`: each slot's work is settled on its own, and the sweep answers `SlotCredentialSweep`, its `sweptSlots` and `failedSlots`. Unreviewed.
  4. Low, contract-drift (`account-slot-commands.ts:128`): `sameSettings` compared the allowed projects by position, so a repeat in another order advanced the revision against Q2's idempotent repeat. Fixed in `566776ce`: the projects compare as sorted lists. Unreviewed.
  5. Low, naming (`account-slot-commands.ts:38`, `sweep-slot-credentials.ts:35`): the function type `RevocationCommandIds` had a plural name, and the sweep answered an unnamed count that included slots where nothing was discarded. Fixed in `285df9d1` (`RevocationCommandIdFor`) and, for the sweep's answer, in `9c483f74`. Unreviewed.
  6. Low, contract-drift (`account-pool.md:154`): section 6.2 said the listed pairs close the add race, which holds only within the grace age. Fixed in `6817cffb` with the coordinator's decision M2 (below). Unreviewed.
- Coordinator decision M2 on pass 1 finding 2 (Niki, architect, 2026-10-29), recorded verbatim in the [design](design.md): the add-slot command takes a deadline of half the grace age. Applied as the guard, not the wording-only fallback, in its own commit `6817cffb` (`add-account-slot.ts` in `packages/modules/scheduling`, outside the files this change touched before but in the Scheduling module that A owns and not in `apps/control-plane`): 16 added and 1 changed production lines in `add-account-slot.ts` and `index.ts`. `AccountSlotCommandPorts` takes `monotonicMilliseconds`, the injected clock; the add reads it before its `store` and again at the end of its `add` transaction's work, and past `ADD_SLOT_DEADLINE_MILLISECONDS` (half of `SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS`, 1,800,000) it answers `unavailable` with the reason `add-deadline-exceeded`, which rolls the transaction back, and then discards its own version. Contract section 6.2 says the pairs close the race for any add that commits within half the grace age and that a slower add aborts; the spec delta adds the requirement "Add-slot deadline". Pass 1 finding 2 is `fixed-unreviewed`. Unreviewed.
- Fail-before. Each log is in the session scratchpad.
  - Finding 4 (`fb-12dA-P2-L4-project-order.log`): the new in-memory test against the source of `0ba4dca7`: tests 1, pass 0, fail 1; the revision was 2, not 1.
  - Finding 3 (`fb-12dA-P2-L3-sweep-goes-on.log`): the new in-memory test against the source of `566776ce`: tests 1, pass 0, fail 1; the sweep rejected with the unreachable store's error.
  - Finding 2 (`fb-12dA-P2-L2-assignment-state.log`): a mutant that cancels every holder through `cancelInTransaction`, with the new assertion: tests 1, pass 0, fail 1; the assignment was `ended`, not `offered`. The grant, cancellation, and reservation assertions passed under the mutant, so only the new assertion tells the two designs apart.
  - Finding 1 (`fb-12dA-P2-L1-index-plan.log`): no test; the fix changes only a query plan, which a test on a nearly empty table cannot observe. The log holds the plans of both predicates on a throwaway migrated database with `enable_seqscan` off and the other secondary indexes of `assignments` dropped: the old predicate scans the whole partial index with a filter, and the new one has the index condition `provider_credentials @> '{slot-1}'::text[]`. The PostgreSQL command and conformance tests pass after the fix.
  - Finding 5: a rename and the named answer of finding 3, covered by the tests of finding 3; no fail-before run.
  - M2 guard (`fb-12dA-P2-M2-add-deadline.log`): the guard without its deadline check, the constant and port field kept so that the tests run: the in-memory and the PostgreSQL deadline tests, tests 2, pass 0, fail 2; both adds committed. Each test drives the injected clock past the deadline when the capacity transaction starts; the in-memory test also adds at exactly the deadline.
- After the fixes: the Scheduling tests and the PostgreSQL account pool and command tests (tests 260, pass 260, fail 0), the PostgreSQL command and conformance tests (tests 86, pass 86, fail 0), `npx tsc -p tsconfig.check.json --noEmit`, `npm run openspec -- validate apply-account-slot-commands --strict`, and `make findings ARGS="validate"` passed. The `make verify` of the merged tree is under "Generated checks".
- Architect check (Niki, 2026-10-29), verbatim: "12d A architect check (Niki, 2026-10-29): passed for 6817cffb, b6ab9ee2, ef812f11, 9c483f74, 566776ce, 285df9d1 and the merge 635ef25c. 6817cffb: the deadline is derived from the minimum grace (half), checked as the last step inside the transaction, rolls back and discards only its own version, and its failure is retryable. Accepted. The residual risk recorded in Limitations is accepted. ef812f11: the contract change is accepted. Revoke still cancels the attempt (revokes grants, writes the outbox cancel) as an invalidating writer, and keeps the assignment until the terminal fact so that re-delivery refuses with attempt-not-launchable. This is consistent with §7.3 and §8.1. b6ab9ee2 with EXPLAIN as evidence, and L3–L5, are fine."

## Limitations

- Nothing calls the commands or the sweep outside tests: B adds the HTTP operations and the sweep loop.
- The re-delivery race forms no serialization cycle, so PostgreSQL commits both transactions in the order delivery, revocation, without a retry; in the observed runs the delivery committed with one attempt each. The test asserts that serial outcome and asserts a retry only in the branch where the delivery is refused ([design](design.md), decision 8).
- The races run one interleaving each: the first attempt of each racer waits after its read for the other.
- The add deadline of decision M2 bounds the add race by the process's monotonic clock, which the sweep's database clock does not share. A clock fault, a monotonic clock that stops or runs slow by more than half the grace age, or a commit that takes longer than the remaining half after the check at the end of the transaction's work, can still let an add commit a version that the sweep has listed as unnamed and then discards. No test covers a clock fault.
- Nothing injects the add's monotonic clock outside tests; B's composition passes it, for example `performance.now`.
- The test's re-delivery transaction repeats the checks and the record of `SlotCredentialDeliveryService` with the Scheduling functions, because this change touches no control-plane source.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
