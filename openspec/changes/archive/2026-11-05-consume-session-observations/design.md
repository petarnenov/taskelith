## Context

G3 item 13 is done in sub-changes. 13a and 13b built the session timeline service of the [session timeline contract](/docs/contracts/session-timeline.md) and its persistence; nothing in production calls its host-side operations yet. The [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md), section 12 "Item 13", lists what item 13 owes on the wire. This change, 13c1, does the reading half of it: the schema tables, the control plane's protocol window, and the observations of section 9 applied through the timeline.

Before this change the NATS adapter's tables named only the three G2 commands and the fourteen G2 observations, so a session observation was quarantined as an unknown type, and `ObservationService` left an observation of a type without an effect unconsumed.

## Goals / Non-Goals

**Goals:**

- Every session message of section 9 passes the NATS adapter's schema check.
- The control plane negotiates within versions 1 to 2.
- Each session observation changes its session through the timeline operation that section 9 assigns it, in the observation's transaction, after the recovery epoch check, and only when its producer owns the session's attempt.
- A refusal changes nothing, is confirmed, and is visible as evidence.

**Non-Goals:**

- The session commands the control plane writes, their `commandId`, and the check of a request's classified operation (13c2).
- Revealed credentials in the output redactor (13c3).
- Session lifecycle wiring: no production caller of `openSession`, `bindAttempt`, `endBoundAttempt`, or of a version 2 placement is added (item 18). The tests open and bind sessions directly.
- The worker's side, any effect of the messages of items 21 and 38, any HTTP or UI change, and any contract text.

## Decisions of the coordinator (2026-11-05)

The coordinator (Niki) decided these in the brief; this change applies them.

- **The split.** 13c is three sub-changes done one after another: 13c1 `consume-session-observations` (this change), 13c2 `write-session-commands`, 13c3 `redact-revealed-credentials-in-session-output`. **Promotion guard:** 13c3 lands on `dev` before item 18 and before any promotion from `dev` to `main` that carries 13c1, because 13c1 makes a worker's output reachable while redaction is by shape only. `docs/g3-plan.md` row 13 records both.
- **Q1 (a), the window.** `@taskelith/contracts` exports a control plane window, `CONTROL_PLANE_PROTOCOL_VERSIONS`, of versions 1 to 2. `SUPPORTED_PROTOCOL_VERSIONS` stays the worker's window of version 1, which `apps/worker` and the worker's reader in the NATS adapter keep using. The control plane uses the new constant at enrollment and in the two observation effects that set a worker's protocol version.
- **Q4, lifecycle wiring.** `openSession` at placement, `endBoundAttempt` at the attempt's outcome, the version 2 placement, and the offer's session binding go to item 18 as its first sub-change. `docs/g3-plan.md` rows 13 and 18 record it.
- **Q6, refusals.** A session effect maps every refusal of the timeline that is no repeat, `invalid` included, to an evidence log `execution.observation.evidence` and an ok result in the same transaction, so nothing is redelivered until quarantine. The G2 log `execution.observation.rejected` of the other observations is not renamed.
- **Q9, the tables.** The messages of items 21 and 38 (`execution.scm-credential.refreshed`, `execution.scm-credential.adopted`, `execution.scm-credential.not-adopted`, `session.delegation-result.deliver`) stay out of the tables until those items, so none is silently discarded. The two observations are quarantined as an unknown type. The two commands are version 2 messages: the worker's reader answers an unsupported version before it looks for a schema, so a version 1 worker passes one with its stable part and rejects it (`execution.command.rejected`), as it does a session command; only one sent at a version the worker supports is quarantined as an unknown type. The table test names these four instead of filtering by a marker.

## Decisions of this change

### One effect shape for the ten observations

`session-observation-effects.ts` holds one function, `sessionEffect`, and one small report builder per observation type. A report is the timeline call the payload asks for (`apply`) and whether the session already holds the reported fact (`isHeldBy`). `sessionEffect` checks ownership, applies the report, and classifies the result. The alternative, ten hand-written effects, would repeat the ownership check and the refusal mapping ten times.

