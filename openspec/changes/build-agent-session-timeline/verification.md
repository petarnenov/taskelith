# Verification: build-agent-session-timeline

## Scope and source

G3 item 31 (`docs/g3-plan.md`, row 31), sub-change 31a under the coordinator's split (brief question Q9, Niki, 2026-11-04), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `46cd51b3` (#439): the read-only agent session screen at `/app/sessions/{projectId}/{sessionId}` (decision Q2) with the session's facts, the last window of turns from `lastTurnPosition` and earlier windows on demand (Q5), live updates through the stream cursor on the reconnect core extracted from the board feed (Q8), the activity indicator of the session's task from `readTaskDetail` joined by `taskId` and re-read on `card-changed` (Q1), the task detail's links to each task's sessions through `listAgentSessions` (Q3), the sessions index page, and honest states ([design](design.md), decisions 1 to 10). Out of scope: the composer, `submitTurn`, the CSRF token, and the idempotency key (31b), the output tail (Q4, follow-up), native requests and the inbox (item 32), new task (item 30), and any OpenAPI or control-plane change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `46cd51b3050a1288c07e29ee50a81e6e2f0d9915`, the brief's checklist base and the merge base with `origin/dev`.
- `4dfa3b64` `chore: start the build-agent-session-timeline change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-agent-session-timeline --at 46cd51b3050a1288c07e29ee50a81e6e2f0d9915 --size M` (unedited), and the empty `findings.jsonl` and `passes.jsonl`. The untracked `build-agent-session-screen` change directory of the research step was deleted, and the branch and worktree renamed (Q9).
- `4d1017f4` `test: expect the web agent session timeline, its live updates, the task detail session links, and the sessions index`: the tests, before the implementation.
- `a9679a9d` `chore: build the web agent session timeline with cursor reconnect, the task detail session links, and the sessions index`.
- `0b76df27` `docs: record the build-agent-session-timeline proposal, design, spec delta, and SPA status`.
- `e2c3ce28` `docs: route the build-agent-session-timeline change` (`route.json`, unedited, at head `0b76df27`): "route: elevated (lines, files), rule version 5", 2,357 lines in 28 files, size M; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.60) and agrees; recommendation only, the brief's effort medium applies.
- The first `make verify` of the branch (`verify-31a-1.log`, at an earlier head) failed in `npm run verify:comments` on two three-line comments of `session-model.ts` and `useCardSessions.ts`; both were shortened, and because the branch was never pushed, the implementation, record, and route commits were recreated with the fix (`a9679a9d`, `0b76df27`, `e2c3ce28`) instead of a fix commit, so one route record describes the reviewed diff. `verify-31a-2.log` is the run of the tree of `e2c3ce28`: it passed (tests 4783, pass 4774, fail 0, skipped 9; all files 99.45% lines, 92.81% branches, 98.86% functions) but wrote no stamp, because this file was drafted, untracked, while it ran, so `make record` refused it; `verify-31a-3.log` is the run of the clean tree after this record was committed, which the generated checks below record.

## Environment

