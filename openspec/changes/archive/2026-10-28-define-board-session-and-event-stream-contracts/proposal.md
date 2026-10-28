## Why

[ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6 makes every HTTP API contract-first, and [architecture section 11](/docs/architecture.md#11-spa-authentication-and-live-traffic) requires HTTP for commands and paged queries and server-sent events with a durable cursor and catch-up for UI updates. G3 item 9 ([G3 work plan](/docs/g3-plan.md) row 9) owes the board, task, and inbox views, sessions and turns, approval responses, and the SSE stream with its durable cursor and resynchronization before items 13 to 15 implement them. The [product ports contract](/docs/contracts/product-ports.md) section 8 and the [session timeline contract](/docs/contracts/session-timeline.md) section 10 leave their wire mapping to item 9.

The coordinator split item 9 on 2026-10-28. This change is sub-change 9b, size L, in the control-plane document that 9a created. It also carries two follow-ups of item 4: the inbox item kind that acknowledges an uncertain delivery, which the session timeline contract section 5.5 requires and which the product ports contract did not list, and commit-before-display as a wire rule.

## What Changes

- `packages/contracts/documents/control-plane.openapi.json` 0.2.0 gains 17 operations: `readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, `answerInboxItem`, `listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, `submitTurn`, `listAgentSessionRequests`, `respondToNativeRequest`, `readAgentSessionOutput`, and `streamProjectEvents` for a project, and `readInstallationInbox`, `readInstallationInboxCounts`, `answerInstallationInboxItem`, and `streamInstallationEvents` for the installation scope, with their schemas, the `ProjectEvent` and `InstallationEvent` unions, and typed conflicts and refusals. They reuse 9a's schemes and failures.
- The inbox item kind `delivery-acknowledgement`: in the product ports contract section 4.1, in `NEEDS_YOU_KINDS` and `NeedsYouAnswer` of `@taskelith/execution`, and in the wire.
- `docs/contracts/control-plane-wire-contracts.md` gains sections 8 to 10 (views and inbox answers, agent sessions, event streams) and the updated roles, pages, secrets, versioning, and follow-ups; the session timeline contract section 5.5 no longer says that item 13 adds the acknowledgement kind.
- Contract tests for the new operations, events, and vocabularies, with the 9a tests' helpers in one module.
- Spec deltas: `control-plane-wire-contracts` and `product-ports`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-wire-contracts`: the board, inbox, agent session, and event stream operations, the event position rule, the stream cursor and resynchronization, and the roles and pages that cover them.
- `product-ports`: the `delivery-acknowledgement` item kind and its answer.

## Impact

The private packages `@taskelith/contracts` (one document, tests) and `@taskelith/execution` (one port constant and type, one test), and documentation. No adapter, handler, route, or published package content; `execution.openapi.json` and the AsyncAPI documents are unchanged, so their versions stay. Items 13, 14, and 15 implement the operations, and 9d reuses the session schemas.
