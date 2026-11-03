## Why

G3 item 29 (`build-board-and-task-detail`, `docs/g3-plan.md`, row 29) builds the SPA's board and the task detail. The coordinator Niki split it on 2026-11-03 (brief question Q1, answer (b)): 29a `build-board-view` landed the board (#433, `d3dd09ed`) and reserved the task-detail route with an empty page; this change, 29b `build-task-detail`, builds the task detail on that route. The server side is in `dev`: `readTaskDetail` (15a, #431), with inbox answers already served (15b, #432); traceability stays `[]` until item 25.

## What Changes

- Task detail at `/app/projects/:projectId/cards/:runId` (decision Q2): a Mantine `Drawer` over the board of that project, routed as a child of the board, so a reload or a link keeps it and the board stays mounted under it; closing it leads to `/app/`.
- Its content from `readTaskDetail` (`apps/web/src/board/`): the card's step, column, and session; why the card does not move (its wait, placement obstacle, the reasons of blocked gates, a task end); every stage in graph order with its gates, their states, stale included, and the evidence each needs; traceability with evidence freshness, or an honest empty state; the run binding; and the run's tasks in admission order with admission, ownership generation, delegation, session indicator, obstacle, and task end.
- Its states: loading, a failure with a retry and no task data (unreachable, no access with the role a 403 names, unknown card, an ended session), and the time of its state while the board's live updates are lost.
- Live updates: the open detail is read again when the 29a board feed shows a new state of its card above the detail's position, one read at a time.
- Carried 29a follow-ups (Niki, 2026-11-03): the address's project becomes the chosen one in the picker, and choosing another project closes the detail; the shell's session check leaves its `Loader` out under reduced motion through the 29a loading status, now shared as `LoadingStatus`, with its own test; each board card's title links to its detail.
- A 401 `unauthenticated` answer of `readTaskDetail` shows the sign-in page with the expired notice, through the 29a `expiryOfRequest` routing.
- Contrast test: the card title link on a card.
- Records: the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA task detail", "Web SPA live task detail", "Web SPA loading status", and "Web SPA task detail address", and removes "Web SPA task detail route", whose empty reserved page the new address requirement replaces.

## Impact

`apps/web`, a private workspace, its tests, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: `readTaskDetail` is in `control-plane.openapi.json` 0.4.0. Out of scope: answering inbox items (item 32), new task (item 30), the agent session screen (item 31), and `listAgentSessions` (design, "Agent sessions").
