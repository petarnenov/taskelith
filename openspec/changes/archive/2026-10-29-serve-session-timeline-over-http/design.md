# Design: serve-session-timeline-over-http

## Context

Sub-change 13b of G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13), from `dev` `19c15d69`. 13a ([archived design](/openspec/changes/archive/2026-10-29-implement-session-timeline/design.md)) built the domain completion, the `SessionTimelineStore` port with in-memory and PostgreSQL adapters, and `SessionTimelineService` in `@taskelith/execution`; its follow-up list and the coordinator's answers Q1, Q5, Q8, and the architect check of `e355e01f` give 13b:

- the HTTP operations of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 9, behind the role checks of section 3;
- `refused` in the wire `TurnState` with its contract-document update and the breaking-change check (answer Q8);
- output redacted across chunks with a durable held tail (section 7, "Output across chunks"), and the output read that it then allows (answer Q5), which the coordinator moved to 13d (answer Q1 below);
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

Goals: decisions 1, 2, and 4 to 7 below, the scope of 13b after answer Q1. Non-goals: output redacted across chunks and `readAgentSessionOutput` (13d `redact-session-output-across-chunks`), the worker messages and observation intake (13c), the event stream and its positions (item 14), `answerInboxItem` and the inbox views (item 15), the harness host (item 18), the UI, delegation admission (item 38), and the delivery of credentials revealed to a run (item 12c).

## Decisions

### 1. Section 9 operations

Six routes in `routes.ts`, each with `security: ['browserSession', 'operatorToken']` and served on both listeners as `readEvidence` is (not `browserOnly`, since they accept the bearer). `api/agent-session-wire.ts` maps between the wire shapes and the module's, and `api/agent-session-api.ts` holds the handlers, which reach the required `agentSessions` member of `ApiServices` (`AgentSessionOperations`: the timeline's reads and commands, `SessionScopes`, `ViewPositions`, and the clock), kept apart from the login `sessions` member. `readAgentSessionOutput` stays unrouted until 13d, so it answers 404 as every operation without a route (answer Q1).

| Operation | Access check (before the body) | Service call | Mapping, including refusals |
| --- | --- | --- | --- |
| `listAgentSessions` `GET /projects/{projectId}/cards/{runId}/agent-sessions` | `project-viewer` or above, or `installation-owner` | `readCardSessions`, which lists and reads the card's sessions in one transaction | `AgentSessionPage` of at most 100 in session ID code-unit order, `next` while more remain; 404 when the run is no card of the project (a delegated child's run, another project's, or an unknown one); 400 for a malformed `after` |
| `readAgentSession` `GET .../agent-sessions/{sessionId}` | same | `readSession` after the scope check | `AgentSessionView`; 404 for an unknown session and for one whose task belongs to another project, with one body |
| `listAgentSessionTurns` `GET .../turns` | same | `readSession` | `TurnPage` of at most 100 after the position `after` (`0` default), `next` while more remain; `refused` turns with their generation (decision 2) |
| `listAgentSessionRequests` `GET .../requests` | same | `readSession` | `NativeRequestPage`; `position` is the index in recording order plus one; an answered request carries its response and delivery |
| `submitTurn` `POST .../turns` | `project-operator` or above; no owner exception | `submitTurn` with the author `{ kind: 'principal', principalId }` of the caller | 201 `recorded`, 200 `duplicate`; 409 `CommandConflict` `idempotency-key-reused`; 422 `TurnRefusal` `session-stopped`; 400 for text out of bounds; 404 as above |
| `respondToNativeRequest` `POST .../responses` | same | `consumeResponse` with the responder `{ kind: 'principal', principalId }` | 200 `NativeRequest` (also a repeat); 409 `idempotency-key-reused` or `already-answered`; 404 unknown, `expired`, or `unresolved`; 422 `ResponseRefusal` `attempt-not-current`; 400 for out-of-bound text or the wrong kind, a delegation request included |

