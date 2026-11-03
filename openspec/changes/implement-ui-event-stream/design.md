## Context

G3 item 14 ([G3 work plan](/docs/g3-plan.md), row 14) implements the event streams of sub-change 9a: `streamProjectEvents` (`GET /projects/{projectId}/events`) and `streamInstallationEvents` (`GET /events`) of `packages/contracts/documents/control-plane.openapi.json`, and the rules of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 10 (frames, positions, cursor, resync, slow consumers, authorization, role change, payloads). Item 13 (`implement-agent-session-timeline` and its sub-changes) built the session timeline whose changes the project stream reports, and its views stamp a position through the `ViewPositions` port, `0` until this item. Item 10 built the login sessions and roles; `apps/control-plane/src/api/access-requirements.ts` already names the rules of both operations (`PROJECT_READ`, `OWNER`).

**Goals.** Both streams as the document and section 10 define them; positions assigned after commit, in commit order, from one installation-wide sequence; a durable cursor with catch-up and resync; streams that end on a role change and with their login session; bounded buffers; a retention window with a floor; real view positions.

**Non-goals.** The emitters of `card-changed` and `board-changed` (item 15); the durable output snapshot (14b); SPA screens; new operations.

## Sources

- Control-plane wire contracts section 10 and section 3 (roles); `control-plane.openapi.json` `ProjectEvent`, `InstallationEvent`, and the event schemas.
- Architecture section 11 and R14.
- [Session timeline contract](/docs/contracts/session-timeline.md) sections 5.1 and 7.
- The archived changes `implement-project-setup` (route, record, and test patterns) and `serve-web-spa-from-control-plane` (the browser endpoint).

## Decisions

### 1. Event records and the publishing port

`@taskelith/execution` owns `UiEventRecord`, one variant per event type of section 10 as the module holds its records (`ports/ui-events.ts`): `board-changed` (`workersOnline`), `card-changed` (a `BoardCard`), `inbox-item-changed` (a `NeedsYouItem`), `agent-session-changed` (the card's `SessionScope` and a `SessionSummary`: the session without its turn, request, and output records, with their counts and the output window's bounds), `turn-changed`, `native-request-changed` (with its place from 1), and `output-appended`. An event is a record with its scope, a project or the installation, and its time. The publishing port `UiEventOutbox.append` is part of the transaction of a change: an event commits or rolls back with what it reports. The control plane maps a record to its wire schema only when it sends it (decision 7), so the module never depends on the wire.

### 2. Session events

`SessionTimelineService` appends the events of each change in the transaction that writes it (`application/session-events.ts`): the session's `agent-session-changed` when it opens or its native session, attempts, generations, limit, or handoff change; a `turn-changed` per new or changed turn; a `native-request-changed` per new or changed request; an `output-appended` per released entry beyond the previous last position, so a held tail publishes nothing until it is released; and the `inbox-item-changed` of each item a request opens or settles, also an acknowledgement answered through `NativeRequestSource`. A session without a scope, whose task no card holds, publishes nothing. The item's record is the one `NativeRequestSource` returns (`nativeRequestItem`, moved out of the source), so the event and the inbox read agree.

### 3. The event log and its positions (Q3)

`UiEventLog` (`ports/ui-event-log.ts`) holds committed entries: events and the principal changes of decision 5. A writer's transaction inserts its entries without a position into `ui_events` and, once per transaction, `pg_notify`s `taskelith_ui_events_appended`. One assigner numbers committed entries afterwards: it locks the `ui_event_sequence` row, numbers the unnumbered rows it sees in `entry_id` order from the head plus one, raises the head, and notifies `taskelith_ui_events_numbered` with the new head, all in one READ COMMITTED transaction. Since every numbering holds the row lock and reads after it, a row committed after a numbering is numbered by a later one: positions follow commit order, have no gap in the sequence, and are never reused. An uncommitted row is invisible, so no position names an uncommitted change; a row committed before a crash and not yet numbered is numbered by the next run, once (crash point `EventNumberingCommit.before/after`, and `SessionTimelineCommit.after` of the writer). The control plane runs the assigner in a `WakeableLoop` woken by the appended notification and polling every `1s`; a lost LISTEN connection is reopened on the next run. Streams of every process wake on the numbered notification and on each run.

