# Design: build-task-detail

## Context

G3 item 29 (`docs/g3-plan.md`, row 29), sub-change 29b. Its base is 29a `build-board-view` ([archive](/openspec/changes/archive/2026-11-03-build-board-view/design.md)): the `BoardGateway` port, the board feed, the reduced-motion loading line, and the reserved route `/projects/:projectId/cards/:runId`. The server side is `readTaskDetail` of 15a ([archive](/openspec/changes/archive/2026-11-03-implement-board-and-inbox-views/design.md)), product ports section 3.7: one snapshot with `asOf`, `position`, the card, the stages, `traceability` (`[]` until item 25), the run binding, and the tasks in admission order.

**Goals.** The task detail of product UI "Task detail" on its own route as a Mantine Drawer, its states, its live updates through the 29a feed, and the three 29a follow-ups.

**Non-goals.** Answering inbox items (item 32), new task (item 30), the agent session screen (item 31), any OpenAPI or control-plane change, and the audited reconciliation of an uncertain process.

## Coordinator decisions (verbatim)

The item brief of 2026-11-03, "Niki decisions (2026-11-03)":

> - Q2: (a) its own route under the project, opening a Mantine Drawer, so a
>   reload and a link keep it.

The 29b brief, "Carried follow-ups from 29a":

> 1. the project route sets the picker to its project;
> 2. apps/web/src/shell/Shell.tsx:19 Loader honours reduced motion through
>    the 29a helper, with its own test;
> 3. the board's cards link to their detail route.

The item 28 and 29a decisions still hold: no mock data, Mantine only without custom components or style overrides (D17), contrast of at least 4.5:1 tested per drawn pair, and the CSP of 28c.

## Decisions

1. **The port grows one read.** `BoardGateway` gains `readTaskDetail(projectId, runId)` with the 29a `ReadResult`; `control-plane-board.ts` sends `GET /projects/{projectId}/cards/{runId}` through the typed fetch, with the 29a mapping of 401, 403, 404, and other statuses. The view types are the generated OpenAPI types.
2. **Body checked for what the Drawer shows.** `task-detail-wire.ts` checks every field the Drawer renders, reusing the 29a checks of the card, session activity, and obstacle: stages with origin, state, column, and gates (state, required evidence, optional block reason); trace links with their identifier lists and freshness; all eight run binding fields; tasks with identifiers, ownership generation of at least 1, admission, delegation depth 1 to 3, session, obstacle, and a task end whose outcome kind, end time, exit status, or operator evidence is readable. A body that fails, or the detail of another card than the one asked for, reads as `unavailable`. The label test keeps the new records (`EVIDENCE_KIND_LABELS`, `FRESHNESS_LABELS`, `ADMISSION_STATE_LABELS`, `OUTCOME_LABELS`) equal to their OpenAPI enums or `oneOf` constants.
3. **A child route of the board.** `routes.tsx` makes `BoardPage` a pathless layout route with an empty index and `TASK_DETAIL.path` as children, so following a card link keeps the board mounted, its feed running, and nothing read again. `BoardPage` now calls `useLiveBoard` itself, for the chosen project or none, and hands the project and the feed state to its `Outlet`; `useLiveBoard` never returns the state of another project than the one asked for, which the 29a `key` remount used to ensure. `TaskDetailRoute` opens `TaskDetailDrawer`, keyed by project and run; closing it navigates to `/`. `TASK_DETAIL` leaves `PLANNED_SCREENS`, and `taskDetailPath` encodes both identifiers.
4. **The address's project.** `BoardPage` selects the address's `projectId` in `ProjectsProvider` whenever it changes, which also keeps it for the next visit. The selection runs on mount, before `listProjects` answers, so no other project's board is read first. An unlisted project falls back to the first, as in 29a, and the Drawer then shows the `readTaskDetail` failure. The picker, on a task-detail address, navigates to the board when the operator chooses another project, so the Drawer never shows over a board of another project.
5. **Content.** `TaskDetailView` (product ports section 3.7, product UI "Task detail") shows: the card's work type, framework, run, column, step (native identifier or "platform-managed"), stage state, session indicator, and merge gate state; "Why it does not move" with the card's wait, placement obstacle, each gate with a block reason, and a task end, left out when nothing holds the card; "Stages and gates", a table in graph order whose gates are dot badges naming the state, `stale` included, beside the evidence they need; "Traceability", a table of requirement, work items, attempts, and freshness, or the sentence that the control plane records none for the run yet; "Run binding", a row-header table of the eight fields; and "Tasks in admission order" (`TaskList`), an ordered list with each task's run, ownership generation, delegation, admission, session indicator, obstacle, and task end with its attempt outcome and end time. Long identifiers and the digest break every 16 characters through `<wbr>` (`Breakable`), so no table forces sideways scrolling at phone width ("Design rules") and a copy stays unchanged.
6. **States.** The Drawer shows `LoadingStatus` "Loading the task detail…" while the first read runs; a failure with a retry (`LoadError`, now shared with the board) and no task data, naming the role a 403 needs; and, while the board's liveness is `lost`, a notice with the detail's `asOf`. Its title is the card's title once read, "Task detail" before. A 401 `unauthenticated` reaches the session through the 29a `useBoardServices` wrapper, which now wraps `readTaskDetail` too.
7. **Live updates.** `startTaskDetailFeed` (`task-detail-feed.ts`, plain TypeScript) reads the detail and offers `cardChanged(position)`: it reads again only when the position is above the detail's, compared as `BigInt`; one read runs at a time, and the latest change that arrives during a read causes one read after it if the answer is older; a failed read drops the detail, so later changes read nothing until a retry starts a new feed; stopping it drops a late answer. `useTaskDetail` calls `cardChanged` with the board's position whenever the board view holds a new object for the card, which the 29a feed makes on every `card-changed` of it and on every board re-read; a change of another card keeps the object and reads nothing. The detail reads only once the board of its project is shown; without one, as for an unlisted project, it is one snapshot.
8. **Session check loader.** 29a's reduced-motion loading line of `BoardPage` moves to `shell/LoadingStatus.tsx` and also renders the shell's "Checking your session…", which now gains the role `status`; under `prefers-reduced-motion: reduce` (`useReducedMotion`) no `Loader` renders.
9. **Card link.** The card's title is a Mantine `Anchor` with the router's `Link` to its detail; the card stays an `article` named by it. The contrast test adds the anchor color on a card in both schemes; every other pair the Drawer draws (text and dimmed text on the body, dot badges, the indigo and red alerts) is already tested.