- **Scope check.** The handler resolves the session's scope through the execution port `SessionScopes` (`scopeOf(sessionId)`, `isCard(projectId, runId)`, `listByCard(scope, after, limit)`) before any timeline read, and answers a session of another project, or one without a lineage, with the same `not-found` body as an unknown session, which names neither. The PostgreSQL adapter joins `agent_sessions` with the task's `task_lineage` row and that of its root, whose run is the card (answer Q3); a card is a run of the project with no delegated task (`depth > 0`) of its own. The in-memory adapter reads an `InMemoryTaskLineage` of runs and tasks by the same rules, so a card without sessions is a card in both; the shared `SESSION_SCOPES_CONFORMANCE` suite runs on both adapters. `SessionTimelineTransaction.scopes` reads the scopes inside a timeline transaction.
- **Reasons.** `SessionTimelineService` adds the wire reasons, since two callers share `consumeResponse` (this handler and the native request source): `submitTurn`'s `precondition-failed` becomes `session-stopped` (a host author never comes from the wire), `consumeResponse`'s `conflict` without a reason becomes `already-answered` and its `precondition-failed` becomes `attempt-not-current` (session timeline 5.2 step 5). A failure that already has a reason, such as `idempotency-key-reused`, keeps it.
- **View stamp.** `asOf` is read from the clock before the read, so the state shown is no older than it; `position` comes from the `ViewPositions` port, whose adapter `BEFORE_ANY_EVENT` answers `0` until item 14 replaces it (answer Q2).
- **Turn identifiers.** The composition's `mintTurnId` mints `t` and 32 lowercase hexadecimal digits from 128 random bits (section 6), through the new domain parser `parseTurnId`, which refuses a UUID (answer Q5). Nothing was published, so no turn ID of 13a's form exists anywhere to migrate.
- **Session view.** `SessionView` keeps the output's bounds (`outputWindow`: `lastPosition` and `earliestRetained`) without its entries, which `AgentSession.output` needs; `readCardSessions` lists a card's page through `tx.scopes.listByCard` and reads its sessions in the same transaction, so the page shows one state (section 8, "Snapshots").
- **Bounds.** The schemas bound text in code points, the service in UTF-16 code units for text and UTF-8 bytes for an input answer, so a text within the schema can still answer 400 (section 8, last paragraph), as 13a's service already checks.

### 2. `refused` on the wire

`TurnState` gains `refused`; the `Turn` variant of `delivered` and `outcome-unknown`, which already requires a `generation`, gains `refused` in its `state` enum, since a refused turn has exactly those fields (session timeline section 4.5). `board-session-contracts.test.ts` drops `WIRE_TURN_STATES` and compares the wire with `TURN_STATES` again. The document's version rises from 0.3.0 to 0.4.0; wire contracts section 1 lists it, section 9 names the state, and section 11 states why. `make contract-compatibility` reports the added enum value of four responses as breaking, so `breaking-changes.json` declares them for 0.4.0 with the reason and the base commit (answer Q4).

### 3. Output across chunks (13d)

Output redacted across chunks with a durable held tail, its bound (answer Q6), the release before each turn and generation end, entry splitting, `SessionTimelineService.readOutputAfter`, and the `readAgentSessionOutput` route belong to 13d `redact-session-output-across-chunks` with the migration `1792933200000` (answers Q1, Q6, Q8). 13b keeps 13a's per-chunk redaction and its requirement "No output read before cross-chunk redaction" unchanged.

### 4. Native request source

`NativeRequestSource` in `@taskelith/execution`'s application layer implements `NeedsYouSource` with the kinds `permission-request`, `input-request`, and `delivery-acknowledgement`.

- **Items.** The `SessionInboxItems` port (PostgreSQL and in-memory adapters, in `SessionTimelineTransaction.items`) holds each item's identifier, kind, session, task, request key, bound attempt and its ownership generation, creation time, and state with its resolution or closure. The service compares the session before and after each change (`itemChanges`) and writes the items in the same transaction, so a response and its item's resolution commit together (wire contracts section 9, "Responses"): recording a permission or input request opens one; a principal's response resolves it with the responder, the time, and the answer; a standing rule's answer, an expiry, and an unresolved end close it, as no person answered; a response whose delivery becomes `delivery-uncertain` opens one `delivery-acknowledgement` item (section 8.1), also a host's delegation result, whose request has no item of its own. An item is added once per request and kind (`conflict` otherwise) and settled only while open, never upserted, so a change that leaves the requests as they were writes no item row.
- **Subject.** The card subject is joined at read time through the same lineage as decision 1 (answer Q3): the project, the card's run, the task, the bound attempt and its ownership generation at recording, and the `sessionId`, `sessionGeneration`, and `nativeRequestId` of the request (section 8, "Request items").
- **`openItems`.** A project scope's open items in item ID order, 100 a page; the installation scope has none of these kinds.
- **`answer`.** A permission or input answer consumes the request through the service's `answerItem` with the item's attempt and generation, the same domain consumption as `consumeResponse`, so it and `respondToNativeRequest` reach one consumption, and the loser answers `conflict` `already-answered`. Its idempotency key is scoped to the item (scope `item:<itemId>`, section 8), never to the request, so one key used in both channels is two keys; in its transaction it checks the key, then the item's state: a resolved item answers `already-answered`, a closed one, also one a standing rule closed, `precondition-failed` `item-closed`. An answer of another kind is `invalid`. `acknowledge` resolves a `delivery-acknowledgement` item in one transaction with its idempotency key (scope `item:<itemId>`) and a `session.delivery-acknowledged` audit event, and resends, answers, and starts nothing. The audit events of sessions go to their own append-only table, `session_audit_events`, since the credential audit of `audit_events` names slots and accounts. The key check before the source is item 15's handler's (product ports section 4.2).
- **Title.** A fixed text per kind; no request text, so no session text reaches a title.
- **Migration.** `1792933100000_session-inbox-items.sql` (answer Q8) adds `session_inbox_items` and `session_audit_events`, the latter immutable through `refuse_audit_change()`; its down migration drops them and keeps 13a's tables.

