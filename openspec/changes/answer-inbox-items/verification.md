# Verification: answer-inbox-items

## Scope and source

G3 item 15 (`docs/g3-plan.md`, row 15), sub-change 15b under the coordinator's split (Q1 (b)), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `1c75f149` (#431), under the brief of 2026-11-03 and the coordinator decision Q3 (a): the two inbox answer operations, their idempotency keys, the reconciliation source over the G2 `ReconciliationQueue`, and migration `1792934200000`.

Commit type: `packages/modules/*`, `packages/adapters/postgres`, and `apps/control-plane` are private workspaces that the published `taskelith` package does not ship, so every commit uses `chore`, `test`, or `docs`.

## Revision

- Base: `dev` `1c75f149484f08797baafcdf6b515e8fa81c265d`, the development and checklist base.
- `579fabb1` `chore: start the answer-inbox-items change`: `.openspec.yaml`, `checklist.json` saved with the brief's invocation `--save answer-inbox-items --at 1c75f149484f08797baafcdf6b515e8fa81c265d --size M-L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `78e4ccee` `test: cover the inbox answers, their keys, and the reconciliation source`: the tests alone, the base of the fail-before run.
- `d043fcc2` `chore: serve the inbox answers and the reconciliation source`: the module ports and adapters, the migration and its adapters, and the control plane.
- `9c62d07a` `docs: describe the answer-inbox-items change`: proposal, design, spec deltas, tasks, and product ports sections 4.1 and 4.3 and wire contracts section 8.
- `20817b52` `test: cover the resolver's recheck of the task and type the answer tests`: a test of the resolver's refusals, added after two mutations of its rechecks survived (section "Fail-before"), and type annotations that the test type check needs.
- `6e5753b7` routed at head `20817b52` (unedited; tier `elevated`, 46 files and 1881 lines, triggers lines, files, capabilities, contracts, and size; recommended effort high for passes 1 and 2, while the brief names medium).
- `18df9a20` recorded these revisions and the fail-before evidence. Its `make verify` (`verify-15b-1.log`) passed on the tree `b88599d0` (tests 4586, pass 4577, fail 0, skipped 9; all files 99.42% lines, 92.66% branches, 98.83% functions), but the new `api/inbox-answer-api.js` had 61.76% and `application/reconciliation-resolution.js` 67.74% branches, below the 75% the brief requires of a new file.
- `f8da7ac4` `test: cover the failure paths of the inbox answer handler and the resolver` adds a unit test of each and an HTTP test of every answer kind, which changed the diff, so `97dd25f3` deleted that `route.json` and `988b6e93` routed again at head `97dd25f3` (unedited; tier `elevated`, 48 files and 2011 lines, the same triggers and recommendation).
- `c3723b0f` recorded this revision. Its `make verify` (`verify-15b-2.log`) passed on the tree `d36af11a` (tests 4592, pass 4583, fail 0, skipped 9; all files 99.43% lines, 92.75% branches, 98.83% functions; every new file at least 83.33% branches); it is the run that `make record` records, and the commit that records it changes no checked input other than this file.

## Pass 1 fixes

Review pass 1 (role A, `codex gpt-6-astra#medium`, session `01a1a221-d5d0-7172-8ad0-1f95cc21f513`) reported 0 Critical, 1 High, 4 Medium, and 1 Low finding; `8266a7cf` records the pass and its six findings, all fixed, none declined. Review pass 2 reviews these fixes.

