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
- `64f8aaba` `docs: record the make verify run of the build-agent-session-timeline change`; pass 1 reviewed `46cd51b3..64f8aaba`.
- Pass 1 fixes, each a test commit before its fix: finding 1 `6573ce33`, `b54d2d55`; finding 3 `0fe51d43`, `67a36920`; finding 2 `5fd44d15`, `259169b5`; finding 4 `766f1ac0`, `89e13978`; finding 5 `fc52825e`, `510534da`; finding 6 `5786555f`, `75dd85f3`; finding 7 `177e3914`, `c1687dab`; finding 8 `7cd028a9`, `4afe6298`; findings 8 (design) and 9 and the spec delta `bcd0f8b2`; then the record commits after it.
- `e06a8ca3` `docs: route the build-agent-session-timeline change after the pass 1 fixes`: the fixes changed the diff, so the old `route.json` was deleted and the change routed again at head `4afe6298` (`route.json` unedited): "route: elevated (lines, files)", rule version 5, 2,671 lines in 29 files, size M; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.61) and agrees; recommendation only, the brief's effort medium applies.
- The first `make verify` of the branch (`verify-31a-1.log`, at an earlier head) failed in `npm run verify:comments` on two three-line comments of `session-model.ts` and `useCardSessions.ts`; both were shortened, and because the branch was never pushed, the implementation, record, and route commits were recreated with the fix (`a9679a9d`, `0b76df27`, `e2c3ce28`) instead of a fix commit, so one route record describes the reviewed diff. `verify-31a-2.log` is the run of the tree of `e2c3ce28`: it passed (tests 4783, pass 4774, fail 0, skipped 9; all files 99.45% lines, 92.81% branches, 98.86% functions) but wrote no stamp, because this file was drafted, untracked, while it ran, so `make record` refused it; `verify-31a-3.log` is the run of the clean tree after this record was committed, which the generated checks below record.

## Environment