The effects are registered in `OBSERVATION_EFFECTS` through `eachAtCurrentEpoch`, which wraps each in the G2 gate `atCurrentEpoch`. The gate is applied at registration, in `observation-effects.ts`, so the session file imports only types from it and there is no import cycle; and no session effect can be registered without the gate.

### The timeline is bound per transaction by the composition

`ControlPlaneTransaction` gains `sessionTimeline`, the stores the Postgres transaction already had. `ObservationService` takes `timelineOver`, a function that binds a timeline service over those stores, and puts the bound service in the effect's context. The composition passes `AgentSessionServices.timelineIn`, which builds the service with the same clock, identifiers, and logger as the HTTP path. The service's own `transaction` call then runs inside the observation's transaction, so the inbox entry, the cursor, the timeline change, and the confirmation commit together. The alternative, constructing the service inside the application layer, would pull the service's construction details (identifier sources, audit) into `ObservationService`.

### Ownership

An observation changes a session only when all three hold; otherwise it is evidence with a reason:

1. the session exists (`session-unknown`);
2. the session's active bound attempt has the observation's `attemptId` and `ownershipGeneration` (`attempt-not-current`);
3. `producers.heldGenerations(worker, attempt)` includes that generation (`attempt-not-held`).

The third check is the one the G2 effects use for an attempt's observations. The second is what keeps a worker that holds some other attempt from writing this session.

### Refusal, repeat, and failure

The timeline refuses with `invalid`, `not-found`, `conflict`, or `precondition-failed` (session timeline contract, section 2). Its stores fail with the same codes, some after the service wrote: `recordRequest` holds the idempotency key, replaces the session, and appends its events before `items.add`, which answers `conflict` for an item that exists. A code alone therefore names no refusal (review pass 1, finding 1; the first version of this section wrongly assumed that every such failure precedes the writes).

`ObservationService` gives the bound timeline its transaction's stores through `WatchedTimelineStores`, which notes every store call that failed and every call that is not a known read. A table names each call of each store as a read or a write, and the compiler checks it against `SessionTimelineTransaction`, so a new store call does not compile until it is classified; at run time a call the table does not name counts as a write. A failure of a report is a refusal only when its code is one of the four and the stores are untouched: no call failed and none wrote. Then nothing of the timeline is in the transaction, so applying the observation without effect leaves nothing half-written, and the transaction commits the inbox entry and the cursor. The rule: nothing the timeline wrote survives an observation that is answered as evidence.

Every other failure is returned, so the transaction rolls back and the observation is delivered again: any other code, any failure of the ownership reads, and any failure after the stores were touched. The last is returned as `internal` when it carries one of the four codes, because `ObservationService` would confirm a `conflict`, `not-found`, or `precondition-failed` as a G2 rejection; its details keep the session and the original code, never the store's message.

Every operation the effects call writes, so each can fail after a write. The eight that go through the service's one change path (`startGeneration`, `endGeneration`, `deliverTurn`, `recordTurnOutcome`, `recordTurnAcceptanceUnknown`, `recordTurnRefused`, `recordDeliveryReport`, `recordLimitSignal`) replace the session and then append its events and add or settle its items; one that ends the live turn clears the held output tail before that. `recordRequest` holds its key first, and `appendOutput` writes the held tail first. Each computes the domain's answer before its first write, so a domain refusal leaves the stores untouched. Two domain calls follow a write. The change path applies the change again to the session with the released tail after `tails.clear`; it cannot refuse, because the same change already succeeded on a session that differs only in its output. `appendOutput` appends the released text after `tails.put`; it cannot refuse, because it repeats the check of the output's turn made before the write, on the same session, with text already split to the bound. If either ever refused, the refusal would be returned as a failure, since a store wrote.

The inbox already drops a redelivery with the same `observationId`. A repeat here is the same fact under an identity the inbox has not seen, which a worker that lost its state can send. Per operation:

