## Context

Status: phase 1 draft. The decisions below fix what the sources already settle; the open questions at the end need a decision before the contract and the code are written. The draft spec delta follows the recommendation of each open question; a decision that differs changes it.

The Execution module owns sessions, attempts, and approvals ([architecture section 6](/docs/architecture.md#6-hexagonal-architecture)). [Architecture section 7](/docs/architecture.md#durable-chat-turns-and-provider-approvals) sets the rules of the durable session timeline, and R29 ([architecture section 14](/docs/architecture.md#14-acceptance-requirements-and-scenarios)) is the acceptance scenario: retry a user turn, reconnect the UI, restart during a pending native approval, duplicate a response, and reuse a request ID under a different provider generation, preserving correlation and exposing ambiguous native delivery without automatic approval. The merged [agent harness port contract](/docs/contracts/agent-harness-port.md) (item 3) defines generations, host-generated turn IDs, native requests keyed by generation, a single response, and turn outcomes, and leaves the timeline to this item (sections 2 rule 6, 6, and 12). The [capacity reservation contract](/docs/contracts/capacity-reservation.md) section 10 and the [account pool contract](/docs/contracts/account-pool.md) section 3.2 rely on this item for at most one active attempt per session. ADR 0005 decision 4 as amended and the account pool contract section 4.4 require the limit handoff.

G2 item 7 (archived `define-execution-domain-model`) delivered the per-task invariant in `packages/modules/execution/src/domain/task.ts` (`openAttempt`, `activeAttempt`) and excluded sessions as G3 work. The archived `align-harness-identifiers` change moved `HarnessPluginId` into Execution and made Scheduling import it, so Execution must not import Scheduling.

## Goals / Non-Goals

**Goals:**

- A reviewed domain contract and a capability spec that items 9, 13, 14, 18, and 31 build on.
- A pure, harness-neutral domain with unit tests written before it, each shown failing first.

**Non-Goals:**

- Persistence, the application service, and crash points (item 13); wire schemas (item 9); the UI event stream and durable snapshots (item 14); the harness host and its delivery to the plugin (item 18); the account pool's selection of the next session's harness (items 5 and 12); delegation admission (item 38).

## Decisions

Each decision names its source.

1. **Names.** The capability is `session-turn-model`, after the change name and the `*-model` capabilities of the other pure domains (`execution-model`, `scheduling-model`, `sdlc-workflow-model`). The contract is `docs/contracts/session-timeline.md`, because the architecture and the harness port contract call the concept the "session timeline"; the domain files use the same term. Source: `openspec/specs/`; architecture section 7; agent harness port contract section 2 rule 6.
2. **A contract document first.** Items 3 and 5, the sibling contracts of the G3 plan's items 3 to 8, each added a contract under `docs/contracts/` with a spec and port types; G2 item 7, a pure domain without a contract, had only its spec. The G3 plan counts item 4 among the G3 contracts, and item 9 derives wire schemas from it, so this item writes a contract. Source: [G3 plan](/docs/g3-plan.md) "Work items" ("Items 3 to 8 are the G3 contracts"); archived `define-agent-harness-port` and `define-account-pool-contract`.
3. **Module placement.** The domain lives in `packages/modules/execution/src/domain/` and is exported from `@taskelith/execution`. Source: architecture section 6; agent harness port contract section 1.
4. **Reuse, not redefinition.** The model uses the existing `AttemptId`, `PrincipalId`, `IdempotencyKey`, `NativeRequestId`, and `HarnessPluginId` (`domain/identifiers.ts`), `OwnershipGeneration` (`@taskelith/sdlc`), and the port's `TurnOutcome`, `HarnessFailure`, `SessionEndReason`, `PermissionDecision`, `DelegationOutcome`, `HarnessRequestKind`, and `MAX_HARNESS_TEXT_LENGTH`. It adds only what the port carries as plain strings or numbers: `SessionId`, `TurnId`, and `NativeSessionId` as kernel identifiers, and `SessionGeneration` as a positive integer brand parsed like `RecoveryEpoch`. Source: brief; agent harness port contract sections 2 and 5.
5. **No slot in the session.** A session records its `HarnessPluginId`; the slot stays in Scheduling's reservation (`providerCredentials`), which the account pool's affinity reads. Recording a Scheduling slot type would make Execution import Scheduling, the reverse of the dependency `align-harness-identifiers` set. Source: account pool contract section 4.3; capacity reservation contract section 10; archived `align-harness-identifiers`.
6. **At most one active attempt per session.** A session binds attempts one at a time: binding an attempt while its bound attempt has not ended fails with `precondition-failed` and changes nothing, as the task's second active attempt does in `execution-model`. An attempt binds to one session only; binding it to another fails with `conflict`. Source: capacity reservation contract section 10; account pool contract section 3.2; `execution-model` "Task ownership".
7. **Generations.** A session's first generation is 1, and the next one is exactly one more and starts only after the previous one ended. Every turn delivery, request, and response names the generation it belongs to. Source: agent harness port contract section 2 rule 5 and section 5.
8. **Turn identity and idempotency.** A submission carries an `IdempotencyKey`, the author, the text, and a new `TurnId` that the caller generates, since the domain reads no random source. A key is unique per session: a repeat with the same text returns the existing turn unchanged, and with another text fails with `conflict`. A `TurnId` already in the timeline fails with `conflict`. Each new turn takes the next position in the session's turn order, which never changes. Source: architecture section 7; [product ports contract](/docs/contracts/product-ports.md) section 2 rule 7; agent harness port contract section 6.
9. **Serialized delivery.** All turns are treated as mutable, because no harness declares concurrent turns in G3. At most one turn of a session is delivered and not ended; how a submission while one runs is handled is open question 2. Source: architecture section 7; agent harness port contract section 6, "One turn at a time".
10. **One outcome per turn.** A turn records exactly one outcome from the port's `turn-ended` (`TurnOutcome`, with its `HarnessFailure` when `failed`); a second outcome fails with `conflict` and changes nothing. Source: agent harness port contract section 9.1.
11. **Requests recorded before display.** A request enters the timeline only by being recorded, keyed by session, generation, and `NativeRequestId`, with its kind, turn, and text. The only read that lists open requests returns recorded ones, so an inbox item derives from a recorded request. Recording the same key again with the same content changes nothing; with other content it fails with `conflict`. Permission and input requests are displayable; a delegation request is recorded under the same rules and answered by the host (item 38). Source: architecture section 7 and invariant 6; agent harness port contract section 7.1; product ports contract section 4.2.
12. **A response is consumed once.** A response names the request key, the answer, the responder (a `PrincipalId`, or a standing rule use of the product ports contract), and the attempt with its ownership generation. The first valid one is consumed; a second fails with `conflict`; an unknown or expired request fails with `not-found`; a generation that is not the session's current one, or an attempt or ownership generation that is not the session's bound one, fails with `precondition-failed`; an answer of the wrong kind fails with `invalid`. Source: architecture section 7; agent harness port contract section 7.3; product ports contract sections 4.2 and 5.
13. **A reused native request ID is another request.** A request of a later generation with a native ID that an earlier generation used is a different request. A response that names the earlier generation never applies to it, and no stored answer is copied to it. Source: agent harness port contract sections 7.1 and 7.3; architecture section 7.
14. **Delivery of a consumed response.** After consumption the response is `delivered` once the host reports the port's success, `refused` when the port reports `conflict` or `not-found`, or `delivery-uncertain` when a timeout or a crash leaves the outcome unknown. Nothing is resent automatically, whatever the state: marking a response for delivery again fails with `precondition-failed`. Source: architecture section 7 ("a native provider may not offer exactly-once response delivery").
15. **Reconciliation at a generation's end.** When a generation ends, each of its requests without a response becomes `unresolved`, each consumed response not yet delivered becomes `delivery-uncertain`, and a delivered turn without an outcome is reconciled as open question 3 decides. These states are final, are shown, and lead to no resend, no answer, and no new turn. A request of the next generation is a new request for a fresh decision. Source: agent harness port contract sections 5 ("Host restart"), 6, and 7.3; architecture invariant 14.
16. **Output stream and cursor.** Each `output` event becomes an entry at the next session-wide position, from 1 without gaps, tied to its turn and generation. The model keeps a bounded retained window (open question 6). Reading after a cursor returns the retained entries after it, or `cursor-expired` with the earliest retained position when the cursor is older, so that the caller falls back to a durable snapshot, which item 14 provides. Source: architecture section 7 and R14; [operational targets](/docs/operational-targets.md) section 2, "Live session/terminal stream ring buffer".
17. **Limit handoff.** A turn that ends as `account-limit-reached`, or a `limit` signal of the session's slot, stops the session: it accepts no further turn or generation, and it records one handoff. The handoff stays with the task of the attempt bound when the limit came, until a next session of that task takes it, once; a second take fails with `conflict`. Its content is open question 5. Source: ADR 0005 decision 4 as amended; account pool contract section 4.4; agent harness port contract section 4.1; `harness-account-pools` "Session affinity".
18. **Pure and neutral.** The domain reads no clock, random source, file, or network, returns kernel `Result`s for expected outcomes, produces frozen values, and names no harness, vendor, model, or native field. Source: `execution-model` "Pure execution domain"; agent harness port contract section 2 rule 1; architecture section 7, microkernel.
19. **Fail-before tests.** Each requirement's tests are written against exported stubs and run failing before the domain is implemented; `verification.md` records the failing run. Source: ADR 0004; the brief's review checklist ("missing-fail-before-test").

## Open questions

1. **What a session spans.** The board contract's `waiting-for-admission` ("The session waits for its next stage admission", product ports contract section 3.6) implies that a session outlives one task, while ADR 0005 and the brief speak of "the next session of the task".
   - (a) One task: a session binds attempts of one task only, so the per-task invariant also bounds it.
   - (b) One workflow run: a session binds attempts of the run's tasks across stage admissions, one at a time; a delegated child runs in its own session.
   - (c) Leave it open: the model binds attempts without checking their task, and item 13 decides.
   - Recommendation: (b), because the merged board contract already shows a session waiting between stages, and decision 6 holds for it; the handoff then stays with the task whose attempt was bound when the limit came.
2. **A submission while a turn runs.** The composer stays visible (G3 item 31), so a user can submit during a turn.
   - (a) Queue it: the turn is recorded in order and delivered when the running turn ends.
   - (b) Reject it with `precondition-failed`, as the harness port does.
   - (c) Queue at most one turn and reject further ones.
   - Recommendation: (a), because recording keeps the user's text durable and its order, and decision 9 still delivers one at a time; the port's rejection then never fires for a queued turn.
3. **A delivered turn without an outcome when its generation ends.** The harness port says only that the host reconciles such a turn "without an event" and never resubmits it under a new ID.
   - (a) Mark it `outcome-unknown`, final; a user retry with the same idempotency key returns that turn, and a new attempt needs a new key.
   - (b) Mark it `outcome-unknown` and let a user retry with the same key deliver the same `TurnId` in the next generation, where the port's `conflict` shows that the harness saw it.
   - (c) Deliver the same `TurnId` again automatically in the next generation.
   - Recommendation: (a). (c) is an automatic replay that architecture invariant 14 forbids, and (b) would send a possibly executed turn again, since a resumed native session may not hold the turn; a user who wants it again submits a new turn.
4. **An unresolved request in the inbox.** After decision 15 an unresolved request can no longer be answered.
   - (a) Close its inbox item (`closed`, product ports contract section 4.1) and show it as unresolved in the timeline.
   - (b) Keep an inbox item open until a person acknowledges it.
   - (c) Close it, and open an acknowledgement item only for a `delivery-uncertain` response.
   - Recommendation: (c). An unanswered request needs no decision, since the resumed harness asks again; an answer whose delivery is uncertain may have run an action, which a person should see.
5. **The handoff's content.** The limited harness cannot write a summary after its limit, and no source fixes the content.
   - (a) A host-written record: the session, task, harness, the reset time when known, the last turn with an outcome, the unresolved requests, and a reference to an evidence snapshot of the timeline.
   - (b) (a) plus the texts of the session's turns, so the next session's first turn can quote them.
   - (c) Only a reference to the stopped session; item 18 composes everything.
   - Recommendation: (a). It is complete without agent-written text, keeps the model free of large payloads, and leaves the prompt the next session receives to item 18.
6. **The retention bound.** The operational targets set `10 MiB` per active attempt for the live relay buffer.
   - (a) `10 MiB` of UTF-8 output text per session, a parameter of the model.
   - (b) A count of entries per session.
   - (c) Both, whichever is reached first.
   - Recommendation: (a). With at most one active attempt per session, it equals the operational target, and a byte bound covers both many small and few large entries.

## Source notes

- The plan row's "a reused native request ID under another provider generation rejected" ([G3 plan](/docs/g3-plan.md), row 4) is read with the harness port contract section 7.1: the later request is accepted as a new request, and what is rejected is a response or stored answer of the earlier generation (decision 13).
- The agent harness port contract section 4.1 assigns the handoff to items 5, 12, and 18, while the account pool contract sections 4.4 and 10 and the G3 plan row 4 assign it to items 4 and 18. This change follows the plan; correcting section 4.1 is outside its scope.
- Architecture section 7 correlates output with the "attempt generation". The model reads it as the session generation, with the attempt and its ownership generation recorded beside it (decisions 7 and 12).

## Review checklist

From `checklist.json` (dev `1c73e1a7`, size M-L). Review: docs (7), contract-drift (3), naming (2), missing-fail-before-test (1), stale-citation (1). Record quality: evidence-mismatch (71), docs (49), spec-wording (40), stale-citation (29), contract-drift (14), process (14), scope (6). The design answers them with decisions 1, 2, 4, and 19, and the contract, spec, and code are checked against each other before review.

## Risks / Trade-offs

- **Unfrozen harness port.** The port stays at `0.1.0` until a second harness passes its suite in G4; a port change may change this model.
- **Session scope.** If open question 1 is decided otherwise later, the attempt binding and the handoff's owner change; the contract states the choice in one place.
- **Bound measured in the model.** A byte bound needs a UTF-8 length, which the model computes without I/O.