macOS 26.6 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 31a scope of the decisions. `git diff 46cd51b3 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. Every operation used (`listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, and the 29a and 29b `listProjects`, `readBoard`, `readTaskDetail`, `streamProjectEvents`, and session operations) is in `control-plane.openapi.json` 0.5.0.
- Board tests unmodified (Q8): `git diff 46cd51b3 HEAD --stat -- apps/web/test` touches only `fakes.tsx` (the three new gateway reads and the session fixtures), `theme-contrast.test.ts` (one pair), the four new session test files, and, since pass 1 finding 8, the new `board-feed-session-events.test.ts`; `board-feed.test.ts`, `board-page.test.tsx`, `task-detail-feed.test.ts`, `task-detail.test.tsx`, `control-plane-board.test.ts`, `navigation.test.tsx`, and `screens.test.ts` are unchanged and pass.
- No mock data: the screen renders only `readAgentSession`, `listAgentSessionTurns`, and `readTaskDetail` answers; fixtures live only in `apps/web/test/fakes.tsx`.
- Hexagonal boundaries: screens depend on the `BoardGateway` port; only `control-plane-board.ts` touches the typed fetch; `live-feed.ts`, `session-feed.ts`, `session-model.ts`, and `agent-session-wire.ts` are plain TypeScript without React, tested without a DOM tree.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop; `Timeline`, `Badge`, `Alert`, `Anchor`, `Button`, and `Loader` are Mantine components; a turn's lines are separate `Text` paragraphs and long identifiers break through `Breakable`.
- Design rules: the page scrolls nowhere sideways (identifiers and turn lines break at phone width); the session link, the run link, and the buttons are Mantine anchors and buttons with the theme's 44 px targets; contrast pair of a link on the page added (design, decision 10).
- Spec delta: `product-ui` modifies "Web SPA screen routes" (452 characters) and adds four requirements (495, 493, 496, and 453 characters before the pass 1 fixes; 473, 496, 496, and 453 after them, with the scenarios "Earlier read fails" and "Event below the read that supplied its record" added); `npm run openspec -- validate build-agent-session-timeline --strict` passes, and the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-31a.log` before the fixes and `archive-probe-31a-p1.log` after them: `openspec validate --specs --strict`, 71 passed), which was then deleted; `npm run verify:archive` passes too.
- Comments: `npm run verify:comments` passes after the fix named under "Revision".
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass; `npm run build --workspace=@taskelith/web` builds the SPA.
- Coverage after the pass 1 fixes (Vitest, `apps/web`, 584 tests in 20 files): 100% lines in every file; `SessionPage.tsx` 94.44% branches, `session-feed.ts` 96.87%, `agent-session-wire.ts` 98.55% statements and 99.13% branches, `useCardSessions.ts` 83.33% branches, `BoardServices.tsx` 75%, `TaskDetailDrawer.tsx` 93.54%, `TaskDetailView.tsx` 91.66%, `control-plane-board.ts` 97.18% branches and 97.29% functions, `live-feed.ts` 90.47% branches, and `session-model.ts`, `TaskList.tsx`, `board-feed.ts`, `board-model.ts`, and every other file of the change at 100 on every metric; `apps/web` overall 98.87% statements, 97.6% branches, 99.76% functions, and 100% lines.
- Coverage before the pass 1 fixes (Vitest, `apps/web`, 555 tests in 19 files), per file changed or added by this change, as statements, branches, functions, and lines: 100% lines in every file; `SessionPage.tsx` 100 / 94.44 / 100 / 100, `agent-session-wire.ts` 98.52 / 99.12 / 100 / 100, `session-feed.ts` 100 / 96.66 / 100 / 100, `useCardSessions.ts` 94.11 / 83.33 / 100 / 100, `BoardServices.tsx` 96.87 / 75 / 100 / 100 (its one uncovered branch, the missing provider, predates this change), `TaskDetailDrawer.tsx` 100 / 93.54 / 100 / 100, `TaskDetailView.tsx` 100 / 91.66 / 100 / 100, `control-plane-board.ts` 97.43 / 97.18 / 97.29 / 100, `live-feed.ts` 96.62 / 90.47 / 100 / 100, and `session-model.ts`, `session-labels.ts`, `useLiveSession.ts`, `TurnTimeline.tsx`, `SessionsIndexPage.tsx`, `board-feed.ts`, `board-model.ts`, `board.ts`, `useTaskDetail.ts`, `TaskList.tsx`, `screens.ts`, and `routes.tsx` at 100 on every metric; `apps/web` overall 98.86% statements, 97.57% branches, 99.76% functions, and 100% lines, every file at or above the 75% thresholds.
- Test authoring: no sleeps; the feed tests settle held reads and drain microtasks as the 29a feed tests do; the page tests wait on rendered roles and `waitFor`, and the task detail link test answers a new detail per read because the control plane's bodies are new objects.

## Evidence check

The generated part below matches the tree (`make record-check`). Before pass 1 it recorded `verify-31a-3.log` in the session scratchpad; `verify-31a-1.log` and `verify-31a-2.log` are the earlier runs named under "Revision", and no other run was made before pass 1. After the pass 1 fixes it records the run named under "Pass 1 fixes".

## Fail-before

The fail-before evidence of the pass 1 fixes is under "Pass 1 fixes".

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

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `885f09089d89935583c209844cef6a1e0c77943d`; tests 4783, pass 4774, fail 0, skipped 9; all files 99.45% lines, 92.83% branches, 98.87% functions.
- `npm run openspec -- validate build-agent-session-timeline --strict`: passed, `Change 'build-agent-session-timeline' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 116 file(s); every pass summary file is valid: 96 file(s); every route file is valid: 49 file(s).`.
- Spec diff against the merge base `46cd51b3050a` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2, before and after the pass 1 fixes; the brief's effort medium applies (policy version 11).

### Pass 1

- Reviewer A `codex gpt-6-astra#medium`, run by the worker session on `46cd51b3..64f8aaba` with `env -u JEV_MAF_LAB make review CHANGE=build-agent-session-timeline PASS=1 ROLE=A REVIEWER='codex gpt-6-astra#medium' ...`: `make review` found `route.json` made for this tree, printed "recommends effort high; the authorized medium applies (policy version 11)", and ran `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only`; Codex CLI reported model `gpt-6-astra`, reasoning effort `medium`, sandbox `read-only`, and session `01a1a541-0625-72a1-b222-aded605c19c7`. The worktree snapshot was `5480949c…` before and after the run (`snap-31a-p1-before.txt`, `snap-31a-p1-after.txt`), so the worktree remained unchanged. The prompt, the log, the command output, and the report are in the session scratchpad (`review-31a-p1.md`, `review-31a-p1.log`, `review-31a-p1.out`, `review-31a-p1-report.md`).
- Findings: Critical 0, High 0, Medium 6, Low 3, as in `passes.jsonl`; one line per finding in `findings.jsonl`. Every claim was checked against the code, the OpenAPI document, wire contracts section 10, and decision Q8 before its fix, and every one held; none was declined.
  1. Medium, `agent-session-wire.ts`: `isCount` accepted integers above 9007199254740991, which the OpenAPI schemas cap `TimelineCursor`, `TimelinePosition`, and `AgentSessionGeneration` at.
  2. Medium, `session-feed.ts`: an earlier read lowered `before` by 100 after one page, so a page short of 100 turns skipped the turns up to the shown ones for good.
  3. Medium, `session-feed.ts` and `SessionPage.tsx`: every failed earlier read became `failed`, so a 403 with its role, a 404, and no answer showed one notice without the reason or the role.
  4. Medium, `TaskList.tsx`: a failed session list of the task detail did not say why; a 403 without a role, a 404, and no answer read alike.
  5. Low, `session-model.ts`: every applied event replaced `knownAt`, so a delayed event could move the last known time back.
  6. Low, `SessionPage.tsx`: the missing-task notice interpolated `runId` and `taskId` without `Breakable`.
  7. Medium, `session-model.ts`: the lowest read position was every record's freshness, so a replayed `turn-changed` between the session's and the turns' positions overwrote a newer turn, visibly when the stream dropped during the replay.
  8. Medium, `live-feed.ts`: session events reset the board feed's `resyncs` and consumed its during-read allowance, so 1,001 of them during a held board read caused a board resync, against decision Q8.
  9. Low, `tasks.md`: task 3.2 stayed unchecked although the route, the `make verify` run, and this record were in place.

