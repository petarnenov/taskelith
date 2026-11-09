## Why

G3 item 13, sub-change 13c2. The [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) section 12 binds item 13 to write the session commands of section 3 in the transactions that make them due, to store their `commandId` and reuse it, and to check a request's classified operation against the task's branch before a standing rule answers. Until this change the control plane wrote no session command: `nextDeliverableTurn` had no production caller, `consumeResponse` committed with no command, and `session.request.recorded` dropped the `operation` that the check needs.

## What Changes

- `SessionTimelineService` writes `session.turn.deliver` for the turn that `nextDeliverableTurn` returns, in the running generation, and `session.response.deliver` for a newly answered request, in the transaction of the change, through a new `commands` port on `SessionTimelineTransaction`, before the session write that stores the command's ID.
- A pure domain function computes the due commands and derives one `commandId` per turn and generation and per consumed response, a prefix and a digest over the session, the kind, and the turn with its generation or the request key; the session record stores the ID in optional fields, without a migration.
- The Postgres adapter of the port finds the attempt's assignment that has not ended and writes through Scheduling's `appendWorkerCommand`. A turn whose attempt has no such assignment, or whose worker has no protocol version of at least 2, commits with no command and logs one line of identifiers. A response in that state fails with `unavailable` and rolls back, so it can be retried.
- `session.request.recorded` records its classified `operation`; a repeat with another operation is a conflict. `consumeResponse` and `answerItem` refuse a standing rule's answer unless the recorded operation is a `push` to the task's branch.
- `docs/contracts/session-timeline.md` section 5.2 gains the rules 8 (the operation check, citing worker messages section 9) and 9 (no reader), and section 2's table names `unavailable`. `apps/control-plane` gains the production dependency `@taskelith/workspace` for `taskBranchName`, a local SHA-256 digest, and the devDependency `@taskelith/git-workspace` for a test that pins it.

Not in this change: `session.delegation-result.deliver` (item 38), `execution.scm-credential.refreshed` (item 21), revealed credentials in the redactor (13c3), any session lifecycle wiring, the worker's side, HTTP, UI, and any other contract text.

No production path reaches these commands until item 18 adds `openSession` and `bindAttempt`; this change is verified by tests only, with the commands port covered against real PostgreSQL.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-turn-model`: adds the session commands, their identity, the handling of a command with no reader, and the classified operation check, and modifies "Durable session timeline service" for the optional operation in the request digest.
- `observation-consumption`: `session.request.recorded` records the request's classified operation.

## Impact

- `packages/modules/execution/src`: `domain/session-records.ts`, `domain/session-requests.ts`, `domain/session-commands.ts` (new), `application/session-timeline-service.ts`, `application/session-events.ts`, `ports/session-timeline-store.ts`, `adapters/in-memory-session-timeline-store.ts`, `index.ts`.
- `packages/modules/scheduling/src`: `application/capacity-commands.ts`, `index.ts`.
- `packages/adapters/postgres/src`: `session-timeline-repositories.ts`, `postgres-transaction.ts`.
- `apps/control-plane/src`: `application/session-observation-effects.ts`, `application/watched-timeline-stores.ts`, `composition/session-timeline.ts`, `composition/control-plane.ts`; `apps/control-plane/package.json`, `apps/control-plane/tsconfig.json`, `package-lock.json`, the dependency inventory.
- `docs/contracts/session-timeline.md`, and tests of the three packages.
- No published package, AsyncAPI or OpenAPI document, migration, or wire schema changes. All packages touched are private.
