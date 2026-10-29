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
- `docs: apply the coordinator's answers to the deliver-slot-credential-per-run design`: the design records the answers Q1 to Q8 verbatim; the spec delta modifies "Confidential credential transport" (Q3) and adds the generation and epoch scenarios to "Run slot credential port on the worker" (Q7); account pool contract sections 7.2, 7.3, 11, and 13 and `docs/g3-plan.md` row 12 follow; the proposal, the task list, and this record.
- `docs: route the deliver-slot-credential-per-run change again after the coordinator's answers` (`route.json`, unedited, at head `8c1a7af9`): `d11dbf28` and the docs commit change the diff outside the change directory (the worker, its port, the API and worker tests, the account pool contract, and the plan), so under worker step 4 the route of `f0fb9f6c` was stale; it was deleted and the change routed again. "route: elevated (lines, files, security, contracts), rule version 2", features 1706 lines and 38 files; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.75) and agrees; recommendation only. `git fetch origin` showed `origin/dev` still at `dc2ae98b`.
- `9821fee0` `docs: record the second route of deliver-slot-credential-per-run` (this record).
- `docs: record the second make verify of deliver-slot-credential-per-run`, the `make record` of a passing `make verify` on the tree of `9821fee0` (log `verify-12c-2.log` in the session scratchpad, one run).

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12c only, as the brief scopes it. 12d (the other slot commands, the sweep, the HTTP operations of the account slots, the wire's slot rejecting reasons, the composition of the key and the admitted pairs, the default cooldown setting, and key rotation), 12e, and item 18 are untouched. Nothing new is wired into the composition: `ApiServices.slotCredentials` is optional, the route answers `503` without it (design, decision 9), and no harness host calls `RunSlotCredentials`.
- Wire: no change. `git diff dc2ae98b -- packages/contracts` is empty; the route implements `fetchSlotCredential`, `SlotCredentialDelivery`, and `SlotCredentialRefusal` of `execution.openapi.json` 0.8.0, and a test checks the `200` and `422` bodies against their schemas.
- Dependencies: none added; `package.json` and `package-lock.json` are unchanged.
- Migration: `1792933300000_slot-credential-deliveries.sql`, the first number of the brief's range; its down migration drops the table, and a test checks its checks and the down migration.
- Secrecy: the credential is decrypted only by `reveal` after the check transaction commits, enters a response body only in `slotCredentialBody`, and is `[redacted]` in every string, JSON, and inspection form of `SlotSecret` and `DeliveredSlotCredential`. Tests check every new output path: the request log of the API server, the `422` body, the client's failures, the worker's logs and held deliveries, every database table, and every NATS stream message after the outbox is published. Every credential in the tests is a fixture text, never a real credential.
- Hexagonal: the checks are pure Scheduling domain functions; the delivery record is a Scheduling port with in-memory and PostgreSQL adapters; the service is in the control plane's application layer, the wire parsing in its API layer; the worker ports are in the Execution module, with the HTTP adapter in `@taskelith/worker-control-plane-client`. `npm run check:boundaries` passed. The neutrality test of the pool lists the two new Scheduling source files and the new test file.
- Spec delta: four added requirements of `account-pool-port`, 347 to 438 characters each, and one modified, "Confidential credential transport", 269 characters, which keeps its scenario "Remote worker before TLS" unchanged and adds "Co-located worker without TLS": the coordinator's answer Q3 drops the plain-HTTP allowance for a co-located worker. None is removed. The existing requirements "Credential kept out of worker records", "Re-delivery to an adopted execution", and "Run redaction by credential value" stay as they are.
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
| `npm run verify:comments` | `8ddb3800` working tree with the records | `Every comment is within the comment length rule.` |
| `npm run check:boundaries` | `8ddb3800` | `Workspace and hexagonal boundary checks passed.` |
| `npm run openspec -- validate deliver-slot-credential-per-run --strict` | records commit | `Change 'deliver-slot-credential-per-run' is valid` |
| `npm run verify:archive` | records working tree | `Every active OpenSpec change archives into strictly valid specs.` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `654e16a32ef260fcc5d10fdb4ea3338e32bdb1a8`; tests 3815, pass 3806, fail 0, skipped 9; all files 99.39% lines, 92.72% branches, 98.85% functions.
- `npm run openspec -- validate deliver-slot-credential-per-run --strict`: passed, `Change 'deliver-slot-credential-per-run' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 89 file(s); every pass summary file is valid: 69 file(s); every route file is valid: 25 file(s).`.
- Spec diff against the merge base `dc2ae98b379d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- Nothing calls the new paths outside tests: the composition passes no delivery service (12d), and no harness host calls `RunSlotCredentials` (item 18).
- A reveal that fails after the commit leaves a delivery record, which 13c treats as revealed (design, Q1); until 13c the session output redactor redacts known shapes only.
- A changed credential version during a run is `internal` until key rotation (12d, or 12f) defines its typed outcome (design, Q2).
- The worker drops a stale held delivery when it is next asked for one, not at the moment the epoch or generation changes, since it reads both only then.
- The gated race runs one interleaving: the first attempt of each racer waits after its read for the other, so both read no record and one retries.

## Remaining gates

- Independent review passes 1 to 3 as the governance assigns them, then the architect check of any unreviewed fix.
- Archive, then integration into dev by the coordinator (single pull request).
