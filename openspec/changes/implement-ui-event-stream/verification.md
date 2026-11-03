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
- Pass 1 fixes (section "Review pass 1"): `80f2c5f6` (H2), `317415bc` (M5), `25fd5bd1` (M3), `503e1028` (M4), `07a93bab` (H1), then the records (`c4a3f7e2`); the fixes changed the diff, so `43e31f66` deleted the fifth `route.json` and `29ec0b7f` routed a sixth time (unedited; tier `elevated` as before, 62 files and 3634 lines), then the `make verify` of the fixed tree.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test` and of the targeted PostgreSQL runs, each through `scripts/docker-slot.ts run`.

## Author self-check

- Size (coordinator decision, 2026-11-03): accepted as one change. At `634b3beb` the diff against the merge base had 61 files outside `openspec/` (+3078/−125 lines) and 74 files with the records (+3593/−125), under 5000 lines; the tests of `b3c30f8a` add 54 lines to two of those files.
- Scope: no change under `packages/contracts`; both operations existed in `control-plane.openapi.json`, and `ACCESS_REQUIREMENTS` already named their rules; no dependency changed (`package-lock.json` and every `package.json` unchanged); no new operation was needed. The durable output snapshot would need one, so it is left to 14b (design, "Follow-ups").
- Hexagonal boundaries: the module owns the records and ports (`UiEventOutbox`, `UiEventLog`, `PrincipalChanges`), with conformance cases that the in-memory and PostgreSQL adapters pass; the control plane maps records to the wire only when it sends them; `npm run check:boundaries` passes in `make verify`.
- Migration: `1792933900000` as the brief names; `1792933600000` (12f) and `1792933700000` (20e) stay unused.
- Spec deltas: `control-plane-api` adds "Event streams" (385 characters), "Event stream cursor" (310), "Event stream ends" (328), "Event retention window" (276), and "View position from the event log" (168), and removes "View position before the event stream" with its reason and migration; `postgres-state` adds "Event log tables" (421 after the pass 1 fix of H1); `session-turn-model` adds "Session events in the change's transaction" (334); `trust-and-operational-foundation` adds "Principal changes recorded" (323). `npm run verify:archive` archives them into strictly valid specs.
- Comments: `npm run verify:comments` passes. `docs/operational-targets.md` gains one provisional row for the values the code comments cite.
- Coverage of the new files (`verify-14-6.log`, lines, branches, functions): `event-stream-hub.js` 98.65, 93.07, 96.97; `event-log-keeper.js` 100, 96.30, 100; `event-stream-api.js` 100, 90.48, 100; `event-stream-wire.js` 94.03, 80.00, 100; `ui-event-repositories.js` 100, 100, 100; `ui-event-notifications.js` 100, 100, 80.00; `in-memory-ui-event-log.js` 90.54, 100, 94.44; `session-events.js` 100, 96.30, 100; `native-request-items.js` 100, 81.25, 100; `session-views.js`, `ui-events.js`, `ui-event-log.js`, `principal-change.js` 100 each; `ui-event-log-conformance.js` 100, 94.44, 100. Two touched files stay below 75% branches as at the base, both raised: `agent-session-wire.js` 73.08 (71.70 in `verify-11a-4.log`) and `native-request-source.js` 73.02 (70.15).

## Evidence check

- `verify-14-p1.log` (scratchpad), after the pass 1 fixes: `make verify: passed, profile full, tree e2ffbd521ea4a1194a3f7487c44918cb311110f9`, the tree of the commit that records the sixth route, clean; tests 4385, pass 4376, fail 0, skipped 9; all files 99.40% lines, 92.67% branches, 98.86% functions; no rerun. Its new files: `event-stream-hub.js` 100, 94.44, 97.06; `event-stream-api.js` 100, 92.16, 100; `event-log-keeper.js` 100, 96.55, 100; `ui-event-notifications.js` 97.00, 97.22, 85.71; `ui-event-repositories.js` 100, 100, 100. The generated block below is written from it by `make record`; `make record-check` passes.
- Superseded by it: `verify-14-6.log` (passed on the tree `a10bffd…` of `50eb65d1`, before pass 1).
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

## Review pass 1

- Reviewer: role A, Codex CLI `gpt-6-astra`, effort medium (`codex`, `gpt-6-astra`, `medium`), session `01a1a05d-9a59-7f03-bfa4-ad152fe1020d`, run by the coordinator as worker step 5 assigns; the reviewed snapshot is `26bbb10f..c1612367`. The report (`review-14-p1-report.md` in the scratchpad) names that range and reports its own read-only run of 31 unit tests.
- Findings: Critical 0, High 2, Medium 3, Low 0, as its `passes.jsonl` line and the five `findings.jsonl` lines record. The worker kept no other line of the report.

### Pass 1 fixes

Each fix has a test that fails before it; the logs are in the scratchpad. Pass 2 reviews these fixes.

- **H1, numbering order within a batch** (`07a93bab`, `postgres-state`). The coordinator decided (2026-11-03) against a writer lock held from insert to commit, which would serialize slow writers: each `ui_events` row stores `inserted_by xid8 DEFAULT pg_current_xact_id()`, and the assigner reads `pg_snapshot_xmin(pg_current_snapshot())` before its row lock and numbers only rows below it, in `entry_id` order. No writer waits; a long open transaction delays numbering for everyone, which design decision 3 and "Risks / Trade-offs" record. Design decision 3, the `postgres-state` delta (now 421 characters, with the scenario "A later inserter commits first"), the proposal, the migration comment, and the port comment say so; the in-memory adapter, which numbers in commit order, meets the port's rule. The PostgreSQL tests that number right after a commit wait for the horizon first (`untilNumberable`), because the cluster's other test files hold transactions. `fb-14-p1-1.log`: the new gated tests against `c1612367`'s adapter and migration fail 2 of 12: "an entry committed while an earlier inserter is open waits for it, ..." (the later commit numbered, 1 instead of 0) and "a long-open transaction delays numbering ..." (1 instead of 0). The case the report names, both commits before the first numbering, passes before and after, because both orders number by insertion; its test pins the rule.
- **H2, delivery before the login check** (`80f2c5f6`, `control-plane-api`). Every login check, the first one included, runs inside the stream's read loop, so nothing is read or delivered until it answers, and one that throws ends the stream. `fb-14-p1-2.log`: three held-check tests fail against `c1612367`'s hub: an event was delivered while the first check was pending, three log reads ran while the expiry check was pending, and a throwing check left an unhandled rejection.
- **M3, a disconnect before attach** (`25fd5bd1`, `control-plane-api`). The answer attaches no stream to a response already destroyed or ended, and the sink refuses frames to a gone response and does not close it again. `fb-14-p1-3.log`: the gated test fails against `c1612367`'s API (one stream, a `15000` ms timer, a log read, and a written frame left); `fb-14-p1-3b.log`: without the sink's check, its second part times out.
- **M4, the LISTEN connection** (`503e1028`, `postgres-state`). Each numbering pass (`numberingPass`) starts `listen` beside its numbering instead of awaiting it; `listen` joins an attempt still opening; the connection and each `LISTEN` get `LISTEN_DEADLINE_MILLISECONDS` (`5s`, in `docs/operational-targets.md`); `close` ends a connection still opening and rejects its pending `connect`, which pg leaves pending when `end` interrupts it. `fb-14-p1-4.log`: the three tests against a server that accepts and never answers time out against `c1612367`'s listener (test timeout 20 s); `fb-14-p1-4b.log`: the pass with `c1612367`'s `await` of `listen` times out.
- **M5, shared test state** (`317415bc`, `control-plane-api`). Each test of `event-stream-routes.test.ts` builds its own stores, log, hub, scheduler, logger, and server and disposes them after it. `fb-14-p1-5.log`: `c1612367`'s file fails 1 under `--test-randomize` seeds 1 and 4 (the session events test counted invalid-event records of other tests). `m5-isolation-14-p1.log`: each of the 11 tests passes alone, and the file passes under seeds 1 to 8; node:test runs a file's tests one at a time, so order is what varies.

## Limitations

- `card-changed` and `board-changed` are typed and mapped but not emitted; item 15 emits them (Q2 and coordinator decision, 2026-11-03); likewise the `card-changed` that section 10 pairs with an item counting toward a card.
- The durable snapshot of output older than the retained window is not served: 14b, a separate change with its own operation, scheduled after item 15 unless item 29's board needs older output first (coordinator decision, 2026-11-03).
- A change committed before a stream's open but numbered after its bounds read can end that new stream once; accepted as the safe direction, since a stream never outlives a role, and the reconnect stays open (coordinator decision, 2026-11-03; design, "Risks / Trade-offs").
- An inbox item whose card subject has no attempt breaks `NativeRequestInboxSubject` and is skipped, logged with its type and violation only, and the stream goes on (coordinator decision, 2026-11-03).
- Pass 1 ran; its fixes are not yet reviewed (pass 2 reviews them). No deployment or browser check was made (backend only).
- Positions follow insertion order among ended transactions, not strict commit order, while wire contracts section 10 still says commit order; whether section 10 needs new wording is open for the coordinator (design, "Risks / Trade-offs").

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `e2ffbd521ea4a1194a3f7487c44918cb311110f9`; tests 4385, pass 4376, fail 0, skipped 9; all files 99.40% lines, 92.67% branches, 98.86% functions.
- `npm run openspec -- validate implement-ui-event-stream --strict`: passed, `Change 'implement-ui-event-stream' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 104 file(s); every pass summary file is valid: 84 file(s); every route file is valid: 37 file(s).`.
- Spec diff against the merge base `26bbb10fecea` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a05d-9a59-7f03-bfa4-ad152fe1020d` | 0 | 2 | 3 | 0 |
<!-- make record: end -->

## Remaining gates

- Independent review: pass 2 by reviewer B, which reviews the pass 1 fixes, and pass 3 only as governance "Review sequence" requires.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
