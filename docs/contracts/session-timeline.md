# Session timeline contract

Date: 2026-10-28. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 4, `define-session-turn-model`), under independent review. It defines the pure domain of the Execution module's durable session timeline that [architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals) requires: one task's sessions with at most one active attempt and numbered generations, ordered turns with an immutable identity and a client idempotency key, queued and serialized turn delivery, native permission, input, and delegation requests recorded before display with a single consumed response, reconciliation at a generation's end without replay, bounded output retention with cursor recovery, and the handoff of a session stopped by an account limit. The `session-turn-model` specification states the same rules as requirements. G3 items 9 (wire), 13 (the session timeline service and its persistence), 14 (the UI event stream), and 18 (the harness host) build on it.

## 1. Purpose and parties

The [agent harness port contract](agent-harness-port.md) (item 3) makes the host persist each request before it is shown, consume each response once, and reconcile after a restart, and leaves the timeline that records them to this item (its sections 2 rule 6, 6, and 12). The [capacity reservation contract](capacity-reservation.md) section 10 counts attempts as [ADR 0005](../decisions/0005-harness-subscription-account-pools.md)'s active sessions only if a session has at most one active attempt, and assigns that invariant to this item. ADR 0005 decision 4 as amended and the [account pool contract](account-pool.md) section 4.4 require a session whose slot reports a limit to write a handoff that the next session reads. R29 ([architecture section 14](../architecture.md#14-acceptance-requirements-and-scenarios)) is the acceptance scenario.

| Party | Role |
| --- | --- |
| Execution module | Owns the session timeline domain in `@taskelith/execution` (`packages/modules/execution/src/domain/session-*.ts`) |
| Harness host (item 18) | Reports what the harness port returned and emitted: generation starts and ends, turn deliveries and outcomes, requests, output, limit signals, and response delivery results |
| Session timeline service (item 13) | Persists sessions, applies submissions and responses through the domain, passes the task's other sessions to an attempt binding, and derives inbox items from the reads of section 5.5 |

The domain is pure: it reads no clock, random source, file, or network, and it stores nothing. A caller passes the session and the change and receives a new frozen session or a failure; the session passed in is never changed. This item adds no persistence, service, wire schema, UI stream, or host.

## 2. Common rules

1. **Neutrality.** No type, value, or test of the timeline names a harness, vendor, model, or native field. The native session ID and the native request ID are opaque identifiers (agent harness port contract section 2 rule 1).
2. **Reuse.** The timeline uses `AttemptId`, `PrincipalId`, `IdempotencyKey`, `NativeRequestId`, and `HarnessPluginId` of the Execution module, `TaskId`, `OwnershipGeneration`, and `EvidenceReference` of `@taskelith/sdlc`, `StandingRuleId` of the standing approval rules port, and the port's `TurnOutcome`, `HarnessFailure`, `PermissionDecision`, `DelegationOutcome`, `HarnessRequestKind`, and `MAX_HARNESS_TEXT_LENGTH`. The domain defines these values (`domain/harness-values.ts` and `domain/identifiers.ts`) and the port files re-export them, because a domain file imports no port. It adds `SessionId`, `TurnId`, and `NativeSessionId`, kernel identifiers of 1 to 128 printable characters, and `SessionGeneration`, a positive safe integer that `parseSessionGeneration` checks, starting at `FIRST_SESSION_GENERATION`, `1`.
3. **Results.** Every change returns a kernel `Result`, except `openSession` and `recordLimitSignal`, which cannot fail. A failure changes nothing. A repeat of a change that the session already holds, where this contract says so, succeeds and returns the session unchanged.
4. **Frozen values.** Every returned session, and every record and list in it, is frozen.
5. **Text bounds.** A turn's text is 1 to `MAX_HARNESS_TEXT_LENGTH` (65,536) characters. A request's text, an output entry's text, and an answer's `message`, `text`, and `summary` are at most that many characters, and an answer's `delegationId` is 1 to 128 characters. Text outside its bound fails with `invalid` before any state is checked.
6. **Caller-supplied identities.** The caller generates every `TurnId` and passes every other identifier; the domain generates none.

