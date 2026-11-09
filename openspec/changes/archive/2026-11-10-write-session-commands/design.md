## Context

G3 item 13 is done in sub-changes. 13c1 applied the host's session observations through the timeline; 13c2 writes the commands that drive the host. The [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) section 3 names two: `session.turn.deliver` for the turn that `nextDeliverableTurn` returns, and `session.response.deliver` from the transaction of `consumeResponse`, with one `commandId` per turn and generation and per consumed response. Section 9 names the classified operation check. No session can yet reach a command in production: the lifecycle wiring (`openSession` at placement, `bindAttempt`, version 2 placement, the offer's binding) is item 18. So this change is verified by tests, and the records say so.

## Goals / Non-Goals

**Goals:**

- Each change that makes a command due writes it in its own transaction, before the session write that stores its ID.
- One derived `commandId` per turn and generation and per consumed response, stored with the record.
- A command that no worker can read writes nothing, and a turn stays deliverable.
- A standing rule answers only a push to its task's branch, in the consuming transaction.

**Non-Goals:**

- `session.delegation-result.deliver` (item 38), `execution.scm-credential.refreshed` (item 21), revealed credentials in the redactor (13c3).
- Session lifecycle wiring, the version 2 placement, the offer's session binding, and the worker's side (item 18).
- HTTP, UI, wire schemas, and contract text other than the session timeline's sections 2 and 5.2.

## Decisions of the coordinator (2026-11-10)

The coordinator decided these in the brief; this change applies them.

- **One writer.** `#written` of `SessionTimelineService` is the one place every timeline change passes. It calls `#withDueCommands`, which calls the pure domain function `dueCommands`, appends each command through `tx.commands`, and stores the IDs before `tx.sessions.replace`. The rule stays in the domain; the service only sequences it.
- **Optional fields, no migration.** `Turn.deliveryCommands` (`{generation, commandId}` entries) and `ConsumedResponse.commandId` are optional fields of the JSON record the session row already holds.
- **Q1, no resend trigger.** No resend operation is added. A re-evaluation finds the stored ID and writes nothing. The item that introduces a trigger owns it, and it would look up the stored ID and re-append through the outbox as `resendOffer` does.
- **Q2, derived ID.** `commandId` is `c` and a digest over the session, the kind, and the turn with its generation or the request key, as a small `commandIdDigest` dependency. `outbox.event_id UNIQUE` is then a database backstop for a bug that repeats a command; a repeat is `conflict` from the outbox, which rolls the change back.
- **Q3, the task branch digest.** `apps/control-plane` gains only the production dependency `@taskelith/workspace`, for `taskBranchName`. The composition root supplies a local `createHash('sha256')` digest, which is also the `commandIdDigest`. `@taskelith/git-workspace` is a devDependency, for a test that asserts equality with `sha256IdentifierDigest`, so a change to the workspace's digest fails that test and cannot silently drift.
- **Q4, the check is enforced and written down.** The operation check is enforced in `#consumed` and `docs/contracts/session-timeline.md` section 5.2 states it as rule 8, citing worker messages section 9. It restates a binding rule; no document sets a version or changelog rule for contract text edits (see `verification.md`).
- **Rule order.** The operation check is rule 8 and the no-reader `unavailable` is rule 9; both run after the domain's existing rules 1 to 7, in that order, with nothing written before them. A standing rule's answer to an unknown or already answered request gets the codes of rules 2 to 4, not the operation refusal, and a test pins this. This departs on purpose from the design note's placement "before the domain".
- **The check.** For the responder `standing-rule` only: the request's recorded operation must equal `{kind: 'push', ref: taskBranchRef(session.taskId)}`, otherwise `precondition-failed` with `details.reason` `operation-not-matched`, with the request open, no audit, and no command. The domain uses its own structural `{kind: 'push', ref}` type and imports nothing from the ports.
- **Q5.** The check uses `session.taskId`, as worker messages section 9 says. `docs/contracts/product-ports.md` section 5 words it "the card's change", which differs for a delegated child; that wording is a follow-up, not edited here.
- **Q6, a turn with no reader.** A due turn whose attempt has no running assignment, or whose worker has no version or a version below 2, commits with no command and no stored ID, and writes one log line of identifiers (`execution.session-command.no-reader`) through the `commandLog` dependency, as the 13c1 evidence log does. The line is written inside the transaction, so a serialization retry can repeat it, and a later change that re-evaluates the turn can write it again. A later change also writes the command when a reader appeared, because no ID was stored.
- **A response with no reader.** A response is due only on the `open` to `answered` change, so a committed answer with no reader could never be retriggered. It therefore answers `unavailable` and rolls back: the request stays open, the idempotency key is not recorded, and the person can retry.
- **`turn-changed`.** The comparison in `session-events.ts` ignores `deliveryCommands`, so storing an ID on a turn adds no event with an identical wire body.

## Decisions of this change

### The port and the assignment

`SessionCommands.append` answers `written` or `no-reader`, and the service treats them differently only for a turn. The adapter is `PostgresSessionCommands`. It takes the attempt's assignments at the command's ownership generation, `state` not `ended`, reads the worker's protocol version, and calls Scheduling's `appendWorkerCommand`, which `WorkerCommandType` now names for session commands. The adapter reads the worker itself to tell a missing version from a version below 2, which `appendWorkerCommand` would not report; a version 1 command would fail its schema at the worker (`SessionProtocolVersion` is minimum 2). The commands port is on `SessionTimelineTransaction`; `WatchedTimelineStores` lists `commands.append` as a write, so a failed command rolls an observation back.

`MINIMUM_SESSION_COMMAND_PROTOCOL` is a constant in the execution port, equal to `SESSION_PROTOCOL_VERSION` of `@taskelith/contracts`, which a control-plane test pins. Execution has no dependency on `@taskelith/contracts`.

### Identity and addressing

The command's `correlationId` is the session's ID, which is an `Identifier` and stable across a session's commands. The command's `issuedAt` is the service clock, as the session's other writes.

Payloads are built in the domain as plain JSON, without `protocolVersion`, which the adapter adds from the worker's version. A control-plane integration test checks a written message against `TurnDeliveryCommand` and `ResponseDeliveryCommand` of the AsyncAPI document.

### Recorded operation

`RequestRecording.operation` is optional. It is included in the repeat comparison and in the digest of `requestInput` only when present, so the digests of requests recorded before this change stay valid.

### Why a test store grants a reader

The Postgres suites that hold sessions without assignments (`session-timeline`, `session-inbox`, crash points) and `native-answer-rollback` would now get `unavailable` for every response. They use a `commands` port that answers `written`, with a comment saying why; the integration tests of `session-observation` use the real port and a real assignment.

## Risks and follow-ups

- No production path reaches a session command until item 18. Until then the code is exercised by tests only.
- Item 18 places version 2 work; until it does, a real worker has no version 2 and every response of a session that item 18 opened would be `unavailable`, which is the intended refusal.
- `docs/contracts/product-ports.md` section 5 says "the branch of the card's change"; worker messages section 9 says "the task's change"; the check follows the task. Whoever edits `product-ports.md` next should align the wording.
