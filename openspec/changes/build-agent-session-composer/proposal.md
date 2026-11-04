## Why

G3 item 31 (`build-agent-session-screen`, `docs/g3-plan.md`, row 31) builds the SPA's agent session screen. The coordinator Niki split it on 2026-11-04 (brief question Q9): 31a `build-agent-session-timeline` (landed in `dev` `743f4661`, #440) built the read-only screen with its turn timeline, cursor reconnect, and activity indicator; this change, 31b `build-agent-session-composer`, adds the composer the product UI "Product screens" requirement asks for ("an agent session screen whose composer stays visible"), the `submitTurn` operation, and the turn retry by idempotency key of architecture R29. The server side is in `dev`: `submitTurn` of item 13 (`control-plane.openapi.json` 0.5.0, `POST /projects/{projectId}/agent-sessions/{sessionId}/turns`), which records a turn once per key and answers a repeat as a duplicate.

## What Changes

- The session gateway also returns a getter of the session's CSRF token (decision Q1), which `main.tsx` hands to the board gateway, so `submitTurn` carries `X-CSRF-Token`; the token stays in the session adapter's keeper, read at send time, and never enters React state, a context, the DOM, a storage, or a log. The `Session` context gains `refresh`, a read of the session that renews the keeper's token after a 403 for a stale one.
- The `BoardGateway` port gains `submitTurn(projectId, sessionId, submission)` with a result per documented answer: a recorded or duplicate turn, key reused (409), session stopped (422), the CSRF refusal (403 `csrf-token-invalid`), invalid (400), and the read failures (401, 403 with its role, 404, no answer, 5xx, undocumented); `BoardServices` routes a 401 `unauthenticated` into the session's expiry as for the reads.
- A composer that stays visible at the end of the session page (sticky, decision Q9): the message, trimmed, 1 to 65,536 characters (decision Q8) with a counter near the limit; each send mints its own idempotency key (`crypto.randomUUID()`, decision Q2) and keeps `{key, text, sentAt}` in `sessionStorage` per session through a storage adapter with an in-memory fallback (decision Q4), so a retry after a reload sends the same key; the records of every session are dropped once the shell is signed out.
- Honest submission states: sending; not sent with a retry of the same key; already recorded for a duplicate, naming the turn; key reused; session stopped; session not found; refused for a 400; the role a 403 names; and, after a 403 for the CSRF token, one session re-read and resend, with a second refusal shown (decision Q3). The turn of a 201 or 200 shows in the timeline at once and once (decision Q10).
- The composer takes no turn, saying why, while the session loads or failed, while it stopped at an account limit, while a turn is being sent, and after a 403 names the role, but still does while the worker is unreachable or the process state is uncertain (decision Q6); no loader spins under reduced motion.
- Records: the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA agent session composer", "Web SPA turn submission states", and "Web SPA turn retry records".

## Impact

`apps/web`, a private workspace, its tests, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: `submitTurn` and every state the composer shows are in `control-plane.openapi.json` 0.5.0. Out of scope: the output tail (follow-up of 31a), native requests and the inbox (item 32), new task (item 30), and an unsent draft that survives a reload (decision Q5).