## Agent sessions

The item brief lists the card's agent sessions from `listAgentSessions` in the task detail; the 29b brief's scope list does not. Each `TaskView` carries its own `SessionActivity`, so the Drawer shows every task's session indicator from `readTaskDetail` alone, and `listAgentSessions`, which adds harness names, session identifiers, and limits but no activity state, is left to the agent session screen (item 31). This is an open question for the coordinator.

## Proof of concept

The Drawer follows `RunDrawer` and `RunDetail` of `docs/ui-poc/src/screens/BoardDrawers.tsx` (right `Drawer` of size `xl`, sections with `h3`-level titles, the stage table, admission, traceability, and run binding sections). Departures, each required by a requirement or decision ("Reference proof of concept"):

- **Address, not state.** POC: the Drawer opens from local state. It opens from its route (decision Q2).
- **No demonstration flows.** POC: `ReconcileAction`, `RuntimeApproval`, the agent session log, and the "Change framework…" button act on fixtures. No mock data (item 28 decision), no operation of this change acts, and the session screen is item 31.
- **Reasons as a list.** POC: "Why it is not moving" is an orange Alert of one sentence. The answer has several sources (wait, obstacle, gate reasons, task end), listed as text, because Mantine's orange light alert title is 3.62:1 in the light scheme (29a).
- **No "later" badges.** POC: traceability names G3 items 15 and 17 as later. The answer is shown, with an honest empty state while `traceability` is `[]`.
- **Tasks.** POC: one admission line per run. The detail lists every task in admission order, delegated ones included.

## Risks and trade-offs

- The detail is read again on every board re-read (resync, `stream-ended`, a closed stream) whose position is above it, because a new snapshot replaces every card object; the reads are serial and bounded by the board's own re-read limits.
- When the board first shows the card at a position above the detail's, for example after a change of another card, the detail is read once more, because the feed cannot tell which change moved the card.
- A change of the run that does not change its card, if the control plane emits no `card-changed` for it, shows only on the next re-read or a reopen; `card-changed` is the change signal the brief names.
- Choosing a project from the picker on any other page keeps that page; only a task-detail address leads back to the board.
