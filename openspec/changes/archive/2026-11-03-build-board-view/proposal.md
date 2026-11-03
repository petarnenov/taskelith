## Why

G3 item 29 (`build-board-and-task-detail`, `docs/g3-plan.md`, row 29) builds the SPA's landing page and the task detail. The coordinator Niki split it on 2026-11-03 (brief question Q1, answer (b)) so that each change stays reviewable: this change, 29a `build-board-view`, builds the board, its states, the project picker, the routing of an expired session, and live updates; 29b `build-task-detail` builds the task detail. The server side has landed: items 11a (`listProjects`), 14 (`streamProjectEvents`), and 15a and 15b (`readBoard`, `card-changed`, `board-changed`), so until now the board was only the empty `PlannedPage` of 28b.

## What Changes

- Board at `/app/` (`apps/web/src/board/`): the six columns in lifecycle order under short labels, with Accept and integrate as the merge gate between Review and Archived; each card names its native step or "platform-managed", its stage state, gate, wait, placement obstacle, task end, merge gate state, open inbox items, and its session activity indicator, which spins only while the harness works and never under reduced motion.
- Board states: loading, first run (a Mantine Alert that names how a project is created today, with no link to an unbuilt screen; decision Q3), empty, load error without task data and with a retry, no access and unknown project, live updates lost with the time of the last known state, no workers online, and read-only.
- Project picker in the header (28b deferred it to item 29) from every page of `listProjects`, kept per browser; below Mantine's `sm` breakpoint it moves into the navbar.
- Live updates: `streamProjectEvents` after the snapshot's `position`; events not above the view's position are skipped; `resync`, `stream-ended`, an unreadable event, or a stream that closed for good read the board again.
- Session routing (28b follow-up): a 401 `unauthenticated` answer of any board request shows the sign-in page with the expired notice through the new `expiryOfRequest` of `SessionProvider`, bound to the session view under which the request started.
- Task detail route reserved at `/app/projects/:projectId/cards/:runId` (decision Q2): its empty page names change 29b; no card links to it yet.
- Contrast test: the pairs the board draws (gray alert, text and dimmed text on a card, dot badge text).
- Records: the plan row's sub-changes and the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA project board", "Web SPA project picker", "Web SPA board states", "Web SPA live board updates", "Web SPA expired session on a request", and "Web SPA task detail route".

No requirement is modified or removed.

## Impact

`apps/web`, a private workspace, its tests, the plan row, and the README; the published `taskelith` package ships no SPA code. No OpenAPI operation, contract document, generated type, control-plane code, or dependency changes: every operation the board uses already exists in `control-plane.openapi.json` 0.4.0. Out of scope: the task detail (29b), project setup screens, the "Needs you" inbox and its count (item 32), new task (item 30), the agent session screen (item 31), and the audited reconciliation of an uncertain process, which only shows its state.
