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
| `make verify` run 2 (`verify-12dB1-2.log`), pass 1 fix round with dev `78a26744` merged | `1ffef4d0`, tree `8966bf4c`, clean | Passed, profile full, stamp written; no `fixture-` credential in the log; totals in the generated section below |
| `make verify` run 3 (`verify-12dB1-3.log`), pass 2 fix round | `542598c4`, tree `a78c737c`, clean | Passed, profile full, stamp written; no `fixture-` credential in the log; totals in the generated section below |

No run hit the known flakes (`installation-script` base-ten bound, `web-app.test.ts:279`).

### Coverage

Changed `dist` files in `make verify` run 1 (lines, branches, functions): `api/account-slot-api.js` 100 / 74.00 / 100 (new); `application/account-slot-service.js` 100 / 84.62 / 100 (new); `application/slot-signals.js` 100 / 100 / 100 (new); `composition/account-pool.js` 100 / 93.33 / 100 (new); `api/routes.js` 100 / 100 / 100; `composition/settings.js` 98.82 / 95.79 / 100 (uncovered lines 168-169); `control-plane-store/slot-credential-key.js` 100 / 100 / 100; `postgres/account-pool-repositories.js` 100 / 96.70 / 100; `secrets/node-secrets.js` 100 / 100 / 100; scheduling `in-memory-account-pool.js` 100 / 96.59 / 100 and `account-slot-commands.js` 100 / 93.10 / 100. The uncovered branches of `account-slot-api.js` are mostly the failure arms of the handlers' `ok ? ... : failure` returns and the `?? ''` default of a missing path parameter.

Run 2 (lines, branches, functions): `api/account-slot-api.js` 100 / 95.00 / 100; `application/account-slot-service.js` 100 / 89.13 / 100; `postgres/account-pool-repositories.js` 100 / 96.81 / 100; scheduling `account-slot-commands.js` 100 / 93.68 / 100.

