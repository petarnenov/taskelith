# Verification: deliver-slot-credential-per-run

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12c, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `dc2ae98b` (#412, 12b): the per-run delivery of a reserved slot's credential through `fetchSlotCredential` over HTTPS only (account pool contract section 7; execution wire contracts section 8.6), a per-run delivery record without the credential for 13c, and the worker port that item 18's harness host calls ([design](design.md), decisions 1 to 9). The coordinator Niki answered the design's questions Q1 to Q8 on 2026-10-29; the design records the answers verbatim under "Coordinator answers" and how each was applied.

## Revision

- Base: `dev` `dc2ae98b`, the brief's checklist base; `git fetch origin` before routing showed `origin/dev` still at `dc2ae98b`.
- `dbacbda9` `chore: start the deliver-slot-credential-per-run change` (the brief's `checklist.json`, saved `--at dc2ae98b379dbc721df0ae88f05446cbc18b8059 --size M`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `8ddb3800` `chore: deliver a reserved slot's credential per run over HTTPS and record each delivery`.
- `f109b4ad` `docs: record the deliver-slot-credential-per-run design, spec delta, and contract updates`: the proposal, the design, the spec delta, the task list, this record, account pool contract status and section 13, execution wire contracts section 9, and `docs/g3-plan.md` row 12.
- `f0fb9f6c` `docs: route the deliver-slot-credential-per-run change` (`route.json`, unedited): "route: elevated (lines, files, security, contracts), rule version 2", features 1646 lines and 38 files; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.73) and agrees; recommendation only.
- `3b972bcc` `docs: record the make verify of deliver-slot-credential-per-run`, the `make record` of a passing `make verify` on the tree of `f0fb9f6c` (log `verify-12c-1.log` in the session scratchpad, one run).
- `d11dbf28` `chore: forget a held slot credential on a new ownership generation or recovery epoch` (the coordinator's answers Q7 and Q4): `FetchedRunSlotCredentials` keeps each held delivery's ownership generation and recovery epoch and drops the stale ones before it looks for a held one; the worker test gains one test each for the run's end, a new recovery epoch, and a new ownership generation; the API test of the `503` without a delivery service stands alone and checks the body's `unavailable` code.
- `8c1a7af9` `docs: apply the coordinator's answers to the deliver-slot-credential-per-run design`: the design records the answers Q1 to Q8 verbatim; the spec delta modifies "Confidential credential transport" (Q3) and adds the generation and epoch scenarios to "Run slot credential port on the worker" (Q7); account pool contract sections 7.2, 7.3, 11, and 13 and `docs/g3-plan.md` row 12 follow; the proposal, the task list, and this record.
- `feb182e9` `docs: route the deliver-slot-credential-per-run change again after the coordinator's answers` (`route.json`, unedited, at head `8c1a7af9`): `d11dbf28` and the docs commit change the diff outside the change directory (the worker, its port, the API and worker tests, the account pool contract, and the plan), so under worker step 4 the route of `f0fb9f6c` was stale; it was deleted and the change routed again. "route: elevated (lines, files, security, contracts), rule version 2", features 1706 lines and 38 files; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.75) and agrees; recommendation only. `git fetch origin` showed `origin/dev` still at `dc2ae98b`.
- `9821fee0` `docs: record the second route of deliver-slot-credential-per-run` (this record).
- `071fb80e` `docs: record the second make verify of deliver-slot-credential-per-run`, the `make record` of a passing `make verify` on the tree of `9821fee0` (log `verify-12c-2.log` in the session scratchpad, one run). Review pass 1 ran on `071fb80e`.
- `33a979f8` `chore: drop a slot credential fetched after its run, generation, or epoch ended, and forget each on the host's call` (pass 1 findings 1 and 3).
- `26da3651` `chore: keep server text out of the slot credential client's refusals and failures` (pass 1 finding 2).
- `e400f0dc` `chore: map every reveal failure to a local message and test the commit and reveal boundary` (pass 1 findings 4 and 5).
- `a508de8d` `test: add the shared conformance suite of the slot credential delivery records` (pass 1 finding 6).
- `1f9b0c94` `docs: record review pass 1 of deliver-slot-credential-per-run and its fixes`: the pass 1 lines of `passes.jsonl` and `findings.jsonl`, the design, the spec delta, the proposal, the task list, account pool contract sections 7.3 and 13, and this record. `route.json` was not routed again after the review fixes (worker step 4). `git fetch origin` showed `origin/dev` still at `dc2ae98b`.
- `docs: record the make verify of the pass 1 fixes of deliver-slot-credential-per-run`, the `make record` of a passing `make verify` on the tree of `1f9b0c94` (log `verify-12c-3.log` in the session scratchpad, one run).

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12c only, as the brief scopes it. 12d (the other slot commands, the sweep, the HTTP operations of the account slots, the wire's slot rejecting reasons, the composition of the key and the admitted pairs, the default cooldown setting, and key rotation), 12e, and item 18 are untouched. Nothing new is wired into the composition: `ApiServices.slotCredentials` is optional, the route answers `503` without it (design, decision 9), and no harness host calls `RunSlotCredentials`.
- Wire: no change. `git diff dc2ae98b -- packages/contracts` is empty; the route implements `fetchSlotCredential`, `SlotCredentialDelivery`, and `SlotCredentialRefusal` of `execution.openapi.json` 0.8.0, and a test checks the `200` and `422` bodies against their schemas.
- Dependencies: none added; `package.json` and `package-lock.json` are unchanged.
- Migration: `1792933300000_slot-credential-deliveries.sql`, the first number of the brief's range; its down migration drops the table, and a test checks its checks and the down migration.
- Secrecy: the credential is decrypted only by `reveal` after the check transaction commits, enters a response body only in `slotCredentialBody`, and is `[redacted]` in every string, JSON, and inspection form of `SlotSecret` and `DeliveredSlotCredential`. Tests check these output paths, and no other: the request log of the API server, the `422` body, the client's refusals and failures, also for an error answer with arbitrary text in its message or details or an unknown reason (since pass 1), the service's answers to a reveal that throws or returns a failure holding the credential (since pass 1), the worker's logs, held deliveries, and the failure of a delivery dropped after its run ended (since pass 1), every database table, and every NATS stream message after the outbox is published. Every credential in the tests is a fixture text, never a real credential.
- Hexagonal: the checks are pure Scheduling domain functions; the delivery record is a Scheduling port with in-memory and PostgreSQL adapters; the service is in the control plane's application layer, the wire parsing in its API layer; the worker ports are in the Execution module, with the HTTP adapter in `@taskelith/worker-control-plane-client`. `npm run check:boundaries` passed. The neutrality test of the pool lists the three new Scheduling source files, the conformance suite of pass 1 included, and the new test file. The delivery record port has a shared conformance suite, `SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE`, run against the in-memory double and the PostgreSQL adapter (since pass 1).
- Spec delta: four added requirements of `account-pool-port`, 379 to 489 characters each after the pass 1 fixes, and one modified, "Confidential credential transport", 269 characters, which keeps its scenario "Remote worker before TLS" unchanged and adds "Co-located worker without TLS": the coordinator's answer Q3 drops the plain-HTTP allowance for a co-located worker. None is removed. The existing requirements "Credential kept out of worker records", "Re-delivery to an adopted execution", and "Run redaction by credential value" stay as they are.
- Contracts: account pool contract status line; section 7.2 delivers a credential over TLS only, to a co-located worker too (Q3); section 7.3 has the worker drop its copy on a new ownership generation or recovery epoch too (Q7); section 11 gives key rotation the version change during a run (Q2); a new section 13, which states the 13c obligation (Q1); execution wire contracts section 9, the G3 item 12 obligation, names 12c; `docs/g3-plan.md` row 12 names 12c, TLS for a co-located worker, and the version change of key rotation. No other document or living spec states the co-located plain-HTTP allowance for a credential: the only other co-located mentions (`docs/storage.md`, `docs/contracts/installation-and-enrollment.md`, `docs/contracts/worker-journal.md`, and the PostgreSQL rows of `docs/g3-plan.md`) are about data roots and PostgreSQL.
- Comments: `npm run verify:comments` passes.

## Fail-before

Each behavior was broken in place on `8ddb3800`, the build and the tests run, and the source restored with `git checkout`; the logs are in the session scratchpad.

- Checks removed (`fb-A.log`): `checkSlotDeliveryOwnership` and `checkDeliveredSlot` made to pass everything. The Scheduling unit test and the delivery integration test: tests 16, pass 7, fail 9; each failing test got a delivery or no refusal where it expected `execution-conflict`, `stale-recovery-epoch`, `quarantined`, `assignment-not-active`, `stale-ownership-generation`, `capacity-not-reserved`, or `revoked`.
- Delivery record never written (`fb-B.log`): the integration test: tests 8, pass 2, fail 6. The re-delivery after the grant expired was refused with `execution-conflict`; the race recorded attempts `[1, 1]` instead of `[1, 2]`; the version, secrecy, and NATS tests failed on the refused re-delivery they make.
- Credential appended to the outbox by the service (`fb-C.log`): the database scan and NATS tests: tests 2, pass 0, fail 2; the scan found the credential in table `outbox`, and the NATS test found it at byte offset 649 of a stream message.
- Race without retry (`fb-D.log`): the gated race with `new PostgresDatabase(url, { serializationAttempts: 1 })` in a temporary copy failed in each of two runs, "the transaction lost 1 serialization races in a row", so the gate forces a serialization failure that only the retry resolves; with the default attempts it passed in each of three runs.
- Transport, binding, and worker holding (`fb-EFG.log`), four mutants at once: the API server's TLS guard, the client's HTTPS guard, the client's binding check, and the worker's held delivery disabled. The API, client, and worker tests: tests 14, pass 10, fail 4. The plain-HTTP request got `200`, expected `500`; the HTTPS guard test got `unavailable`, expected `invalid`; a delivery for another execution was used; and the worker fetched twice for one run.

- The coordinator's answers (`d11dbf28`, broken in place in the working tree before that commit and restored): the new worker tests against the worker implementation of `3b972bcc` (`fb-Q7.log`): tests 6, pass 4, fail 2; after a new recovery epoch the held delivery came back (`'fixture-run-slot-token'`, expected `'fixture-epoch-2-token'`), and so after a new ownership generation (expected `'fixture-generation-3-token'`). With `forget` made a no-op (`fb-Q7-end.log`): tests 6, pass 5, fail 1; after the run's end the old credential came back (expected `'fixture-next-run-token'`). With the route answering `internal` without a delivery service (`fb-Q4.log`): tests 6, pass 5, fail 1; the `503` test got `[500, 'internal']`, expected `[503, 'unavailable']`.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test` of the new and changed test files after `npm run build`, against `make services-up` | `8ddb3800` | tests 64, pass 64, fail 0: Scheduling delivery checks 8, API 5, client 5, worker 4, delivery integration 8, migrations 34 |
| `node --experimental-strip-types --test` of the worker and API tests after `npm run build` | `d11dbf28` | worker tests 6, pass 6, fail 0; API tests 6, pass 6, fail 0 |
| `node --experimental-strip-types --test` of the changed test files after `npm run build`, against `make services-up` | `a508de8d` | tests 84, pass 84, fail 0: worker 14, client 6, Scheduling delivery 12, Scheduling selection 15, delivery integration 12, PostgreSQL account pool 19, API 6 |
| `npm run verify:comments` | `8ddb3800` working tree with the records | `Every comment is within the comment length rule.` |
| `npm run check:boundaries` | `8ddb3800` | `Workspace and hexagonal boundary checks passed.` |
| `npm run openspec -- validate deliver-slot-credential-per-run --strict` | records commit | `Change 'deliver-slot-credential-per-run' is valid` |
| `npm run verify:archive` | records working tree | `Every active OpenSpec change archives into strictly valid specs.` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c5b072d77ab93cdba75ae855bedf518a1427a109`; tests 3835, pass 3826, fail 0, skipped 9; all files 99.40% lines, 92.75% branches, 98.86% functions.
- `npm run openspec -- validate deliver-slot-credential-per-run --strict`: passed, `Change 'deliver-slot-credential-per-run' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 89 file(s); every pass summary file is valid: 69 file(s); every route file is valid: 25 file(s).`.
- Spec diff against the merge base `dc2ae98b379d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18587-d7e0-7ea0-8d5e-990409afbebb` | 0 | 2 | 4 | 0 |
<!-- make record: end -->

## Independent review

The brief assigns pass 1 to reviewer A `codex gpt-6-astra#medium`, pass 2 to reviewer B `claude claude-opus-5-5#medium`, and pass 3, only after a pass 2 with a Medium or worse finding, to reviewer A `codex gpt-6.1-sol#medium`, at most three passes and stopping at a Low-only pass (governance, policy version 8). Unreviewed fixes go to the coordinator by commit for the architect check before the archive.

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a18587-d7e0-7ea0-8d5e-990409afbebb`, on `071fb80e`. The worktree snapshot before and after the review was `699479f2115ac698cb5c91de00dd378a70d3e0977ed89791a96686594ab2754b`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /Users/petarnenov/taskelith-worktrees/deliver-slot-credential-per-run -`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-10-29T02:40:34.533Z. Model confirmation: `model: gpt-6-astra`, `reasoning effort: medium`, `sandbox: read-only` in the Codex log header, as `make review` printed them. `make review` printed "route: route.json was made for this tree" and "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 2, Medium 4, Low 0, matching the pass 1 line of `passes.jsonl`; all six fixed and recorded in `findings.jsonl`.
  1. High, concurrency-race (`apps/worker/src/run-slot-credentials.ts`): a fetch in flight while the run, its ownership generation, or the recovery epoch ended was still held and returned when it resolved, so obtain, forget, resolve, obtain reused the old credential. Fixed in `33a979f8`: each fetch is registered with its run, generation, and epoch; a forget, or a call that drops stale deliveries, marks the matching fetches ended, and after the await a delivery of an ended fetch, or of a fetch during which the epoch changed, is neither held nor returned and the call fails with `conflict`. Design decision 8 and the scenario "Delivery after the end" say so.
  2. High, redaction (`packages/adapters/worker-control-plane-client/src/http-slot-credential-client.ts`): an error answer's `message` and `details.reason` were copied into the client's failure, and a refusal's `message` passed through shape-based sanitizing, which a subscription credential without a fixed shape passes. Fixed in `26da3651`: a refusal carries its reason, checked against `SLOT_CREDENTIAL_REFUSAL_REASONS`, and a local message; every other answer is a failure with the code of its status, the message `fetchSlotCredential answered <status>`, and only the status in its details. `statusFailureCode` of `control-plane-http.ts` gives the code; `statusFailure` of the other clients is unchanged.
  3. Medium, contract-drift (`apps/worker/src/run-slot-credentials.ts`): a stale delivery was dropped only on the next `obtain`, so without one it stayed in memory (Q7, contract section 7.3). Fixed in `33a979f8`: `RunSlotCredentials` gains `forgetOwnershipGeneration` and `forgetRecoveryEpoch`, and `forget` is renamed `forgetRun`, so the harness host drops what ended at once; the port comment, the spec delta, design decision 8, contract section 13, and the proposal say so, and the limitation that this record named is removed.
  4. Medium, redaction (`apps/control-plane/src/application/slot-credential-delivery.ts`): a thrown reveal error was replaced, but any returned failure other than `not-found` reached the answer verbatim, an adapter's diagnostic included. Fixed in `e400f0dc`: every reveal failure gets a local message that names only the slot, `unavailable` for a throw or an `unavailable` failure, `internal` otherwise; design decision 3, contract section 13, and the scenario "Failed reveal" say so.
  5. Medium, missing-fail-before-test (`apps/control-plane/test/slot-credential-delivery.integration.test.ts`; `verification.md`): no test checked that the record is committed when the reveal runs, that a check transaction that does not commit reveals nothing, or that a failed reveal leaves the record (Q1), and this record claimed "every new output path". Fixed in `e400f0dc`: "the delivery record is committed when the credential is revealed" reads the table over another connection inside the reveal; "a delivery whose transaction does not commit reveals nothing and leaves no record"; "a failed reveal leaves the committed record, and a retry delivers and counts again", the retry after the grant expired; the scenario "Record before the reveal" states them. The secrecy claim under "Author self-check" now lists the paths that tests check, and no other.
  6. Medium, process (`packages/modules/scheduling/src/ports/slot-credential-deliveries.ts`): the new persistence port had no shared conformance suite (ADR 0004 principle 2). Fixed in `a508de8d`: `SLOT_CREDENTIAL_DELIVERIES_CONFORMANCE` checks the lookup by task, execution, and slot, the replacement of a record, and the order by code point with isolation by task and execution; it runs against `InMemorySlotCredentialDeliveries` and, each case in one transaction, `PostgresSlotCredentialDeliveries`, and a test checks that it rejects three defective doubles.
- Fail-before. Each fix was broken in place on `a508de8d`, built with `npm run build`, run, and restored with `git checkout`; the logs `fb-12c-*.log` are in the session scratchpad.
  - Finding 1 (`fb-12c-F1-in-flight.log`): with the ended check after the await removed, the worker test: tests 14, pass 10, fail 4; each of the four in-flight cases (run end, generation, epoch forgotten, epoch moved) got a delivery where it expected the `conflict` failure.
  - Finding 3 (`fb-12c-F3-forget-noop.log`): with `forgetOwnershipGeneration` and `forgetRecoveryEpoch` as no-ops: tests 14, pass 10, fail 4; both held cases returned the forgotten credential (`'fixture-run-slot-token'`, expected `'fixture-forgotten-token'`), and the two in-flight cases of these operations got a delivery.
  - Finding 2 (`fb-12c-F2-old-client.log`): the new client tests against the client source of `071fb80e`: tests 6, pass 3, fail 3; the refusal carried the server's message `revoked zq7Kx2`, the failure for an unknown reason carried `answered 422: odd` and `reason: 'not-a-reason'`, and the refusal message test got the server text.
  - Finding 4 (`fb-12c-F4-verbatim.log`): with returned failures other than `not-found` passed on as before: the delivery integration test: tests 12, pass 11, fail 1; the `invalid` failure came back with the fixture credential in its message and details.
  - Finding 5 (`fb-12c-F5-reveal-in-transaction.log`): a mutant that reveals inside the check transaction, before the record, and fails it on a failed reveal: tests 12, pass 6, fail 6; another connection saw no record at the first reveal (`[[], [1]]`), the uncommitted transaction revealed once, and the failed reveal left no record; three earlier tests failed on the extra reveal count.
  - Finding 6: the suite is new, so its test runs it against three defective doubles, a record that keeps the first, a locale order, and a key without the task, and expects the cases each breaks. Against PostgreSQL (`fb-12c-F6-postgres.log`), with the adapter's lookup ignoring the task, `ON CONFLICT DO NOTHING`, and `ORDER BY slot_id` without `COLLATE "C"`: the three PostgreSQL cases failed and the three in-memory cases passed; the order came back `["slot-a","slot-b","slot-Z"]`, which the earlier PostgreSQL tests did not check.
- After the fixes: `npm run build`, then the changed test files gave tests 84, pass 84, fail 0 (under "Checks"); `npm run verify:comments` and `npm run check:boundaries` passed; `npm run openspec -- validate deliver-slot-credential-per-run --strict` valid; `make findings ARGS="validate"` valid. The `make verify` of the fixed tree is under "Generated checks".
- Pass 1 found High and Medium findings, and the fixes change code, tests, the specification, and the contract, so pass 2 by reviewer B is required.

## Limitations

- Nothing calls the new paths outside tests: the composition passes no delivery service (12d), and no harness host calls `RunSlotCredentials` (item 18).
- A reveal that fails after the commit leaves a delivery record, which 13c treats as revealed (design, Q1); until 13c the session output redactor redacts known shapes only.
- A changed credential version during a run is `internal` until key rotation (12d, or 12f) defines its typed outcome (design, Q2).
- No harness host calls `forgetRun`, `forgetOwnershipGeneration`, or `forgetRecoveryEpoch` yet (item 18); the tests call them directly, and the in-flight cases resolve controlled promises in one process.
- The gated race runs one interleaving: the first attempt of each racer waits after its read for the other, so both read no record and one retries.

## Remaining gates

- Independent review pass 2 by reviewer B, required because pass 1 had High and Medium findings, and pass 3 by reviewer A only after a pass 2 with a Medium or worse finding; then the architect check of any unreviewed fix.
- Archive, then integration into dev by the coordinator (single pull request).