| Code | When |
| --- | --- |
| `invalid` | Text outside its bound, a cursor that is not a position of the session, an outcome with a failure other than exactly when it is `failed`, an answer of the wrong kind for its request, or an answer from the wrong responder |
| `not-found` | An unknown attempt, generation, turn, request, or handoff, or a request that is `expired` or `unresolved` |
| `conflict` | An attempt of another task, an attempt the session already bound or that another session of the task holds, another native session ID, a repeated idempotency key with other text, a repeated turn ID, a request key repeated with other content, a second outcome, a second response, a second handoff, a handoff taken twice, or taken by the same session or by a session of another task |
| `precondition-failed` | Every other state the change does not allow: a bound attempt that has not ended, a generation that is not the next one or not running, no active bound attempt, a stopped session, a turn that is not the next deliverable one, a turn that is not running in the named generation, a response for an attempt or ownership generation that is not the active bound one, a delivery report for a request that is not answered or whose delivery is no longer pending, or a handoff before the stop or while a generation runs |

## 3. Sessions, attempts, and generations

### 3.1 The session

`openSession` creates a session from its `SessionId`, its `TaskId`, and the `HarnessPluginId` of the harness that runs it. A session records its harness only; the account slot stays in Scheduling's reservation (`providerCredentials`), so the Execution module imports nothing of Scheduling. A session holds its bound attempts, its generations, its turns, its requests, its output window, its limit stop when it has one, and its handoff when it has one.

**One task.** A session belongs to one task, and a task belongs to one run (`TaskAdmission`). The session spans the task's successive stage admissions, binding the task's attempts one at a time across its re-admissions at later ownership generations. A delegated child task is another task and gets its own session. A new session of the same task may run on another harness and slot (ADR 0005 decision 5).

### 3.2 Attempt binding

`bindAttempt(session, binding, taskSessions)` binds an attempt, named by its `AttemptId`, its `TaskId`, and its `OwnershipGeneration`. `taskSessions` are the task's other sessions, which the caller reads; the session itself in that list is ignored. In order:

1. An attempt of another task fails with `conflict`.
2. An attempt the session already bound, ended or not, fails with `conflict`.
3. An attempt that one of `taskSessions` holds fails with `conflict`.
4. While the session's bound attempt has not ended, binding fails with `precondition-failed`.
5. A stopped session (section 8) fails with `precondition-failed`, so the attempt stays free for the session that takes the handoff.

So a session has at most one active attempt, and an attempt binds to one session only, which makes the capacity reservation contract's count of attempts a count of active sessions. `endBoundAttempt(session, attemptId)` records that the bound attempt ended, from the attempt's outcome fact; it also ends a running generation with the reconciliation of section 6. An attempt the session never bound fails with `not-found`, and ending an ended attempt changes nothing. `activeBoundAttempt(session)` returns the bound attempt that has not ended, if any.

### 3.3 Generations

A generation counts the session's native processes (agent harness port contract section 2 rule 5). `startGeneration(session, start)` names the generation and the native session ID that the port's start or resume returned. In order:

1. A stopped session (section 8) fails with `precondition-failed`.
2. A session without an active bound attempt fails with `precondition-failed`; the generation records that attempt.
3. A running generation fails with `precondition-failed`.
4. A generation other than `1` for the first, or other than one more than the last, fails with `precondition-failed`.
5. The first generation records the native session ID; a later one that names another ID fails with `conflict`, because a resume keeps it.

`endGeneration(session, generation)` ends the running generation, from the port's `session-ended` or the host's loss of it, with the reconciliation of section 6. An unknown generation fails with `not-found`, and ending an ended generation changes nothing. `runningGeneration(session)` returns the running generation, if any.

