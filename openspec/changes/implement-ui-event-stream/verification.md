# Verification: implement-ui-event-stream

## Scope and source

G3 item 14 (`docs/g3-plan.md`, row 14), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `26bbb10f` (#427), under the coordinator decisions Q1 to Q5 of 2026-11-03 (design, "Coordinator decisions"): the event records and publishing port, the event log with conformance cases, the session timeline's events, the principal changes of `Access`, migration `1792933900000_ui-event-stream.sql`, the assigner, pruning, and both streams `streamProjectEvents` and `streamInstallationEvents` with their cursor, resync, ends, and buffer bound, and the view position from the event log. Out of scope and untouched: the emitters of `card-changed` and `board-changed`, which item 15 emits (Q2 and coordinator decision, 2026-11-03), the durable output snapshot (14b, a separate change after item 15), SPA screens, and any operation or contract change.

Commit type: `packages/modules/*`, `packages/adapters/postgres`, and `apps/control-plane` are private workspaces that the published `taskelith` package does not ship, so every commit uses `chore`, `test`, or `docs`.

## Revision

- Base: `dev` `26bbb10fecea4040ca7fd9ad780f4ffb5960edc2`, the checklist base and the merge base with `origin/dev`.
- `b30ab142` `chore: start the implement-ui-event-stream change`: `.openspec.yaml`, `checklist.json` saved with the brief's invocation `--save implement-ui-event-stream --at 26bbb10fecea4040ca7fd9ad780f4ffb5960edc2 --size L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `4492d494` `test: ...`: the tests alone, the base of the fail-before run; `e7591535` `chore: ...`: the modules, the adapter, the migration, and the control plane; `1161bfe7` `docs: ...`: proposal, design, spec deltas, tasks, and this record's skeleton; `d9c05f28` `test: ...`: the floor raised during a read.
- `1ae2244d` routed at head `d9c05f28`. Its `make verify` (`verify-14-1.log`) failed `verify:comments` on two three-line comments of the PostgreSQL adapter, so `8c0647b6` shortened them, which changed the diff: `8aad695b` deleted that `route.json` and `58fda845` routed again. Its `make verify` (`verify-14-2.log`) had `ui-event-notifications.js` at 57.14% functions, so `3786d992` and later `1a2c7662` added listener tests, each changing the diff, so `5f16fb53` and `abee9296` deleted the route and `eeaf5509` and `6c762264` routed again (`verify-14-4.log` passed with 73.33% functions in that file, superseded). `6c762264`, unedited: "route: elevated (lines, files, capabilities, size), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated, agrees. Recommendation only: the brief routes effort medium.
- `634b3beb` recorded the `make verify` of the tree of `6c762264` (`verify-14-5.log`).
- Coordinator decisions of 2026-11-03 on the implemented change (design, "Coordinator decisions"): `b3c30f8a` `test: ...` adds the HTTP test of an inbox item without an attempt and the hub test of the reconnect after an early role change; `7911842c` `docs: ...` records the decisions in `design.md` and names the change in the provisional row of `docs/operational-targets.md`. The tests changed the diff, so `5815f302` deleted the route of `6c762264` and `50eb65d1` routed again, unedited: "route: elevated (lines, files, capabilities, size), rule version 5", the same reviewers and shadow agreement as before.
- The commit after this one records the `make verify` of the tree of `50eb65d1`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test` and of the targeted PostgreSQL runs, each through `scripts/docker-slot.ts run`.

## Author self-check

- Size (coordinator decision, 2026-11-03): accepted as one change. At `634b3beb` the diff against the merge base had 61 files outside `openspec/` (+3078/−125 lines) and 74 files with the records (+3593/−125), under 5000 lines; the tests of `b3c30f8a` add 54 lines to two of those files.
- Scope: no change under `packages/contracts`; both operations existed in `control-plane.openapi.json`, and `ACCESS_REQUIREMENTS` already named their rules; no dependency changed (`package-lock.json` and every `package.json` unchanged); no new operation was needed. The durable output snapshot would need one, so it is left to 14b (design, "Follow-ups").
- Hexagonal boundaries: the module owns the records and ports (`UiEventOutbox`, `UiEventLog`, `PrincipalChanges`), with conformance cases that the in-memory and PostgreSQL adapters pass; the control plane maps records to the wire only when it sends them; `npm run check:boundaries` passes in `make verify`.
- Migration: `1792933900000` as the brief names; `1792933600000` (12f) and `1792933700000` (20e) stay unused.
- Spec deltas: `control-plane-api` adds "Event streams" (385 characters), "Event stream cursor" (310), "Event stream ends" (328), "Event retention window" (276), and "View position from the event log" (168), and removes "View position before the event stream" with its reason and migration; `postgres-state` adds "Event log tables" (352); `session-turn-model` adds "Session events in the change's transaction" (334); `trust-and-operational-foundation` adds "Principal changes recorded" (323). `npm run verify:archive` archives them into strictly valid specs.
- Comments: `npm run verify:comments` passes. `docs/operational-targets.md` gains one provisional row for the values the code comments cite.
- Coverage of the new files (`verify-14-6.log`, lines, branches, functions): `event-stream-hub.js` 98.65, 93.07, 96.97; `event-log-keeper.js` 100, 96.30, 100; `event-stream-api.js` 100, 90.48, 100; `event-stream-wire.js` 94.03, 80.00, 100; `ui-event-repositories.js` 100, 100, 100; `ui-event-notifications.js` 100, 100, 80.00; `in-memory-ui-event-log.js` 90.54, 100, 94.44; `session-events.js` 100, 96.30, 100; `native-request-items.js` 100, 81.25, 100; `session-views.js`, `ui-events.js`, `ui-event-log.js`, `principal-change.js` 100 each; `ui-event-log-conformance.js` 100, 94.44, 100. Two touched files stay below 75% branches as at the base, both raised: `agent-session-wire.js` 73.08 (71.70 in `verify-11a-4.log`) and `native-request-source.js` 73.02 (70.15).

## Evidence check

- `verify-14-6.log` (scratchpad): `make verify: passed, profile full, tree a10bffd925687b6c1f716f1c96997bb5825bfc73`, the tree of `50eb65d1`, clean; tests 4374, pass 4365, fail 0, skipped 9; all files 99.39% lines, 92.63% branches, 98.85% functions; no rerun. The generated block below is written from it by `make record`; `make record-check` passes.
- Superseded: `verify-14-1.log` (comment rule), `verify-14-2.log` (tree `3ee1085…` of `58fda845`: one timing failure outside the change, `test/installation-script.test.ts` "a bound with a leading zero is read in base 10", "ended after 9.113s, before 10"), `verify-14-3.log` (the one rerun on the same tree: passed, tests 4370, fail 0), `verify-14-4.log` (passed on the tree of `eeaf5509`, superseded by the listener test), and `verify-14-5.log` (passed on the tree `cace440d…` of `6c762264`, tests 4372, fail 0, superseded by the tests of `b3c30f8a`).

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/72320a31-29ec-4dad-bb0b-5d2fa342f935/scratchpad/`).