### 4. Streams (wire section 10)

`EventStreamHub` (`apps/control-plane/src/application/event-stream-hub.ts`) opens a stream in four steps: read the log's bounds `H0`, check the role again, evaluate the cursor, and register the stream. The bounds come first, so a role change after the check has a position above `H0` and ends the stream. Without a cursor the stream starts at `H0`; a cursor below the floor answers `resync` `cursor-expired`, one beyond the head `cursor-unknown`; a resync is one frame, then the end, with status 200. A registered stream pulls: it reads the bounds, then at most `500` entries of its filter after its cursor and up to the head, then the bounds again, so a floor raised past its cursor during the read answers `cursor-expired` instead of a silent gap; it sends each event, moves its cursor, and once a read returns fewer than a page, moves its cursor to the head. A wake during a read runs one more read. Keep-alive comments every `15s` and the login expiry run on an injected `Scheduler`, so tests drive them without sleeps.

### 5. Ends: role change and login (Q4)

`Access` records a `PrincipalChange` in the transaction of the change, behind `AccessTransaction.changes`: `roles-changed` with the project for an assignment or removal that changed a role, without one for the first `installation-owner`; `sessions-ended` for a logout, a new password that ended sessions, and a login over a logged-in session, whose rotation ends it. In PostgreSQL the change is a row of `ui_events` of kind `principal-change` (a deliberate cross-module write into one table, so one sequence orders it with the events); the in-memory store hands committed changes to a sink. A stream reads its principal's changes with its events and applies only those above `H0`: `roles-changed` of its project, or without a project, sends `stream-ended` `role-changed` and ends it; `sessions-ended` makes a browser stream read its login session again (`SessionService.liveUntil`, which renews nothing), and a session no longer live ends the stream without a frame. A browser stream also arms a timer at its login's expiry and checks it again then, so an idle expiry ends it too; the timer only re-reads the session, which decides. A bearer stream has no login session.

### 6. Retention (Q5)

`EventLogKeeper.prune` removes, every `60s`, at most `10,000` entries numbered before now minus the window, oldest first, and raises the stored floor to the highest removed position under the sequence row lock. The window is `DEFAULT_EVENT_RETENTION_HOURS`, 24, unless `TASKELITH_EVENT_RETENTION_HOURS` sets a positive whole number of hours. A cursor below the floor gets the documented resync.

### 7. HTTP and wire mapping

The routes answer `event-stream`: the handler returns a `StreamAnswer`, and the server writes `200`, `content-type: text/event-stream`, `cache-control: no-store`, and the correlation header, then attaches the stream. `Last-Event-ID` wins over `after`; each, when present, must match `EventPosition`, or the request answers 400; a position above the safe integers is beyond any head. `streamProjectEvents` answers 404 for an unknown project, which only an `installation-owner` reaches past the role check. Each event frame is `id: <position>`, `event: <type>`, and one `data:` line of the event mapped by `event-stream-wire.ts` with the read mappers of section 9 (`agentSessionBody` now takes the `SessionSummary`), validated against `ProjectEvent` or `InstallationEvent`; an event that breaks its schema is logged and skipped. A `resync` or `stream-ended` frame has no `id`; a keep-alive is the comment `: keep-alive`. The response's unsent bytes are bounded at `1 MiB`: past it the stream is dropped (the socket destroyed), otherwise its last frame is flushed before the end.

### 8. View positions

`LogViewPositions` answers the log's head, which an agent session read stamps before it reads, so every entry at or below the stamp is in the view; an entry committed but not yet numbered gets a higher position and may be sent again, which section 10 allows (the client skips an event not above its view).

## Coordinator decisions

Niki, 2026-11-03, on the brief's questions:

