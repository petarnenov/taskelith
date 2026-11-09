# Verification: wire-account-pool-into-control-plane

## Scope and source

G3 plan item 12d, sub-change B1 (`docs/g3-plan.md`, row 12), developed by a briefed subagent from `dev` `686888cf` (#451) under the coordinator (Niki) decisions Q1 to Q12 of 2026-11-05: the control plane serves the eight account slot operations of `control-plane.openapi.json` 0.5.0 with compare-and-set on the client's revision (Q3), lists slots by identifier (Q4), refuses an unknown project (Q5), composes the slot credential key, `PostgresSlotCredentials`, the admitted Claude Code pair, the delivery, the sweep loop (Q8), and the default cooldown (Q7), creates the key at initialization only (Q9), mints slot identifiers (Q10), and keeps worker-only routes off the browser endpoint (Q11). The one OpenAPI change is Q1: five response descriptions, no schema change. Excluded (Q2, Q6, Q12): the slot rejecting reasons on the wire and OpenAPI 0.6.0 (B2), the audit of the slot commands, key rotation (12d C, 12f), the load and health signals (12e), and any UI.

## Revision

- Base: `dev` `686888cf`; the brief's `checklist.json` was generated at `686888cf91e60958cdec60a398b916de13ce4fb5` with `--size M-L`.
- `6dcf3295` `chore: start the wire-account-pool-into-control-plane change`, `5a6566bd` `docs: create the wire account pool into control plane change`.
- Tests first: `db89d709` (scheduling listing and expected revision, PostgreSQL commands), `4129599e` (slot identifier, key file, initialization), `388efa40` (OpenAPI descriptions), `3400d091` (composition, routes, endpoint split, settings, Docker integration).
- Implementation: `1cc8e8b3` (expected revision), `0e1cfb07` (listing), `51a084ae` (`newSlotId`), `d550c5c3` (`SlotCredentialKeyFile`), `9ea3d6c6` (key at initialization), `2ff56c5b` (OpenAPI descriptions), `b02de760` (test fixture corrections, see "Fail-before"), `45a62f3c` (settings), `05ddf550` (service and signals), `7caf3c88` (routes, dispatch, endpoint split), `7ee39718` (composition), `cb67e824` (contract documents), `a0a7c85f` the first `route.json` (unedited), `7b955dca` the typecheck fix of the `ApiServices` and `RunningControlPlane` test fixtures.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Docker 29.5.2, Node.js v24.22.1 (the `.nvmrc` pin). The focused PostgreSQL and NATS runs used `scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-12db1-focus ...`; no other Docker resource was touched.

## Author self-check

- Scope: only the brief's items. `git diff --shortstat 686888cf 7b955dca -- '*.ts' '*.sql'`: 33 files changed, 1499 insertions(+), 154 deletions(-) (19 source files, 14 test files); all files: 47 files changed, 1932 insertions(+), 163 deletions(-).
- Coordinator decisions, each with its test:
  - Q1: the 409 of `updateAccountSlot`, `revokeAccountSlot`, `reinstateAccountSlot`, and `removeAccountSlot` and the 200 of `rotateSlotCredential` state the 12d A answers; `slot-command-descriptions.test.ts` pins the five texts. A description is no breaking change for `oasdiff`, so the version stays 0.5.0; `npm run verify:web-api-types` reports the generated web types unchanged.
  - Q3: `commandSlot` answers `not-found` for a removed or unknown slot, then `conflict` for a stored revision other than `expectedRevision`, before every state rule; the rotation compares in its read transaction, before it stores. Tests: the eight "... at a moved revision fails with conflict and writes nothing" cases (no version stored or destroyed), "a removed or unknown slot is not found before its revision is compared", the route test "the commands change a slot by its revision, answer a repeat at the current revision unchanged, and refuse a moved one", and the PostgreSQL command suite with the current revision.
  - Q4: `list` and `listForProject` in both adapters (`COLLATE "C"` on PostgreSQL), two conformance cases with a slot whose identifier sorts differently by locale, and `CarelessListingAccountSlots`, which both cases reject; `AccountSlotService` reads 101 to name `next` ("the lists page by identifier at 100 slots and name the next page").
  - Q5: `#knownProjects` reads each project through `ProjectSetupService.readProject` before any store; an unknown one is 400 with `details.field` `allowedProjects` on add and update, and an unknown project of `listProjectAccountSlots` is 404.
  - Q6: no audit; see "Follow-ups".
  - Q7: `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES`, digits only, 1 to 1440, 60 when unset or empty ("the default slot cooldown is 60 minutes unless configured from 1 to 1440 whole minutes" refuses `0`, `1441`, `1.5`, `-5`, ` 30`, `1e2`, `0x10`, and `hour`); `SlotSignals.applyLimit` applies it ("the default cooldown of the settings reaches the limit signal of a reserved slot"), and the composed value reaches `RunningControlPlane.slotSignals` over Docker.
  - Q8: the supervised loop `slot-credential-sweep` runs `sweepSlotCredentials` with the least grace age every `SLOT_CREDENTIAL_SWEEP_MILLISECONDS` (3,600,000) or `slotCredentialSweepMilliseconds`; a rejected sweep is `unavailable` and logged as `scheduling.slot-credentials.sweep-failed`. Tests: "a sweep that rejects is answered as unavailable and never thrown", "a sweep discards a version that no record names once it is older than the grace age", and over Docker "the sweep loop discards a version that no record names once it is older than the grace age".
  - Q9: `SlotCredentialKeyFile` extends `ControlPlaneKeyFile` and refuses a key that is not 32 bytes with `slot-credential-key has N bytes, not 32`; `openSlotCredentialKey` is removed; initialization ensures the key with the three others (`ensureKeyFiles`), also on a rerun; the start only reads it. Tests: `slot-credential-key.test.ts`, `administration.integration.test.ts` (mode 0600, not in the output, kept on a rerun, recreated when missing), `account-pool-composition.test.ts`, and the Docker start without the key.
  - Q10: `RandomIdentifiers.newSlotId()` (`s` and 32 hexadecimal digits); a minted identifier already stored answers 500 with "the account slot could not be stored".
  - Q11: `browserEndpointRoutes` and `workerEndpointRoutes`; `endpoint-routes.test.ts` and, over Docker, the six worker-only operations answer 404 on the browser endpoint and not on the worker endpoint.
  - Admitted pair: `ADMITTED_SLOT_DELIVERIES` holds only `claude-code`/`subscription-token` with `slotLimit` 1; a second slot, `device-login`, and another harness answer 400 with their details, and two concurrent adds over PostgreSQL give one 201 and one 400.
- Credentials: every route test sends a random credential per call and checks that no answer body or header and no log record holds it and that every answer carries `Cache-Control: no-store`; the Docker round trip checks the answers and the log sink. `grep -c fixture-` over every log of this change is 0.
- Requirement texts are under 500 characters; `npm run openspec -- validate wire-account-pool-into-control-plane --strict` passes.
- Commit types: no published `taskelith` code changes; `chore`, `test`, and `docs`, without AI attribution. `npm run verify:comments`: `Every comment is within the comment length rule.`

## Fail-before

The tests were committed before the implementation (`3400d091`) and run with `node --experimental-strip-types --test` against the base `dist` built at `686888cf` (`build-12dB1-base.log`); logs in the session scratchpad.

- `fb-12dB1-unit.log`, 10 unit files: tests 151, pass 123, fail 28: the five description tests, the slot identifier, the key file suite, the settings test, the served-operations list, the composition, route, and endpoint files (missing exports), the listing tests, and the moved-revision cases. The moved-revision cases failed in their fixture (`a new slot starts at the first revision`), not on the missing compare, and "value redaction takes linear time on long runs" failed as a timing flake of the loaded host.
- `b02de760` fixed the fixture (a later revision is reached by `replace`) and renamed two conformance cases whose "cursor" matched the pool's vendor-name guard. `fb-12dB1-unit-rerun.log` runs the scheduling tests at that commit with the scheduling sources of `686888cf` (emitted despite the expected type errors of the base port): tests 82, pass 65, fail 17, among them the eight moved-revision cases and the listing cases. "A removed or unknown slot is not found before its revision is compared" passes at the base, which already answered `not-found`; it guards the order of the two checks.
- `fb-12dB1-docker.log`, PostgreSQL commands and pool, initialization, and the composed API: tests 77, pass 67, fail 10: the removal of a reserved slot (no expected revision), initialization (no key), every new `account slots` test, and the owner test that depends on the initialization test.

After the implementation: the unit files 874 of 876 (`unit-after.log`; the vendor-name guard before the rename, and the timing flake), the scheduling module 244 of 244, and `docker-after-1.log` 83 of 83.

### Mutation controls

| Control | Mutation | Result |
| --- | --- | --- |
| `mut-12dB1-1-skip-revision-compare.log` | `commandSlot` skips the expected revision compare | tests 39, fail 9: the eight moved-revision cases and the route test of the commands |
| `mut-12dB1-2-slot-limit-two.log` | the admitted pair allows two slots | tests 17, fail 2: "Claude Code admits one subscription-token slot, and no other mechanism or harness" and the route test of the 400s |
| `mut-12dB1-3-never-shared.log` | `sharedWithOtherProjects` is always false | tests 9, fail 1: "a project reader sees the project's active slots, whether each serves other projects, and never their names" |
| `mut-12dB1-4-confidential-only-filter.log` | the browser filter drops only confidential routes | tests 4, fail 2: both browser endpoint tests |
| `mut-12dB1-5-add-not-write-only.log` | `addAccountSlot` without `writeOnlyBody` | tests 9, fail 1: "a body that its write-only schema refuses names no credential or property it carried" |
| `mut-12dB1-6-not-found-as-409.log` | slot commands map `not-found` to 409 | tests 9, fail 1: "a removed or unknown slot is 404 for every command, and a bad slot identifier is 400" |
| `mut-12dB1-7-lazy-key-at-start.log` | the start ensures the key before it reads it | tests 8, fail 1: "a missing slot credential key refuses the start, names init, and is never created at start" |
| `mut-12dB1-8-sweep-loop-not-supervised.log` | the sweep loop is left out of the supervised loops | tests 1, fail 1 over Docker: "the sweep loop discards a version that no record names once it is older than the grace age" |

Each mutant built (`build exit 0` in its log), and each source was restored and rebuilt after its run.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| Focused unit, PostgreSQL, and composition runs | `7ee39718` | Listed under "Fail-before": all pass |
| `npm run check:boundaries` | `7ee39718` | Failed: five `ApiServices` fixtures of `api-server.test.ts` without `accountSlots` and `fakeRunning` without `slotSignals`; fixed in `7b955dca`, after which it passes |
| `make verify` run 1 (`verify-12dB1-1.log`) | `932774b7`, tree `487cb867`, clean | Passed at the first run, profile full, stamp written, no rerun of any suite: tests 4933, pass 4924, fail 0, skipped 9; all files 99.45 % lines, 92.88 % branches, 98.90 % functions; no `fixture-` credential in the log; recorded below |

No run hit the known flakes (`installation-script` base-ten bound, `web-app.test.ts:279`).

### Coverage

Changed `dist` files in `make verify` run 1 (lines, branches, functions): `api/account-slot-api.js` 100 / 74.00 / 100 (new); `application/account-slot-service.js` 100 / 84.62 / 100 (new); `application/slot-signals.js` 100 / 100 / 100 (new); `composition/account-pool.js` 100 / 93.33 / 100 (new); `api/routes.js` 100 / 100 / 100; `composition/settings.js` 98.82 / 95.79 / 100 (uncovered lines 168-169); `control-plane-store/slot-credential-key.js` 100 / 100 / 100; `postgres/account-pool-repositories.js` 100 / 96.70 / 100; `secrets/node-secrets.js` 100 / 100 / 100; scheduling `in-memory-account-pool.js` 100 / 96.59 / 100 and `account-slot-commands.js` 100 / 93.10 / 100. The uncovered branches of `account-slot-api.js` are mostly the failure arms of the handlers' `ok ? ... : failure` returns and the `?? ''` default of a missing path parameter.

### Route

`route.json` (rule version 5) at `cb67e824`, committed unedited (`a0a7c85f`); the typecheck fix and this record changed the diff, so it was deleted (`ab7c63f9`) and routed again at that commit, committed unedited (`932774b7`) with the same result (P(third) 0.71). The first route: elevated (lines, files, security, contracts, size); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees (P(third) 0.72). Reviews run at effort medium (owner decision 2026-11-02); the coordinator assigns the reviewers.

## Deviations

1. The brief named four OpenAPI descriptions; the coordinator's list holds five texts (the 409 of update, revoke, reinstate, and remove, and the 200 of rotate), and all five changed.
2. `AccountSlotService.add` takes a `SlotSecret`, which the handler makes from the body at once (design, decision 13), so the composition test passes one instead of the text.
3. Mutation 8, "sweep loop not supervised", leaves the loop out of the supervised loops: the sweep never rejects, so a loop run outside `supervise` behaves the same until a stop.
4. The design's departures stand: an empty `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES` is the default, and the composed `fetchSlotCredential` is shown by a 422 of an unreserved slot.

## Follow-ups

- Audit of the slot commands with their actor and time (account pool contract section 8; coordinator decision Q6).
- The slot rejecting reasons on the wire and OpenAPI 0.6.0 (B2).
- A placement writes `lastReservedAt` and moves the slot's revision, so a revocation of a busy slot by the client's revision can meet `conflict` again and again; emergency revocation may need a revision-free path or a retry rule (the PostgreSQL race test now expects the `conflict` and a revocation at the new revision).
- `SlotSignals` has no caller until item 18.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `487cb8679aa80eb46c25feacc8643c93eb913bb6`; tests 4933, pass 4924, fail 0, skipped 9; all files 99.45% lines, 92.88% branches, 98.90% functions.
- `npm run openspec -- validate wire-account-pool-into-control-plane --strict`: passed, `Change 'wire-account-pool-into-control-plane' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 128 file(s); every pass summary file is valid: 108 file(s); every route file is valid: 61 file(s).`.
- Spec diff against the merge base `686888cf91e6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer and role: Codex CLI `codex gpt-6-astra#medium`, role A, range `686888cf..24238dcd`.
- Invocation: `make review` with the fixed Codex row of `scripts/reviewer-invocations.ts`. The output of that command was lost with the coordinator's scratchpad.
- Model confirmation: the session log's `turn_context` names `gpt-6-astra`, effort `medium`, sandbox `read-only`; `session_meta` names source `exec` and Codex CLI 0.166.0.
- Session: `01a1aa8b-64b9-7563-8c98-3fa8bdde7833`, started 2026-11-05T07:10:25Z.
- Snapshot: the before and after values were lost with that scratchpad, so they are not recorded here. The sandbox was read-only, the report says no file was modified, and `git diff 24238dcd ed2354a8` touches only `tasks.md`, the resume note the coordinator added.
- Source of the findings: the coordinator recovered the report from the session log.
- Counts: Critical 0, High 1, Medium 4, Low 3.
- The reviewer ran strict OpenSpec validation, the comment checker, and four focused test files, and confirmed findings 1 to 4 by read-only probes. It did not rerun Docker verification or coverage.

| # | Severity | Category | Finding | Resolution |
| --- | --- | --- | --- | --- |
| 1 | High | redaction | `account-slot-service.ts:89`: add and rotate propagate credential-store exceptions, and the HTTP server puts their message in the failure body | Open |
| 2 | Medium | contract-drift | `account-slot-service.ts:99`: update validates `allowedProjects` before the slot and revision checks, so an unknown project answers 400 on a missing, removed, or stale slot | Open |
| 3 | Medium | error-handling | `account-slot-service.ts:117`: credential-store unavailability answers 500 instead of 503 on add and rotate | Open |
| 4 | Medium | error-handling | `control-plane.ts:351`: a sweep with `failedSlots` returns `ok`, so no `scheduling.slot-credentials.sweep-failed` record is written | Open |
| 5 | Medium | evidence-mismatch | `verification.md:74`: branch coverage of the new `account-slot-api.js` is 74.00 %, below the 75 % required for changed files | Open |
| 6 | Low | spec-wording | Delta `control-plane-api` line 44: the sweep scenario must name a credential whose slot identifier has no record, and keep the rule that a higher orphan waits for a later rotation or removal | Open |
| 7 | Low | spec-wording | Delta `control-plane-api` line 41: the cooldown requirement must say unset or empty, with a scenario | Open |
| 8 | Low | docs | `design.md:15`, `proposal.md:10`: four OpenAPI descriptions must read five, keeping the note on the original discrepancy | Open |

## Remaining gates

- Independent review passes 1 to 3 as the route and the coordinator decide.
- Archive of the change and integration into `dev` by the coordinator (single pull request).