- Base (`fb-14-base-unit.log`, `fb-14-base-postgres.log`): the tests of `4492d494` against the sources of `b30ab142` (the files of `e7591535` outside the tests removed or checked out from `b30ab142`, then `npm run build`), then restored and rebuilt (`git status` clean). Unit (execution, access, and the control plane's unit tests): tests 643, pass 630, fail 13; among them every principal change test, `liveUntil`, the retention setting, the served-operation list, and `session-events.test.ts`, `repository-conformance.test.ts`, `event-stream-hub.test.ts`, `event-log-keeper.test.ts`, and `event-stream-routes.test.ts`, which fail to load on the missing exports. PostgreSQL (`ui-event-log`, `session-timeline-crash`, `migrations`, `session-inbox`): tests 77, pass 30, fail 47, the new log, crash-point, and migration tests, and the fixtures that truncate `ui_events`, which at the base show only that the table is missing; the mutations below show the guards themselves.
- Each guard broken on the implementation, one at a time, then restored and rebuilt (the mutation, its diff, and the output at the top of each log); a stream that should end and does not runs into `--test-timeout=30000`:
  - `fb-14-hub-opened-at.log`: role changes at or before the open applied: fail 1, "a role change of another project or principal, or one before the open, leaves the stream open".
  - `fb-14-hub-floor-recheck.log`: the floor check after the read removed: "a floor raised past the cursor during a read sends cursor-expired instead of what the read returned" times out.
  - `fb-14-hub-role-end.log`: role changes ignored: the project, installation, and HTTP role-change tests time out (3).
  - `fb-14-hub-sessions-ended.log`: `sessions-ended` ignored: fail "a logout ends the browser's streams without a frame, and a bearer stream goes on", and the hub test times out.
  - `fb-14-sink-overflow.log`: the buffer bound removed: the buffer test times out.
  - `fb-14-cursor-priority.log`: `after` over `Last-Event-ID`: fail 1, "Last-Event-ID wins over after, ...".
  - `fb-14-access-logout.log`: a logout that records no change: fail 2, the module's and the HTTP logout tests.
  - `fb-14-session-output-held.log`: every output entry published again: fail 1, "output publishes only released entries ...".
  - `fb-14-pg-no-lock.log`: numbering without `FOR UPDATE`: fail 1, "... concurrent numberings give each committed entry one position without gaps".
  - `fb-14-pg-prune-floor.log`: pruning that keeps the floor: fail 1, the PostgreSQL conformance case of the floor.
  - `fb-14-inbox-no-attempt.log` (coordinator decision 4): the HTTP test "an inbox item without an attempt is skipped, logged by identifiers only, and the next event still arrives", against three mutations: the invalid event's data added to the log line (fail 1, the log fields are not only `type` and `violation`); the invalid inbox event sent anyway (fail 1, "the item is skipped and the next event arrives"); and item 13 starting a generation without an attempt (fail 1, "item 13 now runs a request without an attempt: revisit the skip of NativeRequestInboxSubject"). The test also fails if `NativeRequestInboxSubject` stops requiring `attemptId`. The current log line already carried only the event type and the schema violation, so no source changed.
  - `fb-14-hub-reconnect.log` (coordinator decision 5): role changes at or before the open applied: fail 1, "a role change committed before the open but numbered after it ends the new stream once, and a reconnect stays open".
  - `fb-14-pg-no-append.log`: an `append` that inserts nothing: fail 9, among them the crash tests "a change killed between its commit and the numbering keeps its events, which the next numbering gives positions once" and "a numbering killed after its commit keeps its positions, and the rerun numbers nothing again".
- `3786d992` and `1a2c7662` cover the listener's failure paths; they guard no new behaviour.

## Limitations

- `card-changed` and `board-changed` are typed and mapped but not emitted; item 15 emits them (Q2 and coordinator decision, 2026-11-03); likewise the `card-changed` that section 10 pairs with an item counting toward a card.
- The durable snapshot of output older than the retained window is not served: 14b, a separate change with its own operation, scheduled after item 15 unless item 29's board needs older output first (coordinator decision, 2026-11-03).
- A change committed before a stream's open but numbered after its bounds read can end that new stream once; accepted as the safe direction, since a stream never outlives a role, and the reconnect stays open (coordinator decision, 2026-11-03; design, "Risks / Trade-offs").
- An inbox item whose card subject has no attempt breaks `NativeRequestInboxSubject` and is skipped, logged with its type and violation only, and the stream goes on (coordinator decision, 2026-11-03).
- No independent review has run; no deployment or browser check was made (backend only).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a10bffd925687b6c1f716f1c96997bb5825bfc73`; tests 4374, pass 4365, fail 0, skipped 9; all files 99.39% lines, 92.63% branches, 98.85% functions.
- `npm run openspec -- validate implement-ui-event-stream --strict`: passed, `Change 'implement-ui-event-stream' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 104 file(s); every pass summary file is valid: 84 file(s); every route file is valid: 37 file(s).`.
- Spec diff against the merge base `26bbb10fecea` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Remaining gates

- Independent review: pass 1 by reviewer A, pass 2 by reviewer B, and pass 3 only as governance "Review sequence" requires.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