### Pass 1 fixes

Pass 2 reviews these fixes. Fail-before logs are in the session scratchpad (`fb-31a-p1-<n>.log`, `<n>` the finding); each ran the new tests of the test commit against the sources before the fix, and the whole `apps/web` suite passed after each fix.

- Finding 1 (`b54d2d55`): `isTimelineCursor` (`Number.isSafeInteger`, from 0) checks `lastTurnPosition`, `lastRequestPosition`, and `output.lastPosition`, and `isTimelinePosition` (from 1) builds on it for turn positions, generations, `earliestRetained`, and `next` (design, decision 2). Fail-before `fb-31a-p1-1.log`: the 10 boundary tests of "the timeline numbers" fail, one above the largest safe integer read as `read`.
- Finding 3 (`67a36920`): `EarlierRead` is a state with its `ReadFailed`, and `EarlierTurns` says why by failure kind, with the role a 403 names (design, decision 6). Fail-before `fb-31a-p1-3.log`: 9 tests fail, the earlier-read states and the denied and not-found notices.
- Finding 2 (`259169b5`): `readTurnPages(after, until)` serves both the first window, up to every later turn, and an earlier window, following a short page's `next` until it reaches `before`, with the loop guards; `withEarlierTurns` joins the pages (design, decision 6). Fail-before `fb-31a-p1-2.log`: "follows the next cursor of a short earlier page until the window meets the shown turns" fails with one read and 150 turns, and the failed later page and non-advancing cursor tests fail.
- Finding 4 (`89e13978`): `LIST_FAILURES` of `TaskList.tsx` chooses the text by failure kind, with `withRequiredRole` kept (design, decision 8). Fail-before `fb-31a-p1-4.log`: the 403-without-a-role and 404 tests fail; the unavailable text is the earlier one and passes.
- Finding 5 (`510534da`): `applySessionChange` keeps the later of `knownAt` and `occurredAt` through the board model's `later`, now exported; `viewOf` sets a new snapshot's own time (design, decision 5). Fail-before `fb-31a-p1-5.log`: "keeps the later time of its snapshot over a delayed event, and takes the time of a new snapshot" fails with `08:59` as the known time.
- Finding 6 (`75dd85f3`): both identifiers of the notice render through `Breakable` (design, decision 7). Fail-before `fb-31a-p1-6.log`: "fits the longest identifiers of the missing-task notice at phone width" fails with a run of 128 characters.
- Finding 7 (`c1687dab`): the view's `freshness` holds the session read's position and each turn's page or event position; a `turn-changed` or `agent-session-changed` not above the freshness of its record is skipped, and an earlier page replaces a known turn only when read above it (design, decisions 5 and 6; spec scenario "Event below the read that supplied its record"). Fail-before `fb-31a-p1-7.log`: the two unequal-position tests, the interrupted replay test, and the earlier-page freshness test fail.
- Finding 8 (`4afe6298`, design in `bcd0f8b2`): `startBoardFeed` wraps its listener in `boardEventsOnly`, which drops `agent-session-changed` and `turn-changed` before the core, so the board's resync delay and during-read cap see only board events (design, decision 4 and "Risks and trade-offs"); the new `board-feed-session-events.test.ts` checks the cap under 1,001 session events during a held read and the backoff after a resync with only session events between, and `board-feed.test.ts` is unmodified. Fail-before `fb-31a-p1-8.log`: both tests fail, the stream closed by a resync and no delay pending.
- Finding 9 (`bcd0f8b2`): task 3.2 is ticked; the review, architect check, and archive tasks stay open.
- After the fixes the whole `apps/web` suite passes: 584 tests in 20 files (`coverage-31a-p1.log` in the session scratchpad), 98.87% statements, 97.6% branches, 99.76% functions, and 100% lines; `tsc` of `apps/web/tsconfig.tooling.json` and `npm run verify:comments` pass.

## Remaining gates

- Pass 2 by reviewer B `claude claude-fable-5-1#medium` on the pass 1 fixes; pass 3 only after a pass 2 with a Medium or worse finding; a Low-only pass ends the review, its findings fixed without another review and checked by the coordinator as solution architect.
- Architect check by the coordinator of any fix that no later pass reviews.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