### 5. Key at installation bootstrap

`Administration.initialize` ensures `control-plane/session-input-digest.key` after reading the installation record and before its rerun refusal: `SessionInputDigestKeyFile.ensure` creates it through `ControlPlaneNamespace.create`, mode `0600`, when it is missing, and keeps an existing one, whatever it holds, also on a rerun (answer Q7). Nothing logs it or puts it in an output, a record, or a reason. The start keeps refusing a missing or wrong-size key with a reason that names the file and the size only, as in 13a. The installation contract's row of the file says it is created at initialization when missing.

### 6. Composition

`startControlPlane` calls `startAgentSessionServices` with the namespace, which `Administration` now exposes, the database, and the clock, and fails the start on its refusal; it builds the service, `PostgresSessionScopes`, `BEFORE_ANY_EVENT`, and `NativeRequestSource`, and passes `agentSessions` to `ControlPlaneApi`. The source is built but registered with no inbox, which item 15 aggregates.

### 7. G3 plan row 13

Row 13's sub-change list names 13a as archived, 13b with this scope, 13c, and 13d, and adds that the session input digest key is created at installation initialization when missing (13b).

### Obligation of 12c and 13c (answer Q9)

Section 7 redacts output against "a credential revealed to the run", but neither 13b nor 13d has a source of a run's revealed credentials: they redact the known shapes only, a stated limit. 13c wires the run's revealed credentials, from 12c's per-run delivery record, into the session output redactor; 12c's record must expose them for that.

## Test plan

Every new behavioral test was run failing first against a stub or mutant of the code it protects, and the run is recorded in `verification.md`.

- **Refused roles.** For each of the six operations: no credential 401; a non-member and a role on another project 403 `role-required`; a cookie mutation without the CSRF header 403 `csrf-token-invalid`; a `project-viewer` 403 on `submitTurn` and `respondToNativeRequest`, before the body, and 200 on the reads; an `installation-owner` without a project role 200 on the reads and 403 on the two mutations.
- **Scope.** A session of another project answers a member the same 404 body as an unknown one on every operation; a run that is no card answers 404.
- **Mapping.** Each status of the decision 1 table, the `refused` turn, request positions, `next` keys, minted turn IDs, and every success checked against its schema by the server's own response check.
- **PostgreSQL races** (barriers inside the work, never sleeps): a response racing an inbox answer of one request (one consumed, one `already-answered`, one item resolution); two acknowledgements of one item under two keys (one resolution, one audit event); a response racing the generation's end (answered and an acknowledgement item, or `not-found` and a closed item); a standing rule racing an inbox answer (`item-closed` or `already-answered`); a card's page racing an added session and a submitted turn (one state). Each barrier wait is bounded and fails by assertion. The crash tests of 13a also assert the items' states after a restart, and an acknowledgement killed at its commit writes its resolution, audit event, and key together or none.
- **Key.** `ensure` creates the key with mode `0600` when missing and keeps any existing key, a wrong-size one included, which the digest still refuses; `init` creates it, its output holds no key byte, a rerun keeps it, and a rerun after its loss creates it again.
- **Wire.** `board-session-contracts.test.ts` compares the wire `TurnState` with `TURN_STATES`; `make contract-compatibility` passes with the declaration.
- Coverage stays at or above 75% of lines, branches, and functions.

## Size and split

Measured against the brief's M-L, with 13a as the yardstick (about 1,300 lines of source and 1,800 of tests, "the top of M-L"):

| Part | Source | Tests |
| --- | --- | --- |
| Six routes, handlers, wire mapping, reasons, `SessionScopes` with its join, `ViewPositions`, `refused` on the wire, turn identifiers | about 900 | about 1,200 |
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

## Coordinator's answers (Niki, 2026-10-29)

Q1 Split accepted: 13b (M-L) = everything except the output work; 13d `redact-session-output-across-chunks` (M) = cross-chunk redaction with the held tail plus the readAgentSessionOutput route, unrouted until then. Name 13d in the proposal and in g3-plan row 13.

Q2 Accepted: position 0 through ViewPositions, documented as replaced by item 14.

Q3 Accepted.

Q4 Accepted, with the amendment written into the wire contract document in this change.

Q5 Accepted: fix the TurnId format in 13b (t + 32 hex digits, section 6), with the domain parser refusing a UUID and a test that fails before. Nothing is published, so no data migration of 13a IDs; say so in the design.

Q6 Accepted as the rule, implemented in 13d (section 7 amendment goes with 13d).

Q7 Accepted: initialize creates the key only when missing, never overwrites an existing one, also on a rerun; tests for both, and a wrong-size existing key still refuses the service start as in 13a.

Q8 Accepted: 13b 1792933100000, 13d 1792933200000. I tell Pepi to avoid both.

Q9 Accepted as a stated limit. Owner of the fix: 13c wires the run's revealed credentials (from 12c's per-run delivery record) into the session output redactor; note that obligation for 12c/13c in the design.

Proceed with 13b code.