macOS 26.6 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 31a scope of the decisions. `git diff 46cd51b3 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. Every operation used (`listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, and the 29a and 29b `listProjects`, `readBoard`, `readTaskDetail`, `streamProjectEvents`, and session operations) is in `control-plane.openapi.json` 0.5.0.
- Board tests unmodified (Q8): `git diff 46cd51b3 HEAD --stat -- apps/web/test` touches only `fakes.tsx` (the three new gateway reads and the session fixtures), `theme-contrast.test.ts` (one pair), and the four new test files; `board-feed.test.ts`, `board-page.test.tsx`, `task-detail-feed.test.ts`, `task-detail.test.tsx`, `control-plane-board.test.ts`, `navigation.test.tsx`, and `screens.test.ts` are unchanged and pass.
- No mock data: the screen renders only `readAgentSession`, `listAgentSessionTurns`, and `readTaskDetail` answers; fixtures live only in `apps/web/test/fakes.tsx`.
- Hexagonal boundaries: screens depend on the `BoardGateway` port; only `control-plane-board.ts` touches the typed fetch; `live-feed.ts`, `session-feed.ts`, `session-model.ts`, and `agent-session-wire.ts` are plain TypeScript without React, tested without a DOM tree.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop; `Timeline`, `Badge`, `Alert`, `Anchor`, `Button`, and `Loader` are Mantine components; a turn's lines are separate `Text` paragraphs and long identifiers break through `Breakable`.
- Design rules: the page scrolls nowhere sideways (identifiers and turn lines break at phone width); the session link, the run link, and the buttons are Mantine anchors and buttons with the theme's 44 px targets; contrast pair of a link on the page added (design, decision 10).
- Spec delta: `product-ui` modifies "Web SPA screen routes" (452 characters) and adds four requirements (495, 493, 496, and 453 characters); `npm run openspec -- validate build-agent-session-timeline --strict` passes, and the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-31a.log`: `openspec validate --specs --strict`, 71 passed), which was then deleted; `npm run verify:archive` passes too.
- Comments: `npm run verify:comments` passes after the fix named under "Revision".
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass; `npm run build --workspace=@taskelith/web` builds the SPA.
- Coverage (Vitest, `apps/web`, 555 tests in 19 files), per file changed or added by this change, as statements, branches, functions, and lines: 100% lines in every file; `SessionPage.tsx` 100 / 94.44 / 100 / 100, `agent-session-wire.ts` 98.52 / 99.12 / 100 / 100, `session-feed.ts` 100 / 96.66 / 100 / 100, `useCardSessions.ts` 94.11 / 83.33 / 100 / 100, `BoardServices.tsx` 96.87 / 75 / 100 / 100 (its one uncovered branch, the missing provider, predates this change), `TaskDetailDrawer.tsx` 100 / 93.54 / 100 / 100, `TaskDetailView.tsx` 100 / 91.66 / 100 / 100, `control-plane-board.ts` 97.43 / 97.18 / 97.29 / 100, `live-feed.ts` 96.62 / 90.47 / 100 / 100, and `session-model.ts`, `session-labels.ts`, `useLiveSession.ts`, `TurnTimeline.tsx`, `SessionsIndexPage.tsx`, `board-feed.ts`, `board-model.ts`, `board.ts`, `useTaskDetail.ts`, `TaskList.tsx`, `screens.ts`, and `routes.tsx` at 100 on every metric; `apps/web` overall 98.86% statements, 97.57% branches, 99.76% functions, and 100% lines, every file at or above the 75% thresholds.
- Test authoring: no sleeps; the feed tests settle held reads and drain microtasks as the 29a feed tests do; the page tests wait on rendered roles and `waitFor`, and the task detail link test answers a new detail per read because the control plane's bodies are new objects.

## Evidence check

The generated part below matches the tree (`make record-check`). It records `verify-31a-3.log` in the session scratchpad; `verify-31a-1.log` and `verify-31a-2.log` are the earlier runs named under "Revision", and no other run was made.

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/38f2ee40-59fa-49d7-b7a0-efd6c305ef14/scratchpad`).

- Base (`fb-31a-base.log`): the tests of `4d1017f4` over the sources of `46cd51b3` (`apps/web/src` stashed): `session-feed.test.ts` and `session-labels.test.ts` fail to resolve their modules; 46 tests of `agent-session-reads.test.ts` and 28 of `session-page.test.tsx` fail; 4 of 19 files fail, the other 459 tests pass.
- Targeted mutations of `a9679a9d`, one at a time, each restored with `git checkout` (script `mutate-31a.py` in the scratchpad):
  - Position rule (`fb-31a-position-skip.log`): `applySessionChange` applies events at or below the view's position: fail 1, "applies the turn and session changes of its session above its position, and skips the rest".
  - Earlier window replaces (`fb-31a-earlier-replaces.log`): an earlier read replaces a turn the stream showed: fail 1, "keeps the newer state of a turn the stream showed, and reads one window at a time".
  - Overtaken earlier read (`fb-31a-earlier-overtaken.log`): an earlier read that a new snapshot overtook is applied: fail 1, "drops an earlier read that a new snapshot overtook, which shows the last window again".
  - Turn events (`fb-31a-no-turn-events.log`): `openEvents` does not listen to `turn-changed`: fail 4, the delivery and the three unreadable turn change tests.
  - Live activity (`fb-31a-activity-not-live.log`): the page gives `useTaskDetail` no live card: fail 2, "shows an unreachable worker with its last contact, still, and an uncertain process in the danger color" and "reads the task detail again on a card change of its run, not of another run, and on a new snapshot".
  - Turns below the cursor (`fb-31a-turns-below-cursor.log`): the adapter accepts a turn at or below the cursor: fail 1, "reads a turn at or below the cursor as unreachable".
  - Last window (`fb-31a-window-from-first.log`): the feed reads from the first turn: fail 6, the window, earlier-window, and position-order tests.
