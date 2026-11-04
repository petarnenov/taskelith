## Why

G3 item 31 (`build-agent-session-screen`, `docs/g3-plan.md`, row 31) builds the SPA's agent session screen. The coordinator Niki split it on 2026-11-04 (brief question Q9): this change, 31a `build-agent-session-timeline`, builds the read-only session screen with its turn timeline, cursor reconnect, and activity indicator; 31b `build-agent-session-composer` adds the composer, `submitTurn`, and the idempotency key. The server side is in `dev` `46cd51b3`: `readAgentSession`, `listAgentSessions`, `listAgentSessionTurns` (item 13, served by `serve-session-timeline-over-http`), and the session event types of `streamProjectEvents` (item 14). The task detail of 29b left the card's agent sessions and the session link to this item (coordinator, 2026-11-03).

## What Changes

- The `BoardGateway` port gains `listAgentSessions`, `readAgentSession`, and `listAgentSessionTurns`, with body checks for every field the screen shows, and its `openEvents` delivers `agent-session-changed` and `turn-changed` events beside the board's (decision Q8); the board feed's reconnect core moves to `live-feed.ts`, shared by the board and the session, with the board's behaviour and tests unchanged.
- The agent session at `/app/sessions/:projectId/:sessionId` (decision Q2), each identifier route-safe as in the task detail address: the session's harness, task, and run link; its running generation, attempt, limit, and handoff; the last window of up to 100 turns from `lastTurnPosition` with a "load earlier" read per earlier window (decision Q5); each turn with its position, author, state, outcome or failure, generation, and text.
- A session feed on the shared core: the session and turn reads, the stream after the lowest of their positions, turn and session changes of the session applied above it, and the board's resync, stream end, and closed-stream rules, so no event is lost or shown twice.
- The activity indicator of the session's task (decision Q1): `readTaskDetail` of the session's run joined by `taskId`, read again on each `card-changed` of the run and each new session snapshot, with the 29a `SessionIndicator`, its worker-unreachable last contact and process-uncertain danger state included.
- The task detail lists the card's agent sessions through `listAgentSessions` with each task detail read and links each task to its sessions (decision Q3); the navigation's sessions page says that a session opens from its task and lists none.
- Honest states: loading lines, failures with the role a 403 names and a retry, no turn yet, a failed earlier read with a retry, the time of the last known state while the live updates are lost, and no spinning loader or indicator under reduced motion; a 401 `unauthenticated` answer shows the sign-in page through the 29a routing.
- Contrast test: a link on the page.
- Records: the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: modifies "Web SPA screen routes" for the sessions page, and adds "Web SPA agent session timeline", "Web SPA live agent session", "Web SPA agent session activity", and "Web SPA agent session address".

## Impact

`apps/web`, a private workspace, its tests, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: every operation used is in `control-plane.openapi.json` 0.5.0. Out of scope: the composer, `submitTurn`, the CSRF token, and the idempotency key (31b), the output tail (follow-up, see the design), native requests and the inbox (item 32), and new task (item 30).