## 4. Turns

### 4.1 Submission and idempotency

`submitTurn(session, submission)` records a user turn from its `TurnId`, its `IdempotencyKey`, its author (`PrincipalId`), and its text, and returns the session, the turn, and the effect, `recorded` or `duplicate`. In order:

1. Text outside its bound fails with `invalid`.
2. A key the session holds returns that turn with the effect `duplicate`, whatever its state, when the text is equal; with other text it fails with `conflict`. A retry never creates another turn.
3. A `TurnId` the session holds fails with `conflict`.
4. A stopped session fails with `precondition-failed`.

A new turn is `queued` at the next position of the session, from 1 without gaps. Its ID, key, author, text, and position never change.

### 4.2 Queued, serialized delivery

All turns are mutable in G3, because no harness declares concurrent turns (agent harness port contract section 6). A turn submitted while another runs is queued and delivered when the running turn ends, one at a time in position order, so the port's rejection of a second turn never fires for a queued turn. `nextDeliverableTurn(session)` returns the earliest queued turn when the session is not stopped, a generation runs, and no turn is `delivered`; otherwise nothing.

`deliverTurn(session, delivery)` records that the host submitted the turn in the named generation, after the port accepted it. An unknown turn fails with `not-found`. A turn that is not `queued`, a stopped session, a generation that is not running, another `delivered` turn, or a turn other than the earliest queued one fails with `precondition-failed`. The turn becomes `delivered` in that generation.

### 4.3 Outcomes

`recordTurnOutcome(session, end)` records the port's `turn-ended` for a turn: its generation, its `TurnOutcome`, and its `HarnessFailure`, present exactly when the outcome is `failed`. In order:

1. A failure present or missing against that rule fails with `invalid`.
2. An unknown turn fails with `not-found`.
3. A turn that is `ended` or `outcome-unknown` fails with `conflict`.
4. A `queued` turn, or a generation other than the turn's, fails with `precondition-failed`.

The turn becomes `ended` with its outcome. Each of its requests that is still `open` becomes `expired` (agent harness port contract section 7.3). An `account-limit-reached` outcome stops the session (section 8).

| Turn state | Meaning |
| --- | --- |
| `queued` | Recorded, not yet delivered |
| `delivered` | Delivered in its generation, without an outcome |
| `ended` | Ended with one outcome |
| `outcome-unknown` | Its generation ended before its outcome; final (section 6) |

## 5. Native requests and responses

### 5.1 Recording

A request is keyed by its session, its generation, and its `NativeRequestId` (agent harness port contract section 7.1); within a session the key is the `RequestKey`, the generation and the native request ID. `recordRequest(session, recording)` records the port's `permission-request`, `input-request`, or `delegation-request` from its key, its `HarnessRequestKind`, its `TurnId`, and its text (`summary`, `prompt`, or `instructions`). In order:

1. Text outside its bound fails with `invalid`.
2. A key the session holds changes nothing when the kind, turn, and text are equal, and fails with `conflict` otherwise.
3. An unknown turn fails with `not-found`.
4. A generation that is not running, or a turn that is not `delivered` in it, fails with `precondition-failed`.

The request is `open`. A request enters the timeline only this way, so a read of section 5.5 lists only recorded requests. Recording changes only the session value that `recordRequest` returns and stores nothing (section 1); persistence before display is item 13's obligation: the session timeline service commits the recorded session durably before any read shows the request or any event publishes it (architecture section 7; agent harness port contract section 2 rule 6).

### 5.2 A single response

`consumeResponse(session, response)` consumes one response: the request key, the answer, the responder, and the attempt with its ownership generation. The answer is a `permission` answer with a `PermissionDecision` and an optional message, an `input` answer with text, or a `delegation-result` with a delegation ID, a `DelegationOutcome`, and a summary, the kinds of the port's responses. The responder is a person (`PrincipalId`), a standing rule (`StandingRuleId`), which answers native permission requests only ([product ports contract](product-ports.md) section 5), or the host (`host`), which returns a delegated child task's outcome (agent harness port contract section 7.4). In order:

1. Text outside its bound fails with `invalid`.
2. An unknown request fails with `not-found`.
3. An `answered` request fails with `conflict`; the first response stays.
4. An `expired` or `unresolved` request fails with `not-found`; neither is ever answered.
5. An attempt or ownership generation other than the session's active bound attempt fails with `precondition-failed`.
6. An answer whose kind does not match the request (`permission` for a permission request, `input` for an input request, `delegation-result` for a delegation request) fails with `invalid`.
7. An answer that its responder cannot give fails with `invalid`: the host returns every delegation result and answers nothing else, and a standing rule gives only a `permission` answer.

The request becomes `answered`, with the response and its delivery `pending`. A request can be answered only while its generation runs, because a generation's end leaves none `open` (section 6).

### 5.3 A reused native request ID

A request of a later generation that reuses a native request ID of an earlier generation is another request, recorded and `open`. A response names its request's generation through the key, so a response to the earlier request never applies to the later one: it fails as that earlier request's state requires (`conflict` when answered, `not-found` when expired or unresolved). No stored answer is copied to a new request. This is how the [G3 plan](../g3-plan.md) row 4 phrase "a reused native request ID under another provider generation rejected" is read: the later request is accepted, and a response or stored answer of the earlier generation is rejected (agent harness port contract section 7.3).

### 5.4 Delivery reports

`recordDeliveryReport(session, key, report)` records the host's one report of delivering a consumed response through the port: `delivered` when the port returned success, `refused` when it returned `conflict` or `not-found`, and `delivery-uncertain` when a timeout or crash left the outcome unknown. An unknown request fails with `not-found`; a request that is not `answered`, or whose delivery is no longer `pending`, fails with `precondition-failed`. Nothing is resent, whatever the report (architecture section 7).

### 5.5 Reads for the inbox

`requestsAwaitingAnswer(session)` lists the session's `open` requests, in recording order; the inbox source shows its permission and input requests as items, and the host answers delegation requests (item 38). `uncertainDeliveries(session)` lists the `answered` requests whose delivery is `delivery-uncertain`. After a restart, an `unresolved` request closes its inbox item (`closed`, product ports contract section 4.1), and only a `delivery-uncertain` response opens an acknowledgement item, because its answer may have run an action. The product ports contract lists no acknowledgement item kind in G3; the inbox source of item 13 adds it.

| Request state | Meaning |
| --- | --- |
| `open` | Recorded, awaiting its answer |
| `answered` | Its response consumed; its delivery is `pending`, `delivered`, `refused`, or `delivery-uncertain` |
| `expired` | Its turn ended first; final |
| `unresolved` | Its generation ended first; final (section 6) |

## 6. Reconciliation at a generation's end

When a generation ends, through `endGeneration` or `endBoundAttempt`:

- each of its `open` requests becomes `unresolved`;
- each `answered` request of it whose delivery is `pending` becomes `delivery-uncertain`;
- each of its `delivered` turns becomes `outcome-unknown`.

These states are final. They are shown, and they lead to no answer, no resend, and no new turn: a retry of an `outcome-unknown` turn with its idempotency key returns it unchanged, and a new attempt at the same text needs a new key and is a new turn. A request of the next generation is a new request for a fresh decision. Queued turns stay queued for the next generation (agent harness port contract sections 5 and 6; architecture invariant 14).

## 7. Output stream and cursor

`appendOutput(session, output)` records the port's `output` event from its turn, generation, and text, at the next session-wide position, from 1 without gaps. Text outside its bound fails with `invalid`; an unknown turn fails with `not-found`; a generation that is not running, or a turn that is not `delivered` in it, fails with `precondition-failed`. After these checks, an empty text records no entry, takes no position, and returns the session unchanged, since it carries nothing to show; the port allows an empty `output` event (agent harness port contract section 2, bounds table).