- Finding 1 (High, events of the derived items) and finding 4 (Medium, a closed item's generation and closing time): `34d92551`, design decisions 4, 7, and 9, product ports section 4.1, the requirement "Reconciliation item events", and the migration's `reconciliation_item_projections` and `unrecorded-process` touch; unit tests in `d9a5c7f1`.
- Finding 2 (Medium, the scope before the key): `47f4af1b`, design decisions 2 and 6 and the scenario "A replay without the role or scope", with the coordinator's constraint that the role and scope checks run before any key lookup.
- Finding 3 (Medium, copies on read): `8c8db95f`, two conformance cases and the scenario "A read record is changed".
- Finding 5 (Medium, the native answer's rollback): `11254d84`, a PostgreSQL test over the composed native source.
- Finding 6 (Low, the ownership table): `3dec8a61`.
- Coordinator decisions of 2026-11-03 (Niki): `9934d6e9`, design "Coordinator decisions": the product ports section 4.1 listings as a design decision, the wire contracts section 8 edit kept because `item-closed` was already declared for both operations in the OpenAPI document and section 8 (no `breaking-changes.json` entry, the document is unchanged), effort medium with the routed high as advisory, the key scoped to its item with the responder in the digest (product ports section 4.2 now says so), and no project reconciliation item before item 25 registers cards (requirement "Reconciliation items listed").
- The fixes changed the diff, so `b1f62f96` deleted the route of `988b6e93` and `2066e0d5` routed again at head `b1f62f96` (unedited; tier `elevated`, 52 files and 2552 lines, triggers lines, files, capabilities, contracts, and size; recommended effort high for passes 1 and 2, advisory, while the brief and governance authorize medium).

Fail-before of the fixes, logs in the session scratchpad:

- `fb-15b-p1-1.log` (findings 1 and 4): the new PostgreSQL tests of `inbox-answers.integration.test.ts` against the sources of `6c5cbb5a`, through a copy whose `TRUNCATE` omits the new table: 3 of 8 fail, the opening and closing events, the process event, and the closed item's generation and closing time.
- `fb-15b-p1-2.log` (finding 2): the service tests at `6c5cbb5a`: 1 of 8 fails, the held key outside the scope.
- `fb-15b-p1-M2-auth.log` (coordinator constraint on finding 2): the route tests with `authorizeResource` skipping the item check and the service of `6c5cbb5a`: 2 of 6 fail, the replay after the lost scope or role among them, which got the stored outcome.
- `fb-15b-p1-3.log` (finding 3): the new conformance cases at `6c5cbb5a`: 2 of 8 fail, both in-memory stores; the PostgreSQL adapters pass.
- `fb-15b-p1-5.log` (finding 5): the rollback test with `sourceIn` answering through the unbound timeline service: 1 of 1 fails, the state changed after the failed key record.

## Pass 2 fixes

Review pass 2 (role B, `claude claude-fable-5-1#medium`, session `9f964100-5197-4275-b912-82f36763342f`) confirmed every pass 1 fix and reported 0 Critical, 0 High, 0 Medium, and 8 Low findings; `9d412f9b` records the pass and its eight findings, all `fixed-unreviewed`, none declined. The pass is Low-only, so the review ends without pass 3 (governance "Review sequence").

**Architect check pending: these fixes were not reviewed by a later pass.** The coordinator checks them as solution architect before integration (governance "Architect check of unreviewed fixes").

- Finding 1 (migration and events): `1e629e3e`, the up migration touches each worker whose unrecorded processes predate it; design decision 7 and the postgres-state scenario "Unrecorded processes predate the migration".
- Finding 2 (efficiency): `a9df1043`, the item read before the body runs in a read-only snapshot of the view sources, and a reconciliation source hands the item its last item read found to the answer that follows, so an answer derives it once; design decisions 1 and 6. The source port and product ports section 4.3 are unchanged.
- Finding 3 (conflict reasons): `45caab12`, `idempotency-key-reused` and `already-answered` on both adapters of each port, checked by the conformance cases; design decision 2.
- Finding 4 (native race): `6679d534`, a PostgreSQL race of two identical native answers over the composed native source.
- Finding 5 (down order): `f5ee5fa5`, the down step also checks the other two tables and both functions.
- Finding 6 (naming): `9fbfd484`, `ReconciliationQueueReads` renamed `ReconciliationRecordReads`, since the suggested `ReconciliationReads` already names the source's reads.
- Finding 7 (decision 2 wording): `fdb1e8d1`.
- Finding 8 (tasks): `9d412f9b` ticks tasks 6.1, 6.2, and 6.3.
- Coordinator decisions of 2026-11-03 (Niki) after pass 2: `9d412f9b`, design "Coordinator decisions": the one-time publication of the already-closed reconciliation items as the projector first projects each card after the deploy, accepted; and the `unrecorded-process` touch that reads every unacknowledged process, kept until scale shows a problem and added to the G6 follow-up next to 15a's worker-touch narrowing.
- The fixes changed the diff, so `8ee523ba` deleted the route of `2066e0d5` and `8173a7e3` routed again at head `8ee523ba` (unedited; tier `elevated`, 52 files and 2716 lines, triggers lines, files, capabilities, contracts, and size; recommended effort high for passes 1 and 2, advisory).

Fail-before of the fixes, logs in the session scratchpad:

- `fb-15b-p2-1.log` (finding 1): the new migration test at `45caab12`, before the migration's backfill: 1 of 2 fails, no touch for the earlier processes.
- `fb-15b-p2-2.log` (finding 2): the new service and source tests at `9fbfd484`: 2 of 19 fail, the item read in a transaction and the item derived twice.
- `fb-15b-p2-3.log` (finding 3): the conformance cases with the reason check at `1b68d5f5`: 2 of 4 fail on the in-memory adapters and 2 of 4 on the PostgreSQL adapters.
- `fb-15b-p2-5.log` (finding 5): the extended down step at `1e629e3e` with a down migration that keeps `reconciliation_item_projections`: 1 of 1 fails; the mutation was reverted.
- Findings 4, 6, 7, and 8 change no behaviour: a test, a name, and records.

The `make verify` of the fixes (`verify-15b-p2.log`), at head `718e5094`, passed on the first run on the tree `c5741cfc` (tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.71% branches, 98.85% functions); it is the run that `make record` records, and the commit that records it changes no checked input other than this file.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`); Docker 29.5.2 for the services of `make verify` and of the targeted PostgreSQL runs (`scripts/services.sh run taskelith-answers-dev`).

## Fail-before

Logs in the session scratchpad (`fb-15b-*.log`). Each mutation was applied to one source at the head named in its log, built with `npm run build` (a failed build stops the run, so no stale `dist` is tested), run against the named tests, and reverted.

- `fb-15b-base-unit.log`: the unit tests of `78e4ccee` against the sources of `579fabb1`, with every workspace's `dist` removed and rebuilt: tests 90, pass 83, fail 7; the three new control-plane suites and the new Execution suite fail to load (no `InboxAnswers`, `ReconciliationSource`, or `InMemoryInboxAnswerKeys`), and the served-operations test, the `sourceIn` transaction test, and the native source's item read test fail.
- `fb-15b-base-integration.log`: the PostgreSQL tests of `78e4ccee` against the same sources: tests 111, pass 46, fail 65; the new suites fail to load, and every suite that truncates the test tables fails on the missing `inbox_answer_keys`.
- `fb-15b-head-both.log` at `9c62d07a`: the same PostgreSQL tests pass, 115 of 115.
- `fb-15b-mutation-skip-key-check.log` (`inbox-answers.ts`, a held key ignored): 3 of 105 fail.
- `fb-15b-mutation-digest-without-responder.log` (`answerInput` without the responder): 2 of 105 fail.
- `fb-15b-mutation-no-redaction.log` (`reconciliation-source.ts`, the reason not redacted): 1 of 105 fails.
- `fb-15b-mutation-native-scope.log` (`native-request-source.ts`, every item in scope): 1 of 105 fails.
- `fb-15b-mutation-unbound-timeline.log` (`composition/session-timeline.ts`, `sourceIn` with the unbound timeline): 1 of 105 fails.
- `fb-15b-mutation-no-item-role.log` (`inbox-answer-api.ts`, the item's role not authorized): 1 of 105 fails.
- `fb-15b-mutation-closed-as-open.log` (`reconciliation-source.ts`, an ended execution's item open): 1 of 105 fails.
- `fb-15b-mutation-record-any-item.log` (`in-memory-inbox-answers.ts`, any item recorded): 1 of 105 fails, the conformance case.
- `fb-15b-mutation-processes-unsorted.log` (`in-memory-reconciliation.ts`, the processes in reverse order): 1 of 105 fails, the conformance case.
- `fb-15b-mutation-no-release.log` (`reconciliation-resolution.ts`, no reservation released): 1 of 115 fails.
- `fb-15b-mutation-no-immutable-trigger.log` (the migration without its trigger): 1 of 115 fails, the migration test.
- `fb-15b-mutation-pg-key-not-unique.log` (the migration without the key's primary key): 5 of 115 fail.
- The generation check and the unknown check of the resolver survived at `9c62d07a`: the source derives its item from the task in the same transaction, so no answer reaches them. `20817b52` calls the resolver with a stale item; at `20817b52`, `fb-15b-mutation-no-generation-check.log` and `fb-15b-mutation-resolver-no-unknown-check.log`: 1 of 116 fails each, that test; the surviving run's log at `9c62d07a` was replaced by the first.
- The first attempts at `skip-key-check`, `closed-as-open`, and `record-any-item` failed the build and ran nothing, and a mutation of the PostgreSQL adapter's record guard failed the build twice and was dropped, since the in-memory mutation covers the shared conformance case; their logs were discarded.
- At `f8da7ac4`: `fb-15b-mutation-record-failure-ignored.log` (`reconciliation-resolution.ts`, a failed record ignored): 1 of 111 fails, the resolver's record test; `fb-15b-mutation-handler-without-principal-check.log` (`inbox-answer-api.ts`, an anonymous caller authorized as a principal): 1 of 111 fails, the handler's anonymous test. A first attempt at the second failed the build; its log was discarded.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c5741cfcd26900cd0286450c956cd3208cb7da6c`; tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.71% branches, 98.85% functions.
- `npm run openspec -- validate answer-inbox-items --strict`: passed, `Change 'answer-inbox-items' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 108 file(s); every pass summary file is valid: 88 file(s); every route file is valid: 41 file(s).`.
- Spec diff against the merge base `1c75f149484f` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a221-d5d0-7172-8ad0-1f95cc21f513` | 0 | 1 | 4 | 1 |
| 2 | B | `claude claude-fable-5-1#medium` | `9f964100-5197-4275-b912-82f36763342f` | 0 | 0 | 0 | 8 |
<!-- make record: end -->

## Limitations

- Until item 25 registers cards, the reconciliation source lists no unknown execution in a running installation; unrecorded processes, which name no card, are listed (design "Context").
- The resolver's generation and unknown rechecks are reached only by a direct call, since the source derives its item in the same transaction (section "Fail-before").
- A resolved execution sends the worker no command of its own (design "Risks / Trade-offs").
- The digest names the responder, so another principal that repeats a key gets `idempotency-key-reused` (design decision 2).
- A key repeated by another principal is refused, never replayed: the key is scoped to its item and the responder is in the digest (coordinator Q2).
- Before item 25, the card projector publishes no project reconciliation item, since none is listed (coordinator Q3).
- After the deploy, each card's already-closed reconciliation items are published once as the projector first projects the card, and each `unrecorded-process` touch reads every unacknowledged process (coordinator decisions after pass 2).
- Review passes 1 and 2 ran; the pass 2 fixes await the coordinator's architect check. No deployment or browser check was made (backend only).

## Remaining gates

- The coordinator's architect check of the pass 2 fixes.
- The archive of the change, and integration into dev by the coordinator (single pull request).
