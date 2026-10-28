## Why

G3 item 13 (`implement-session-timeline`, [G3 plan](/docs/g3-plan.md) row 13) turns the pure session timeline domain of item 4 ([session timeline contract](/docs/contracts/session-timeline.md)) into durable state: a session's turns, native requests, responses, and output must survive a crash and a restart, a retried submission must never create a second turn, a response must be consumed once across concurrent answers, and a native request must be committed before any read shows it. Item 13 is on the longest dependency chain of G3 (3, 4, 9, 13, 18), so the change stays tight.

## What Changes

The scope below is the design's proposal; the coordinator's answers to the questions of `design.md` settle it before any implementation code.

- Domain: the turn state `refused` and the operations `recordTurnAcceptanceUnknown` and `recordTurnRefused` of the session timeline contract sections 4.4 and 4.5, which the 9d obligations assign to item 13, and the hold of `nextDeliverableTurn` while an unknown turn's generation runs.
- Execution ports: a session timeline store with one `SERIALIZABLE` transaction per change, its in-memory adapter, and a shared conformance suite.
- Application service in `@taskelith/execution`: session opening, attempt binding across a task's sessions, turn submission and response consumption with client idempotency keys checked by a keyed digest of the input, request recording committed before display, the host's reports applied through the domain, and reads.
- PostgreSQL adapter: the session timeline tables in their own numbered migration, an attempt unique across all sessions, the idempotency key tables, and the crash points `SessionTimelineCommit.before` and `.after`.
- Tests: domain unit tests, the conformance suite on the in-memory store and on PostgreSQL 18.6, PostgreSQL-backed race and idempotency tests, and `SIGKILL` crash tests, each written first and run failing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-turn-model`: requirements for the durable timeline service.
- `postgres-state`: requirement for the session timeline tables.

## Impact

Private workspace packages `@taskelith/execution` and `@taskelith/postgres`; commit type `chore`. No published package content, no new third-party dependency, no wire operation beyond what 9b and 9c define, no UI. The wire adapters and the worker messages are proposed as sub-changes 13b and 13c (`design.md`, "Size and split").