Run 3: `api/account-slot-api.js` 100 / 95.00 / 100; `application/account-slot-service.js` 100 / 90.38 / 100.

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
- "code point" remains in the `pool` comment of `ports/account-pool.ts`, in `slot-credential-deliveries.ts`, and in conformance test names; pass 2 finding 4 named only the `list` comment and the contract.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a78c737cf120e93e9ef23f5e0e68f3a1e1619ae0`; tests 5003, pass 4994, fail 0, skipped 9; all files 99.45% lines, 93.04% branches, 98.90% functions.
- `npm run openspec -- validate wire-account-pool-into-control-plane --strict`: passed, `Change 'wire-account-pool-into-control-plane' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 129 file(s); every pass summary file is valid: 109 file(s); every route file is valid: 62 file(s).`.
- Spec diff against the merge base `78a267444f4d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1aa8b-64b9-7563-8c98-3fa8bdde7833` | 0 | 1 | 4 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `cf408484-28ee-440f-875c-a94d881f9ef1` | 0 | 0 | 0 | 4 |
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
| 1 | High | redaction | `account-slot-service.ts:89`: add and rotate propagate credential-store exceptions, and the HTTP server puts their message in the failure body | add and rotate catch every credential-store exception in AccountSlotService and answer fixed text, so a store error cannot carry a submitted credential into a response or log record. (`335a331d`) |
| 2 | Medium | contract-drift | `account-slot-service.ts:99`: update validates `allowedProjects` before the slot and revision checks, so an unknown project answers 400 on a missing, removed, or stale slot | update reads the slot read-only through readUpdatableSlot before the projects, so not-found, then revision conflict, then the state rule come before the 400 of an unknown project; the final transaction still compares and sets. (`ac0dd05a`) |
| 3 | Medium | error-handling | `account-slot-service.ts:117`: credential-store unavailability answers 500 instead of 503 on add and rotate | PostgresSlotCredentials throws the port's typed SlotCredentialsUnavailable for an unavailable result; add and rotate map it to a fixed 503 and any other rejection to a fixed 500. (`4e48d0a6`) |
| 4 | Medium | error-handling | `control-plane.ts:351`: a sweep with `failedSlots` returns `ok`, so no `scheduling.slot-credentials.sweep-failed` record is written | logSlotCredentialSweep writes the sweep-failed warning with failed and swept slot counts when a sweep leaves failed slots, and the loop keeps running; a later clean sweep logs nothing. (`ba2dfcd4`) |
| 5 | Medium | evidence-mismatch | `verification.md:74`: branch coverage of the new `account-slot-api.js` is 74.00 %, below the 75 % required for changed files | Route tests cover store outages, bad identifiers and cursors, the minted identifier conflict, and the slot signals on the wire; a focused run shows 95 % of account-slot-api branches, the make verify number is still to be recorded. (`00d0db64`) |
| 6 | Low | spec-wording | Delta `control-plane-api` line 44: the sweep scenario must name a credential whose slot identifier has no record, and keep the rule that a higher orphan waits for a later rotation or removal | The sweep scenario now names a credential whose slot identifier has no record, and a new scenario says a higher orphan version waits for a later successful rotation or removal. (`c17dea2f`) |
| 7 | Low | spec-wording | Delta `control-plane-api` line 41: the cooldown requirement must say unset or empty, with a scenario | The cooldown requirement says unset or empty is 60 minutes, and a new scenario covers the unset or empty value. (`c17dea2f`) |
| 8 | Low | docs | `design.md:15`, `proposal.md:10`: four OpenAPI descriptions must read five, keeping the note on the original discrepancy | design.md and proposal.md say five OpenAPI descriptions and the design's test sentence says five texts, keeping a pointer to the Deviations note on the brief's original four. (`110f4a7b`) |

Fail-before evidence of the fix round. Each test was committed in `00d0db64` and run against the `dist` built at that commit, which holds only the port class and the extracted sweep logger of `d710b577`;

- H1: "an unexpected credential store exception answers 500 with fixed text on add and rotate, and no answer or log record holds the credential" failed with the submitted credential in the response `message`; "a credential store refusal is the fixed internal failure of add and rotate, never an exception" failed with the exception rejecting out of `add`. Fixed by `335a331d`.
- M2: "an update that names an unknown project answers not-found, then conflict, then the state rule first" failed at its first target, a missing slot: 400 `invalid` instead of 404 `not-found`. Fixed by `ac0dd05a`.
- M3: "an unavailable credential store answers 503 with fixed text on add and rotate, and no answer or log record holds the credential" failed with 500 `internal` instead of 503 `unavailable`; "a credential store refusal is the fixed unavailable failure of add and rotate, never an exception" failed with the rejection leaving `add`; "a transaction that answers unavailable rejects every operation with the typed rejection and fixed text" failed because the adapter threw a plain `Error` that quoted the transaction's message. Fixed by `4e48d0a6`.
- M4: "a sweep that leaves slots is logged by count, without any credential, and the next sweep of the loop clears them" failed with no log record where one warning was expected. Fixed by `ba2dfcd4`.
- M5: these route tests changed no product code, so they passed when written: "a store outage is 503 for every list and command, and a bad identifier or cursor is 400 before the store", "a minted identifier that is stored already is 500 with fixed text, and its stored version is discarded", and "a slot's reservation time, cooldown, and usage reach the owner, and only its signals reach a project reader". A focused run of the two account slot test files reads 57 of 60 branches of `account-slot-api.js`; the number of record comes from the next `make verify`.
- Guards that pass before and after: "a transaction that answers another failure stays a defect, not the typed rejection" and "a sweep that did not finish is logged with its failure".

### Pass 2

- Reviewer and role: Claude Code `claude claude-fable-5-1#medium`, role B, range `78a26744..f7ff41c1`, the whole change after the pass 1 fixes.
- Invocation: `make review CHANGE=wire-account-pool-into-control-plane PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium'`, which ran `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose`.
- Model confirmation: the last `result` line of the log has `claude-fable-5-1` in `modelUsage`; `make review` printed the same.
- Session: `cf408484-28ee-440f-875c-a94d881f9ef1`, started 2026-11-09T22:46:11Z.
- Snapshot: `0077e2ecd38688416afe49ec108cd0b61b5051bd88757f1932ff0889df86d846` before and after; identical.
- Pass 1 fixes: the reviewer checked each of the eight and found all resolved, none regressed; their findings are `fixed`.
- Route: `route.json` recommended effort high for this pass; the authorized medium applied.
- Counts: Critical 0, High 0, Medium 0, Low 4. A Low-only pass ends the review, so pass 3 did not run.

| # | Severity | Category | Finding | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Low | evidence-mismatch | `verification.md:137` and `tasks.md:28` said `make verify` had not run after the fixes | Removed the sentence and the resume point (unreviewed) |
| 2 | Low | error-handling | `account-slot-service.ts:149`: an unexpected store rejection became the 500 with its cause dropped | `6a5fcea6`: one `scheduling.slot-credentials.store-failed` record with the constructor name only (unreviewed); tests failed before it with no record written |
| 3 | Low | docs | `account-slot-service.ts:134`: up to 1000 sequential project reads per command | `4fc45eb1`: the bound and its acceptance are in `design.md`, no code change (unreviewed) |
| 4 | Low | naming | "code point" and "code-unit order" name one listing order | `4b8a2e9e`: the port's `list` comment and contract section 6.1 say code-unit order (unreviewed) |

### Unreviewed fixes for the architect check

The four fixes of pass 2 above had no later pass. Coordinator's architect check: pending.

## Archive checks

Run on the working tree of the archive, which is the tree of the archive commit apart from this section.

- `npm run openspec -- archive wire-account-pool-into-control-plane --yes`: archived as `2026-11-10-wire-account-pool-into-control-plane`.
- `npm run openspec -- validate --all --strict`: 71 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `account-pool-port` and `control-plane-api`, the edits of this change's two deltas.
- `findings.jsonl` and `passes.jsonl` moved with the change; `make findings ARGS="validate"`, run by `make verify`, passes.
- `make verify` on that tree: passed, profile full, uncommitted tree so no stamp; tests 5003, pass 4994, fail 0, skipped 9; all files 99.45 % lines, 93.04 % branches, 98.92 % functions.

## Remaining gates

- The coordinator's architect check of the unreviewed fixes of pass 2.
- Integration into dev by the coordinator (single pull request).
