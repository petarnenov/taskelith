# Design: serve-session-timeline-over-http

## Context

Sub-change 13b of G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13), from `dev` `19c15d69`. 13a ([archived design](/openspec/changes/archive/2026-10-29-implement-session-timeline/design.md)) built the domain completion, the `SessionTimelineStore` port with in-memory and PostgreSQL adapters, and `SessionTimelineService` in `@taskelith/execution`; its follow-up list and the coordinator's answers Q1, Q5, Q8, and the architect check of `e355e01f` give 13b:

- the HTTP operations of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 9, behind the role checks of section 3;
- `refused` in the wire `TurnState` with its contract-document update and the breaking-change check (answer Q8);
- output redacted across chunks with a durable held tail (section 7, "Output across chunks"), and the output read that it then allows (answer Q5);
- the native request source that opens the `delivery-acknowledgement` item (section 8.1);
- the digest key's creation at installation bootstrap with mode `0600` through the control-plane namespace code, never logged, and the service's wiring into the control-plane composition;
- the 13a, 13b, and 13c sub-changes and the key-creation note in G3 plan row 13.

What the study found in the code at `19c15d69`:

- **Routes and access.** `apps/control-plane/src/api/routes.ts` serves only the G2 execution operations and the login session; no `control-plane.openapi.json` project operation has a route yet. `access-requirements.ts` already maps all seven section 9 operations: the reads to `PROJECT_READ` (`project-viewer` or above, or `installation-owner`), `submitTurn` and `respondToNativeRequest` to `PROJECT_OPERATOR` (no owner exception), and `api-server.ts` checks a `path-project` rule before the body with `requirementBeforeBody`, the project being the first path parameter. Item 10's order (authenticate, CSRF, role, body) therefore needs no change.
- **Scope.** A session knows only its `taskId`. The project and the card come from Scheduling's `task_lineage` (`TaskLineageLink`: `projectId`, `runId`, `rootTaskId`), which `TaskService.submitTask` writes once for every task; a card is the run of the lineage root (product ports section 3.3).
- **View stamp.** Every section 9 read carries `asOf` and `position` (`EventPosition`), but the event stream is item 14's and nothing assigns positions yet.
- **Turn identifiers.** `startSessionTimelineService` mints a `TurnId` from `randomUUID()`, while wire contracts section 6 mints it as `t` and 32 lowercase hexadecimal digits from 128 random bits.
- **Wire shapes.** `Turn` has no `refused` variant and `TurnState` no `refused` (`board-session-contracts.test.ts` keeps `WIRE_TURN_STATES` apart for it); `AgentSession` needs the card's `runId`; `NativeRequest.position` is the request's index in the session's recording order plus one; `AgentSessionHandoff.evidence` is `DisplayText`; `CommandConflict`, `TurnRefusal`, and `ResponseRefusal` need a `details.reason` that the domain's failures do not carry.
- **Redaction.** `redactSecrets` of `@taskelith/secrets` applies `TextRule`s of `@taskelith/observability` as `String.replace` functions; none reports where it matched, which a held tail needs.
- **Inbox.** `NeedsYouSource` (`ports/needs-you.ts`) has no implementation; an item has an identifier, a creation time, and a resolution with a time, none of which the pure timeline holds.
- **Key.** `SessionInputDigestKeyFile.create` exists and is tested; nothing calls it, and the installation contract section 3 already lists the file as "created by 13b".

## Goals and non-goals

Goals: the scope above. Non-goals: the worker messages and observation intake (13c), the event stream and its positions (item 14), `answerInboxItem` and the inbox views (item 15), the harness host (item 18), the UI, delegation admission (item 38), and the delivery of credentials revealed to a run (item 12c).

## Decisions

### 1. Section 9 operations

Seven routes in `routes.ts`, each with `security: ['browserSession', 'operatorToken']` and served on both listeners as `readEvidence` is (not `browserOnly`, since they accept the bearer), a new `api/agent-session-wire.ts` for the mapping between the wire shapes and the module's, and handlers in `ControlPlaneApi` that call a new `agentSessions` member of `ApiServices`, kept apart from the login `sessions` member.