The session retains a window of its latest entries of at most `OUTPUT_RETENTION_BYTES`, 10,485,760 bytes (`10 MiB`) of UTF-8 text, the [operational targets](../operational-targets.md) bound of the live session stream buffer per active attempt. Appending drops the oldest entries until the window fits; positions are never reused. Because every retained entry holds at least one byte, the window holds at most `OUTPUT_RETENTION_BYTES` entries.

`readOutputAfter(session, cursor)` takes a cursor, `0` before any output or the position of the last entry the reader holds. A cursor that is not a safe integer from 0 to the last position fails with `invalid`. A cursor at or after the position before the earliest retained entry returns `entries`, the retained entries after it in order. An older cursor returns `cursor-expired` with the earliest retained position, and the reader falls back to a durable snapshot, which item 14 provides (architecture R14).

## 8. Limit and handoff

A session is stopped by a turn that ends as `account-limit-reached` (section 4.3) or by `recordLimitSignal(session, signal)`, the port's `limit` account signal of the session's slot with its `resetsAt` when known. A later signal records a reset time that the stop does not have yet; otherwise it changes nothing. `isStopped(session)` tells whether the session is stopped. A stopped session accepts no new attempt, turn, delivery, or generation; outcomes, requests, responses, delivery reports, and output of its running turn are still recorded.

`writeHandoff(session, evidence)` records the handoff once the stopped session's generation has ended, so that its unresolved requests are final. The host writes it; no agent-written text is in it. It holds:

| Field | Value |
| --- | --- |
| `sessionId`, `taskId`, `harness` | The stopped session, its task, and its harness |
| `resetsAt` | The reset time of the limit signal, when one carried it |
| `lastTurnWithOutcome` | The `TurnId` of the turn of the highest position that is `ended`, when there is one |
| `unresolvedRequests` | The keys of the session's `unresolved` requests, in recording order |
| `evidence` | The `EvidenceReference` of the host's evidence snapshot of the timeline |
| `takenBy` | The session that took it, once taken |

A session that is not stopped, or whose generation runs, fails with `precondition-failed`; a second write fails with `conflict`.

`takeHandoff(stopped, taker)` gives the stopped session's handoff to the next session of its task, once, and returns the stopped session with `takenBy` set. A session without a handoff fails with `not-found`; a taker of another task, the stopped session itself, and a second take fail with `conflict`. Which harness and slot the next session runs on is the account pool's `after-limit` selection (account pool contract section 4.4), and the prompt it receives is item 18's.

## 9. Required tests

This item adds, through `make`, unit tests of the domain in `packages/modules/execution/test/`, written first and run failing before the domain existed, for every requirement of the `session-turn-model` specification and every failure of sections 2 to 8.

The items that build on it add:

- Item 13: persistence of sessions with a uniqueness of an attempt across a task's sessions, a request committed before any read shows it or any event publishes it, a submission retried across a restart that creates no second turn, a response consumed once across concurrent answers, and the reconciliation of section 6 applied at a restart, with the crash points of each path.
- Item 18: the host tests that the agent harness port contract section 11 lists, through this timeline.
- Item 14: a reader whose cursor expired falls back to a durable snapshot.

## 10. Not in this contract

- Persistence, the session timeline service, and crash points (item 13); the wire schemas and AsyncAPI messages (item 9); the UI event stream and durable snapshots (item 14); the harness host and its calls to the port (item 18).
- The inbox items themselves, including the acknowledgement item kind (item 13 and the [product ports contract](product-ports.md) section 4).
- The account pool's selection of the next session's harness and slot, and the slot's cooldown (items 5 and 12).
- Delegation admission and the child's session (item 38).
- The prompt that the next session receives from a handoff (item 18).
