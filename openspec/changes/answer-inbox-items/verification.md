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

- `make verify`: passed, profile full, tree `0f46f206e1349d2a5bc2a74e154e2d78a178152d`; tests 4606, pass 4597, fail 0, skipped 9; all files 99.43% lines, 92.71% branches, 98.85% functions.
- `npm run openspec -- validate answer-inbox-items --strict`: passed, `Change 'answer-inbox-items' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 108 file(s); every pass summary file is valid: 88 file(s); every route file is valid: 41 file(s).`.
- Spec diff against the merge base `1c75f149484f` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a221-d5d0-7172-8ad0-1f95cc21f513` | 0 | 1 | 4 | 1 |
<!-- make record: end -->

## Limitations

- Until item 25 registers cards, the reconciliation source lists no unknown execution in a running installation; unrecorded processes, which name no card, are listed (design "Context").
- The resolver's generation and unknown rechecks are reached only by a direct call, since the source derives its item in the same transaction (section "Fail-before").
- A resolved execution sends the worker no command of its own (design "Risks / Trade-offs").
- The digest names the responder, so another principal that repeats a key gets `idempotency-key-reused` (design decision 2).
- A key repeated by another principal is refused, never replayed: the key is scoped to its item and the responder is in the digest (coordinator Q2).
- Before item 25, the card projector publishes no project reconciliation item, since none is listed (coordinator Q3).
- Review pass 1 ran; no deployment or browser check was made (backend only).

## Remaining gates

- Review pass 2 of the pass 1 fixes, and pass 3 if pass 2 reports a Medium or worse finding, with their fixes and records.
- The archive of the change, and integration into dev by the coordinator (single pull request).
