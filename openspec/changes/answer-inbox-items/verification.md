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

- `make verify`: passed, profile full, tree `d36af11a1f0d3dfb6a533d59147c233fea057a4e`; tests 4592, pass 4583, fail 0, skipped 9; all files 99.43% lines, 92.75% branches, 98.83% functions.
- `npm run openspec -- validate answer-inbox-items --strict`: passed, `Change 'answer-inbox-items' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 108 file(s); every pass summary file is valid: 88 file(s); every route file is valid: 41 file(s).`.
- Spec diff against the merge base `1c75f149484f` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- Until item 25 registers cards, the reconciliation source lists no unknown execution in a running installation; unrecorded processes, which name no card, are listed (design "Context").
- The resolver's generation and unknown rechecks are reached only by a direct call, since the source derives its item in the same transaction (section "Fail-before").
- A resolved execution sends the worker no command of its own (design "Risks / Trade-offs").
- The digest names the responder, so another principal that repeats a key gets `idempotency-key-reused` (design decision 2).
- No review pass ran yet; no deployment or browser check was made (backend only).

## Remaining gates

- Review passes by the brief's reviewers, their fixes, and their records.
- The archive of the change, and integration into dev by the coordinator (single pull request).