| Operation | Access check (before the body) | Service call | Mapping, including refusals |
| --- | --- | --- | --- |
| `listAgentSessions` `GET /projects/{projectId}/cards/{runId}/agent-sessions` | `project-viewer` or above, or `installation-owner` | `listByCard(projectId, runId, after)` | `AgentSessionPage` of at most 100 in session ID order, `next` while more remain; 404 when the run is not a card of the project (product ports 3.3, a delegated child's run included); 400 for a malformed `after` |
| `readAgentSession` `GET .../agent-sessions/{sessionId}` | same | `readSession` after the scope check | `AgentSessionView`; 404 for an unknown session and for one whose task belongs to another project, alike |
| `listAgentSessionTurns` `GET .../turns` | same | `readSession` | `TurnPage` of at most 100 after the position `after` (`0` default), `next` while more remain; `refused` turns with their generation (decision 2) |
| `listAgentSessionRequests` `GET .../requests` | same | `readSession` | `NativeRequestPage`; `position` is the index in recording order plus one; an answered request carries its response and delivery |
| `readAgentSessionOutput` `GET .../output` | same | `readOutputAfter(sessionId, after)` (decision 3) | `OutputRead`: `entries` (at most 100, `next`) or `cursor-expired` with `earliestRetained`; 400 for a cursor after the last position |
| `submitTurn` `POST .../turns` | `project-operator` or above; no owner exception | `submitTurn` with the author `{ kind: 'principal', principalId }` of the caller | 201 `recorded`, 200 `duplicate`; 409 `CommandConflict` `idempotency-key-reused`; 422 `TurnRefusal` `session-stopped` for the domain's `precondition-failed`; 400 for text out of bounds; 404 as above |
| `respondToNativeRequest` `POST .../responses` | same | `consumeResponse` with the responder `{ kind: 'principal', principalId }` | 200 `NativeRequest` (also a repeat); 409 `idempotency-key-reused` (the service's reason) or `already-answered` (the domain's `conflict` of an answered request); 404 unknown, `expired`, or `unresolved`; 422 `ResponseRefusal` `attempt-not-current` for the domain's `precondition-failed`; 400 for out-of-bound text or the wrong kind, a delegation request included |

- **Scope check.** The handler resolves the session's project and card through a new execution port, `SessionScopes` (`scopeOf(sessionId)` and `listByCard(projectId, runId, after, limit)`), before any timeline read, and answers a mismatch with the same `not-found` as an unknown session, so a member of one project learns nothing about another's sessions. The PostgreSQL adapter joins `agent_sessions` with `task_lineage` (question Q3); the in-memory adapter takes a lineage lookup.
- **Reasons.** The handler, not the domain, adds the wire reasons, by operation and failure code, since each code has exactly one meaning on that path: `submitTurn`'s `precondition-failed` is only a stopped session (a host author never comes from the wire), and `consumeResponse`'s only the attempt check (session timeline 5.2 step 5). A failure that already has a reason keeps it.
- **View stamp.** `asOf` is the time of the read's transaction; `position` comes from a `ViewPositions` port whose adapter answers `0` until item 14 replaces it (question Q2).
- **Turn identifiers.** The composition mints `t` and 32 lowercase hexadecimal digits from 128 random bits (section 6), replacing `randomUUID()` (question Q5).
- **Bounds.** The schemas bound text in code points, the service in UTF-16 code units for text and UTF-8 bytes for an input answer, so a text within the schema can still answer 400 (section 8, last paragraph), as 13a's service already checks.

### 2. `refused` on the wire

`TurnState` gains `refused`; the `Turn` variant of `delivered` and `outcome-unknown`, which already requires a `generation`, gains `refused` in its `state` enum, since a refused turn has exactly those fields (session timeline section 4.5). `board-session-contracts.test.ts` drops `WIRE_TURN_STATES` and compares the wire with `TURN_STATES` again. The document's version rises from 0.3.0 to 0.4.0, wire contracts section 11 states why, section 9 names the state, and `make contract-compatibility` decides whether an added enum value of a response schema is breaking; if it flags it, `breaking-changes.json` declares it with the reason and the base commit, as 9d's entries do (question Q4).

### 3. Output across chunks and the output read

- **Spans, not replacements.** `@taskelith/observability` gains span-reporting forms of the session text rules (`secretSpans(text)`: the half-open ranges the rules would replace, merged), with a test that `replaceSpans(text, secretSpans(text))` equals `redactSecrets(text)` over the existing redaction corpus, so logs keep their behaviour and the two paths cannot drift.
- **Held tail.** `appendOutput` no longer redacts a chunk alone. For a generation and turn, the service joins the held raw tail and the new chunk and releases the longest prefix that no possible secret crosses: the cut is moved back to the start of any span that reaches the end of the joined text, any begin marker of a PEM key or `.creds` block without its end, any trailing run of non-whitespace characters, and any trailing keyword of a rule whose value may follow after whitespace (`bearer`, `key=`, `key:`, `authorization`). The released prefix is redacted with the spans of the joined text, and the rest is held.
- **Bound.** The held tail never exceeds `MAX_HARNESS_TEXT_LENGTH` code units; beyond it the oldest part is released redacted as it stands, where an unterminated PEM key is redacted to its end (question Q6).
- **Release.** The released text becomes one or more output entries, each at most `MAX_HARNESS_TEXT_LENGTH` code units and split on a code point boundary, never cut, because redaction can lengthen it past one entry's bound (checklist `contract-drift`).
- **Durability.** The held tail is kept with its session, generation, and turn in its own row, written in the append's transaction, never shown. Before `recordTurnOutcome`, `recordTurnAcceptanceUnknown`, `endGeneration`, `endBoundAttempt`, and an append for another turn, the service releases the turn's whole tail, redacted, in the same transaction and before the domain change, while the turn is still `delivered` in the running generation. After a restart, the next chunk or the generation's end, also one that recovery records, decides it as before.
- **Read.** `SessionTimelineService.readOutputAfter(sessionId, cursor)` maps the domain's `readOutputAfter`, and `SessionView` stays without the output entries. The 13a requirement "No output read before cross-chunk redaction" is removed by this delta, as its own text foresaw.

### 4. Native request source

`NativeRequestSource` in `@taskelith/execution`'s application layer implements `NeedsYouSource` with the kinds `permission-request`, `input-request`, and `delivery-acknowledgement`.

- **Items.** A table of native request items (`SessionInboxItems` port, PostgreSQL and in-memory adapters) holds each item's identifier, kind, request key, card subject, creation time, and its resolution or closure. The service writes them in the timeline's own transaction from the session before and after each change, so a response and its item's resolution commit together (wire contracts section 9, "Responses"): `recordRequest` of a permission or input request opens one; `consumeResponse` resolves it with the responder and the time; a request that becomes `expired` or `unresolved` closes it; a response whose delivery becomes `delivery-uncertain`, at `endGeneration`, `endBoundAttempt`, or the host's report, opens one `delivery-acknowledgement` item (section 8.1). A row is written only when a state changes, never upserted (checklist `concurrency-race`).
- **Subject.** The card subject names the project, the card's run, the task, the session's bound attempt and its ownership generation at recording, and the `sessionId`, `sessionGeneration`, and `nativeRequestId` of the request (section 8, "Request items"); answerable by `project-operator`.
- **`openItems`.** A project scope's open items, through the same lineage join as decision 1; the installation scope has none of these kinds.
- **`answer`.** A permission or input answer consumes the request through `consumeResponse` with the item's attempt and generation, so it and `respondToNativeRequest` reach one consumption, and the loser answers `conflict` `already-answered`; `acknowledge` resolves a `delivery-acknowledgement` item, audited through `appendAuditEvent`, and resends, answers, and starts nothing. The key check before the source is item 15's handler's (product ports section 4.2).
- **Title.** A fixed text per kind; no request text, so no session text reaches a title.

### 5. Key at installation bootstrap

`Administration.initialize` ensures `control-plane/session-input-digest.key` beside the broker authority, before the installation record: `SessionInputDigestKeyFile.create` through `ControlPlaneNamespace.create`, mode `0600`, `conflict` taken as already created. Nothing logs it or puts it in a record or a reason. The start keeps refusing a missing or wrong-size key with a reason that names the file and the size only. An installation initialized before 13b gets its key as question Q7 decides. The installation contract's row of the file loses "created by 13b".

### 6. Composition

`wire()` in `composition/control-plane.ts` calls `startSessionTimelineService` with the namespace, which `Administration` exposes as it does the installation CA, and the database, and fails the start on its refusal; it builds the `SessionScopes`, `ViewPositions`, and `NativeRequestSource` adapters, and passes `agentSessions` to `ControlPlaneApi`. The source is built but registered with no inbox, which item 15 aggregates.

### 7. G3 plan row 13

Row 13's sub-change list names 13a as archived, 13b with this scope (or the 13b and 13d of answer Q1), and 13c, and adds: "the session input digest key is created at installation bootstrap (13b)".

## Test plan

Every test is written before its code and run failing, recorded in `verification.md` with how it failed; each fails by an assertion, not a missing module, by stubbing new exports with `internal` ("not implemented") as 13a did.

- **Refused roles** (fail-before: no route, so 404 where the test expects 403). For each of the seven operations: no credential 401; a non-member 403 `role-required`; a cookie mutation without the CSRF header 403 `csrf-token-invalid`; a `project-viewer` 403 on `submitTurn` and `respondToNativeRequest` and 200 on the reads; an `installation-owner` without a project role 200 on the reads and 403 on the two mutations; a role on another project 403; a role check before the body (an invalid body by a viewer answers 403, not 400).
- **Scope.** A session or card of another project answers the same 404 body as an unknown one, for a caller who holds a role on the path's project.
- **Mapping.** Each status of the decision 1 table, the `refused` turn on the wire, request positions, `next` keys, and every success checked against its schema by the server's own response check.
- **PostgreSQL races** (barriers inside the work, never sleeps; checklist `concurrency-race`): two `submitTurn` with one key and one text (201 and 200, one turn); one key and two texts (201 and 409 `idempotency-key-reused`); two `respondToNativeRequest` with two keys (200 and 409 `already-answered`); `respondToNativeRequest` racing `NativeRequestSource.answer` on one request (one consumed, one `already-answered`, one item resolution); two acknowledgements of one item (one resolution, one audit event); a response racing the generation's end (answered and then a `delivery-acknowledgement` item, or 404 and a closed item).
- **Held tail** (fail-before: the per-chunk redaction lets a split secret through): a JWT, a bearer token, an issued `tken_` secret, a `password=` pair with a quoted value with spaces, and a PEM key, each split across two and across three chunks, never appear in an entry, a read, or the store's entries; a tail released at a turn's outcome, at the generation's end, and on an append for another turn; a redaction that lengthens a released text past `MAX_HARNESS_TEXT_LENGTH` gives two entries split on a code point boundary with a surrogate pair at the split; a tail over its bound released redacted; and a `SIGKILL` crash test at `SessionTimelineCommit.before` and `.after` of an append that holds a tail, whose next chunk after the restart decides it.
- **Key.** `initialize` creates the key with mode `0600` once and a rerun keeps it; a log captured during `initialize` and the start holds no key byte; the start refuses a missing key and names no byte.
- **Wire.** `board-session-contracts.test.ts` compares the wire `TurnState` with `TURN_STATES`; `make contract-compatibility` passes with or without a declaration as it decides.
- Coverage stays at or above 75% of lines, branches, and functions; test titles state what the assertions check (checklist `naming`).

## Size and split

Measured against the brief's M-L, with 13a as the yardstick (about 1,300 lines of source and 1,800 of tests, "the top of M-L"):

| Part | Source | Tests |
| --- | --- | --- |
| Seven routes, handlers, wire mapping, reasons, `SessionScopes` with its join, `ViewPositions`, `refused` on the wire, turn identifiers | about 900 | about 1,200 |
| Native request source with its item table and migration, written in the timeline transactions | about 500 | about 650 |
| Key at bootstrap, composition, plan row | about 120 | about 150 |
| Span-reporting rules, held tail with its table and migration, release before each turn and generation end, entry splitting, output read | about 750 | about 1,000 |
| Total | about 2,250 | about 3,000 |

The brief is clearly larger than M-L, so the design proposes (question Q1):

- **13b `serve-session-timeline-over-http`** (this change, M-L): decisions 1, 2, 4, 5, 6, and 7, without `readAgentSessionOutput`, about 1,500 lines of source. The native request source stays here because `respondToNativeRequest` must resolve the request's item in its own transaction.
- **13d `redact-session-output-across-chunks`** (M): decision 3 and the `readAgentSessionOutput` route, which until then stays unrouted (404, as every operation without a route), so nothing unredacted across chunks leaves (answer Q5 of 13a).

13d depends on 13b's routes and wire mapping only, and can follow it at once or run beside 13c.

## Coordinator questions

**Q1. Split.** Is the brief split into 13b and 13d as "Size and split" proposes? Options: (a) 13b without decision 3 and `readAgentSessionOutput`, and 13d with them; (b) 13b without the native request source as well, which goes to 13d with the output (about M-L each, but the response's item then resolves in 13d, so 13b's `respondToNativeRequest` misses its contract scenario "Session response resolves the inbox item"); (c) no split, an L change. Recommendation: (a). No contract amendment; plan row 13 gains 13d.

**Q2. View stamp before item 14.** No event position exists yet. Options: (a) a `ViewPositions` port whose adapter answers `0`, "before any event" in `EventPosition`, until item 14 replaces it; (b) leave the reads unrouted until item 14. Recommendation: (a): `0` is a valid cursor (section 10, "Cursor as a boundary"), and no stream exists to resume. No contract amendment.

**Q3. Session scope source.** A session knows only its task. Options: (a) the PostgreSQL adapter joins `agent_sessions` with Scheduling's `task_lineage`, written once per task and immutable, as `capacity-repositories.ts` already joins `tasks` with it; (b) `agent_sessions` gains `project_id` and `card_run_id` columns, filled at `openSession`, which then needs them from its caller (13c). Recommendation: (a): no change to the 13a table or the domain, and the lineage stays the one source of a task's project and card. No contract amendment.

**Q4. `refused` in the wire `Turn`.** Options: (a) add `refused` to `TurnState` and to the `state` enum of the variant of `delivered` and `outcome-unknown`, which already has exactly the fields of a refused turn; (b) a separate `Turn` variant for `refused`. Recommendation: (a), the smaller schema change; version 0.4.0, and a `breaking-changes.json` entry only if `make contract-compatibility` flags it. Contract amendment: yes, of the wire document and wire contracts sections 9 and 11 (answer Q8 of 13a).

**Q5. Turn identifier format.** 13a's composition mints a `TurnId` from a UUID; wire contracts section 6 requires `t` and 32 lowercase hexadecimal digits. Options: (a) 13b mints the section 6 form in the composition, since 13b puts turns on the wire; (b) leave it to 13c. Recommendation: (a); no stored turn exists, since nothing calls the service before 13b. No contract amendment.

**Q6. Held tail bound and forced release** (13d if Q1 (a)). Options: (a) hold at most `MAX_HARNESS_TEXT_LENGTH` code units, and beyond it release the oldest part redacted as it stands; (b) hold without bound until the turn or generation ends; (c) a smaller bound, such as 8,192. Recommendation: (a): a PEM key or `.creds` block fits well within it, and an unbounded tail would let a harness hold memory and rows without limit. The limit, that a secret longer than the bound which starts in a released part can leak its continuation, is stated in the design and the delta. Contract amendment: yes, wire contracts section 7 states the bound.

**Q7. Key for an installation initialized before 13b.** Options: (a) `initialize` ensures the key whether or not the installation exists, before its rerun refusal, so the documented rerun of `init` gives an earlier installation its key, and the start keeps refusing without it, naming the command; (b) the start creates the key when it is missing and the timeline holds no idempotency key; (c) a separate administrative command. Recommendation: (a): one creation path, and a new key is safe even after a loss (13a answer Q4: a repeat is answered `idempotency-key-reused`). No contract amendment; the installation contract's row of the file says so.

**Q8. Migration numbers.** 13b adds one migration (the native request items), 13d one (the held tail). Options: (a) 13b takes `1792933100000_session-inbox-items.sql` and 13d `1792933200000_session-output-tail.sql`, told to parallel workers now; (b) whichever merges later renumbers. Recommendation: (a), as answer Q7 of 13a did. No contract amendment.

**Q9. Credentials revealed to a run.** Section 7 redacts output against "a credential revealed to the run", but the delivery of slot credentials to a run is 12c, and the redactor has no source of them. Options: (a) 13b and 13d redact the known shapes only, and a follow-up, 12c's or 13c's, passes a run's revealed credentials to the redactor; (b) 13d adds a port for them now with an empty adapter. Recommendation: (a), named as a limit in the delta. No contract amendment.