| Observation | Repeat, applied without a log |
| --- | --- |
| `session.generation.started` | the session holds that generation and the same native session identifier |
| `session.turn.delivered` | the turn is `delivered` or `ended` in that generation |
| `session.turn.ended` | the turn is `ended` in that generation with the same outcome and failure |
| `session.response.delivery-reported` | the request is answered with the same delivery report |
| `session.turn.acceptance-unknown`, `session.turn.not-delivered` with `turn-invalid` | the timeline itself answers the same state as ok (contract 4.4, 4.5) |
| `session.request.recorded` | the timeline itself answers an equal recording as ok |
| `session.generation.ended` | the timeline itself answers an ended generation as ok |
| `session.output.appended` | none: the inbox keeps a chunk's identity from being appended twice |
| `session.limit.signaled` | none: the operation does not refuse |

A contradicting report, for example a second outcome that differs from the stored one, is not a repeat and is logged.

### Outcome and log

A refused session observation has the outcome `applied` in `ObservationService`, like the G2 observations that `atCurrentEpoch` keeps as evidence: it was consumed, confirmed, and holds its sequence. The log record names `observationType`, `sessionId`, `reason`, and for a timeline refusal its `code`, beside the worker, the observation, and the correlation. An ownership refusal has no `code`. The epoch gate's record is the G2 one: `observationType`, `recoveryEpoch`, `currentEpoch`, and `quarantined`, without a session or a reason. None holds the payload's text or the failure's message, which may quote it (worker messages contract, section 10 rule 5).

### `session.turn.not-delivered`

Only the reason `turn-invalid` reaches the timeline, as `recordTurnRefused`. With `port-refused` or `generation-not-running` the turn stays queued and the observation is confirmed with nothing to apply, after the same ownership check.

## Risks / Trade-offs

- **A worker that declares version 2 before item 18.** With the window at 1 to 2, a worker whose window reaches 2 gets the protocol version 2, and the control plane has no session binding to put in a version 2 offer yet. No such worker exists: `apps/worker` declares version 1. Item 18's first sub-change closes it (Q4).
- **A late report after the bound attempt ended.** The ownership check requires the active bound attempt, as the brief states it. A report that arrives after the attempt's bind ended, for example a late `session.turn.acceptance-unknown`, is evidence with `attempt-not-current` and does not reach the timeline. Without lifecycle wiring nothing ends a bind in production, so this is not reachable yet. See "Open questions".
- **Output continuity.** `session.output.appended` carries a `chunk` number, and `session.limit.signaled` a `generation`; the timeline holds neither, so a gap in chunks or a signal of an old generation is not detected here.
- **Request operation.** The `operation` of `session.request.recorded` is read by the schema and ignored by the effect; 13c2 checks it against the task branch and records it.
- **Cause and reason.** The `cause` of `session.generation.ended` and the `reason` of `session.turn.acceptance-unknown` are read by the schema and ignored by the effects: the timeline's `endGeneration` and `recordTurnAcceptanceUnknown` take neither, so the timeline holds neither.
- **Store conflicts.** A store `conflict` raised by a concurrent writer surfaces under SERIALIZABLE as a serialization failure of the transaction, which is retried; the race tests cover a person's turn against an observation. One the store returns, for example for a row that already exists, is a failure that rolls back and is delivered again until quarantine, never evidence ("Refusal, repeat, and failure").
- **A refusal's code from the ownership reads.** The effect returns a failure of `sessions.get` or `heldGenerations` as it is. The adapters answer a missing row as ok and fail with `unavailable` or `internal`, so no refusal's code is expected there; one would be confirmed as a G2 rejection without effect, with nothing written.

## Open questions

- **Late reports after the bind ended** (for item 18's first sub-change, which adds `endBoundAttempt`). Options: (a) keep the active-bound-attempt rule, so every report after the end is evidence; (b) accept a report whose attempt is the session's last ended bind, at its ownership generation, for the operations the timeline allows after an end. Recommendation: (a) until item 18 shows a report that must land after the end, because (b) widens who may write a session.

## Follow-ups

- **Log name drift.** The worker messages contract, section 9, calls a refused observation "evidence", and the code logs a G2 observation that its effect refuses as `execution.observation.rejected`. This change leaves that name (Q6). A later change aligns the contract and the code.
- **Lifecycle wiring (Q4)** to item 18's first sub-change, with the version 2 placement and the offer's session binding.
- **13c2** `write-session-commands` and **13c3** `redact-revealed-credentials-in-session-output`, with the promotion guard above.
- **Items 21 and 38** add their four messages to the tables with their effects.
