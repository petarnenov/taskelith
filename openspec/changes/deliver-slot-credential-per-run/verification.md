# Verification: deliver-slot-credential-per-run

## Scope and source

G3 item 12 (`docs/g3-plan.md`, row 12), sub-change 12c, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `dc2ae98b` (#412, 12b): the per-run delivery of a reserved slot's credential through `fetchSlotCredential` over HTTPS only (account pool contract section 7; execution wire contracts section 8.6), a per-run delivery record without the credential for 13c, and the worker port that item 18's harness host calls ([design](design.md), decisions 1 to 9). The design's open coordinator questions Q1 to Q8 are unanswered; each takes the most conservative option.

## Revision

- Base: `dev` `dc2ae98b`, the brief's checklist base; `git fetch origin` before routing showed `origin/dev` still at `dc2ae98b`.
- `dbacbda9` `chore: start the deliver-slot-credential-per-run change` (the brief's `checklist.json`, saved `--at dc2ae98b379dbc721df0ae88f05446cbc18b8059 --size M`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `8ddb3800` `chore: deliver a reserved slot's credential per run over HTTPS and record each delivery`.
- `docs: record the deliver-slot-credential-per-run design, spec delta, and contract updates`: the proposal, the design, the spec delta, the task list, this record, account pool contract status and section 13, execution wire contracts section 9, and `docs/g3-plan.md` row 12.
- `docs: route the deliver-slot-credential-per-run change` (`route.json`, unedited).
- `docs: record the make verify of deliver-slot-credential-per-run`, the `make record` of a passing `make verify` on the routed tree.

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and the npm of the `Makefile` pin; Docker 29.5.2 for the PostgreSQL, NATS, and Toxiproxy services of `make test` and `make services-up`.

## Author self-check

- Scope: 12c only, as the brief scopes it. 12d (the other slot commands, the sweep, the HTTP operations of the account slots, the wire's slot rejecting reasons, the composition of the key and the admitted pairs, the default cooldown setting, and key rotation), 12e, and item 18 are untouched. Nothing new is wired into the composition: `ApiServices.slotCredentials` is optional, the route answers `503` without it (design, decision 9), and no harness host calls `RunSlotCredentials`.
- Wire: no change. `git diff dc2ae98b -- packages/contracts` is empty; the route implements `fetchSlotCredential`, `SlotCredentialDelivery`, and `SlotCredentialRefusal` of `execution.openapi.json` 0.8.0, and a test checks the `200` and `422` bodies against their schemas.
- Dependencies: none added; `package.json` and `package-lock.json` are unchanged.
- Migration: `1792933300000_slot-credential-deliveries.sql`, the first number of the brief's range; its down migration drops the table, and a test checks its checks and the down migration.
- Secrecy: the credential is decrypted only by `reveal` after the check transaction commits, enters a response body only in `slotCredentialBody`, and is `[redacted]` in every string, JSON, and inspection form of `SlotSecret` and `DeliveredSlotCredential`. Tests check every new output path: the request log of the API server, the `422` body, the client's failures, the worker's logs and held deliveries, every database table, and every NATS stream message after the outbox is published. Every credential in the tests is a fixture text, never a real credential.
- Hexagonal: the checks are pure Scheduling domain functions; the delivery record is a Scheduling port with in-memory and PostgreSQL adapters; the service is in the control plane's application layer, the wire parsing in its API layer; the worker ports are in the Execution module, with the HTTP adapter in `@taskelith/worker-control-plane-client`. `npm run check:boundaries` passed. The neutrality test of the pool lists the two new Scheduling source files and the new test file.
- Spec delta: four added requirements of `account-pool-port`, 347 to 381 characters each; none is modified or removed. The existing requirements "Credential kept out of worker records", "Re-delivery to an adopted execution", "Run redaction by credential value", and "Confidential credential transport" stay as they are; the TLS-only route is stricter than the last one's co-located allowance (design, Q3).
- Contracts: account pool contract status line and a new section 13; execution wire contracts section 9, the G3 item 12 obligation, names 12c; `docs/g3-plan.md` row 12 names 12c.
- Comments: `npm run verify:comments` passes.

## Fail-before

Each behavior was broken in place on `8ddb3800`, the build and the tests run, and the source restored with `git checkout`; the logs are in the session scratchpad.

- Checks removed (`fb-A.log`): `checkSlotDeliveryOwnership` and `checkDeliveredSlot` made to pass everything. The Scheduling unit test and the delivery integration test: tests 16, pass 7, fail 9; each failing test got a delivery or no refusal where it expected `execution-conflict`, `stale-recovery-epoch`, `quarantined`, `assignment-not-active`, `stale-ownership-generation`, `capacity-not-reserved`, or `revoked`.
- Delivery record never written (`fb-B.log`): the integration test: tests 8, pass 2, fail 6. The re-delivery after the grant expired was refused with `execution-conflict`; the race recorded attempts `[1, 1]` instead of `[1, 2]`; the version, secrecy, and NATS tests failed on the refused re-delivery they make.
- Credential appended to the outbox by the service (`fb-C.log`): the database scan and NATS tests: tests 2, pass 0, fail 2; the scan found the credential in table `outbox`, and the NATS test found it at byte offset 649 of a stream message.
- Race without retry (`fb-D.log`): the gated race with `new PostgresDatabase(url, { serializationAttempts: 1 })` in a temporary copy failed in each of two runs, "the transaction lost 1 serialization races in a row", so the gate forces a serialization failure that only the retry resolves; with the default attempts it passed in each of three runs.
- Transport, binding, and worker holding (`fb-EFG.log`), four mutants at once: the API server's TLS guard, the client's HTTPS guard, the client's binding check, and the worker's held delivery disabled. The API, client, and worker tests: tests 14, pass 10, fail 4. The plain-HTTP request got `200`, expected `500`; the HTTPS guard test got `unavailable`, expected `invalid`; a delivery for another execution was used; and the worker fetched twice for one run.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test` of the new and changed test files after `npm run build`, against `make services-up` | `8ddb3800` | tests 64, pass 64, fail 0: Scheduling delivery checks 8, API 5, client 5, worker 4, delivery integration 8, migrations 34 |
| `npm run verify:comments` | `8ddb3800` working tree with the records | `Every comment is within the comment length rule.` |
| `npm run check:boundaries` | `8ddb3800` | `Workspace and hexagonal boundary checks passed.` |
| `npm run openspec -- validate deliver-slot-credential-per-run --strict` | records commit | `Change 'deliver-slot-credential-per-run' is valid` |
| `npm run verify:archive` | records working tree | `Every active OpenSpec change archives into strictly valid specs.` |

<!-- make record: begin -->
<!-- make record: end -->

## Limitations

- Nothing calls the new paths outside tests: the composition passes no delivery service (12d), and no harness host calls `RunSlotCredentials` (item 18).
- The co-located plain-HTTP allowance of account pool contract section 7.2 is not implemented (design, Q3).
- A reveal that fails after the commit leaves a delivery record (design, Q1).
- The gated race runs one interleaving: the first attempt of each racer waits after its read for the other, so both read no record and one retries.

## Remaining gates

- Coordinator's answers to the design's open questions Q1 to Q8.
- Independent review passes 1 to 3 as the governance assigns them, then the architect check of any unreviewed fix.
- Archive, then integration into dev by the coordinator (single pull request).