- Q1: one change; propose a split before going past about 60 files or 5000 lines. The change ends at about 70 files with its records and under 5000 lines, because it already leaves out the brief's 14b, the durable snapshot of older output, which needs an operation the document does not have; the split of Q1 is therefore the scope of this change, and the report names it.
- Q2: this change ships the publishing port and the `card-changed` and `board-changed` event types; item 15 emits them.
- Q3: a transactional outbox and one position assigner after commit, woken by LISTEN/NOTIFY with a fallback poll, and a crash-point test between commit and numbering (decision 3).
- Q4: Access records role changes and logouts in the transaction of the change, and the hub ends the affected streams from that record; no timer-only expiry (decision 5).
- Q5: a 24 h window as a named, configurable setting, pruned by a job that raises the stored floor; a cursor below it gets the resync (decision 6).
- Migration timestamp `1792933900000`; `1792933600000` (12f) and `1792933700000` (20e) stay unused.

## Follow-ups

- 14b: the durable snapshot of output older than the retained window, with its own operation.
- Item 15 emits `card-changed` and `board-changed`, and the `card-changed` of an item that counts toward a card.

## Test plan

- Execution (in-memory): the log's conformance cases (numbering from 1 in commit order, once, within the limit; the read filter, upper bound, and limit; pruning and the floor); the session events of a running turn, a request and its answer, held and released output, a repeat, a failure, an unscoped session, and an acknowledgement through the source.
- Access: each principal change recorded with its change and none for a refused or empty command or a rolled-back transaction; `liveUntil` without renewal.
- PostgreSQL (`make test`): the conformance cases; positions in commit order against insertion order; no entry after a rollback and no gap under concurrent numberings; Access role changes in the log; the notifications; the migration's checks and down migration; crash points `SessionTimelineCommit.before/after` and `EventNumberingCommit.before/after`.
- Control plane: the hub (head start, scope filter, paging, resume, resync at open and when the floor passes a cursor, role-change ends of project and installation streams, changes before the open, a login that ends, expires, renews, or cannot be read, keep-alive, overflow, wake coalescing, detach, a failed open); the assigner, pruning, view positions, and the loop; HTTP over the in-memory stores (headers and frames, the session events against `ProjectEvent`, `Last-Event-ID` over `after`, reconnect, both resyncs, 400, 401, 403, 404, the installation stream, role change, logout, the buffer bound, a skipped invalid event); settings; the composition over PostgreSQL (a role change ends a project stream through the assigner).
- Coverage: the new files reach at least 75% of lines, branches, and functions under `make verify`.

## Review checklist

The brief's checklist (`checklist.json`, dev `26bbb10f`, size L) ranks contract-drift, missing-fail-before-test, naming, spec-wording, docs, error-handling, and concurrency-race; for records evidence-mismatch, spec-wording, docs, stale-citation, contract-drift, process, and missing-fail-before-test. How this change meets them: every event frame is validated against its stream's schema before it is sent, the routes' schemes and query parameters are checked against the document, and no contract changes (contract-drift); `verification.md` records the tests failing against the base and against named mutations (missing-fail-before-test); one term per concept, `event`, `entry`, `position`, `cursor`, `floor`, `head` (naming); a read failure keeps a stream open for the next wake, a login that cannot be read ends it, and a defective event is logged and skipped (error-handling); numbering serializes on one row lock and the tests hold transactions open with gates, not sleeps (concurrency-race); citations name files and sections, not lines (stale-citation).

## Risks / Trade-offs

- A change committed before a stream opens but numbered after its bounds read can end a new stream once (a role change) or make it re-read its login; the client reconnects, so the error is on the safe side.
- Every stream reads the log's bounds on each wake, at least once a second; the cost grows with open streams, which G6 measures.
- The in-memory log is a test adapter; production runs PostgreSQL only.
- An inbox item whose subject lacks an attempt breaks `NativeRequestInboxSubject` and is skipped as a defective event; item 13 binds an attempt before any request, so none is expected.
