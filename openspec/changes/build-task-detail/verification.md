# Verification: build-task-detail

## Scope and source

G3 item 29 (`docs/g3-plan.md`, row 29), sub-change 29b under the coordinator's split (item brief question Q1, answer (b), Niki, 2026-11-03), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `d3dd09ed` (#433): the task detail at `/app/projects/:projectId/cards/:runId` as a Mantine Drawer over the board (decision Q2), its content from `readTaskDetail`, its states, its live updates through the 29a board feed, and the three 29a follow-ups: the address's project in the picker, the shell's session-check loader under reduced motion, and card links ([design](design.md), decisions 1 to 9). Out of scope: answering inbox items (item 32), new task (item 30), the agent session screen (item 31), `listAgentSessions`, which the coordinator made a follow-up of item 31 on 2026-11-03 (design, "Agent sessions"), and any OpenAPI or control-plane change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `d3dd09ed86b57f3fb0f885bef3757d67f96c02c1`, the brief's checklist base and the merge base with `origin/dev` (`git fetch origin` before routing showed `origin/dev` at `d3dd09ed`).
- `b5b3eb70` `chore: start the build-task-detail change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-task-detail --at d3dd09ed86b57f3fb0f885bef3757d67f96c02c1 --size M-L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `61093439` `test: expect the web task detail, its live updates, card links, the address's project, and the still session loader`: the tests, before the implementation.
- `defeb7fa` `chore: build the web task detail drawer with live updates, card links, the address's project, and a still session loader`.
- `9e7e9b7a` `docs: record the build-task-detail proposal, design, spec delta, and SPA status`.
- `54f41806` `docs: route the build-task-detail change` (`route.json`, unedited, at head `9e7e9b7a`): "route: elevated (lines, files, size), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.66) and agrees; recommendation only, the brief's effort medium applies.
- `70f5da18` `docs: record the build-task-detail verification`, then `24dfecef`, the `make record` of its `make verify`; pass 1 reviewed `d3dd09ed..24dfecef`.
- Pass 1 fixes, each a test commit before its fix: finding 7 `3b09e5a1`, `147364ff`; finding 1 `7e2255ad`, `715e7418`; finding 2 `1b0cc68d`, `553a1048`; finding 3 `a92350cb`, `97674267`; finding 4 `c2085c8b`, `62700f6a`; finding 5 `eff35577`, `bdcb7e49`; finding 6 `0ceee162`, `3c095f4c`; findings 8 and 9 and the coordinator decisions `904eb798` (proposal, design, spec delta) and the record commits after it.
- `be32f9f2` `docs: route the build-task-detail change after the pass 1 fixes`: the fixes changed the diff, so the old `route.json` was deleted and the change routed again at head `904eb798` (`route.json` unedited): "route: elevated (lines, files, size)", rule version 5, 1,943 lines in 32 files; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.65) and agrees.
- Pass 2 fixes: `23789da3` (the tests), `49518eea` (the code fixes), and `0e5a0f33` (proposal and design), then the records below.
- `977756d3` `docs: route the build-task-detail change after the pass 2 fixes`: the fixes changed the diff, so the old `route.json` was deleted and the change routed again at head `0e5a0f33` (`route.json` unedited): "route: elevated (lines, files, size)", rule version 5, 2,124 lines in 35 files; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.67) and agrees.

## Environment

macOS on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 29b scope of the brief and its three follow-ups. `git diff d3dd09ed HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. Every operation used (`readTaskDetail`, and the 29a `listProjects`, `readBoard`, `streamProjectEvents`, and session operations) is in `control-plane.openapi.json` 0.4.0.
- No mock data: the Drawer renders only `readTaskDetail` answers; fixtures live only in `apps/web/test/fakes.tsx`; traceability shows its honest empty state while the answer is `[]`.
- Hexagonal boundaries: screens depend on the `BoardGateway` port; only `control-plane-board.ts` touches the typed fetch; `task-detail-feed.ts` and `task-detail-wire.ts` are plain TypeScript without React, tested without a DOM tree.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop; `Drawer`, `Table`, `List`, `Paper`, `Badge`, `Anchor`, `Alert`, and `Loader` are Mantine components; long identifiers break through `<wbr>` elements, not a style.
- Design rules: no table scrolls sideways; the Drawer's `xl` size is capped by Mantine at the viewport width; the card link is an `Anchor` with the theme's 44 px line height; contrast pair of the link on a card added (design, decision 9).
- Spec delta: `product-ui` removes "Web SPA task detail route", with a **Reason** and a **Migration** that names its replacement "Web SPA task detail address" (coordinator decision, 2026-11-03), and adds four requirements (424, 332, 163, and 368 characters before the pass 1 fixes; 461, 434, 163, and 435 after them); `npm run openspec -- validate build-task-detail --strict` passes, and the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (totals + 4, ~ 0, - 1; `openspec validate --specs --strict`: 71 passed), which was then deleted; `npm run verify:archive` passes too.
- Comments: `npm run verify:comments` passes; the comments of the `.tsx` files of this change were checked with a script for at most two lines of at most 80 characters.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass.
- Coverage after the pass 2 fixes (Vitest, `apps/web`, 457 tests in 15 files): 100% lines; `apps/web` overall 98.88% statements, 97.65% branches, 99.68% functions, and 100% lines.
- Coverage after the pass 1 fixes (Vitest, `apps/web`, 450 tests in 15 files): 100% lines in every file; `TaskDetailDrawer.tsx` 93.1% branches, `TaskDetailView.tsx` 91.66%, `Breakable.tsx` 85.71%, `TaskList.tsx` 95%, `task-detail-feed.ts` 96.15%, `ProjectPicker.tsx` 92.85%; `apps/web` overall 98.87% statements, 97.5% branches, 99.67% functions, and 100% lines.
- Coverage before the pass 1 fixes (Vitest, `apps/web`): 100% lines in every file; `TaskDetailView.tsx` 83.33% branches, `Breakable.tsx` 75% branches (the empty text), `TaskList.tsx` 95%, `task-detail-wire.ts` 98.13%, and every other new file 100%; `apps/web` overall 98.92% statements, 97.69% branches, 99.66% functions, and 100% lines over 339 tests.
- Test authoring: no sleeps; the feed tests settle held reads and drain microtasks as the 29a feed tests do. A first draft of the live-update test raced the board's first render against the stream events (2 of 6 coverage runs red); it now waits for the shown board before it emits, and 8 runs in a row passed.

## Evidence check

The generated part below matches the tree (`make record-check`). Before pass 1 it recorded `verify-29b-1.log` in the session scratchpad, the `make verify` of the tree of `70f5da18` (`f8f348de`); that log holds one run, which passed, and no other run was made, so no flake and no rerun belong to that record; the pass 1 prompt's mention of a rerun after an out-of-branch flake did not apply to this change (pass 1 finding 9). In it `apps/web` Vitest ran 339 tests in 14 files, all passing, with 98.91% statements, 97.68% branches, 99.66% functions, and 100% lines. After the pass 1 fixes it recorded the run named under "Pass 1 fixes"; after the pass 2 fixes it records the run named under "Pass 2 fixes".

## Fail-before

The fail-before evidence of the pass 1 fixes is under "Pass 1 fixes".

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/72320a31-29ec-4dad-bb0b-5d2fa342f935/scratchpad`).

- Base (`fb-29b-base.log`): the tests of `61093439` over the sources of `d3dd09ed` (the implementation stashed): `task-detail-feed.test.ts` fails to resolve `../src/board/task-detail-feed`; 66 tests of `task-detail.test.tsx`, `control-plane-board.test.ts` (`readTaskDetail`), `board-labels.test.ts` (the four new label records), and `app.test.tsx` ("spins no loader when the system asks for reduced motion, and keeps its text") fail; 5 of 14 files fail, the other 267 tests pass.
- Targeted mutations of `defeb7fa`, one at a time, each restored with `git checkout` (script `mutate-29b.py` in the scratchpad):
  - Live updates (`fb-29b-live.log`): `useTaskDetail` never calls `cardChanged`: fail 1, "reads the detail again when the board sees its card change, and not for another card".
  - One read at a time (`fb-29b-coalesce.log`): a change during a read is dropped: fail 1, "runs one read at a time and reads once after it for the latest change during it".
  - Held changes (`fb-29b-held.log`): every change reads again: fail 3, the held-change, during-read, and beyond-a-safe-number tests.
  - No stale data (`fb-29b-no-data.log`): a failed read keeps the detail: fail 1, "shows a failed read without data and reads no more on later changes".
  - Address's project, follow-up 1 (`fb-29b-route-select.log`): `BoardPage` does not select it: fail 1, "becomes the chosen project, and no other board is read before it".
  - Another project (`fb-29b-picker-close.log`): the picker does not leave the detail: fail 1, "closes the detail when the operator chooses another project".
  - Card links, follow-up 3 (`fb-29b-card-link.log`): the link leads to `/`: fail 2, the link and encoded-link tests.
  - Session-check loader, follow-up 2 (`fb-29b-shell-motion.log`): `LoadingStatus` ignores reduced motion: fail 1, "spins no loader when the system asks for reduced motion, and keeps its text".
  - Another card's detail (`fb-29b-wire-run.log`): the run identifier not compared: fail 1, "reads the detail of another card than the one asked for as unreachable".
  - Body check (`fb-29b-wire-freshness.log`): the evidence freshness not checked: fail 1, "reads a detail with a trace link of unknown freshness as unreachable".
  - Expired session (`fb-29b-expire.log`): `readTaskDetail` not routed into the session's expiry: fail 1, "shows the sign-in page with the expired notice on an unauthenticated answer".
  - Lost live updates (`fb-29b-lost.log`): the notice never shows: fail 1, "shows the time of its state while the live updates are lost".

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `557943973cc6e582766268d12b4fedd5c4681c37`; tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.70% branches, 98.85% functions.
- `npm run openspec -- validate build-task-detail --strict`: passed, `Change 'build-task-detail' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 110 file(s); every pass summary file is valid: 90 file(s); every route file is valid: 43 file(s).`.
- Spec diff against the merge base `d3dd09ed86b5` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a2ea-05b9-7f43-9aec-8f59f720abd3` | 0 | 1 | 5 | 3 |
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2; the brief's effort medium applies.

### Pass 1

- Reviewer A `codex gpt-6-astra#medium`, run by the coordinator on `d3dd09ed..24dfecef`: Codex CLI 0.166.0 reported model `gpt-6-astra`, reasoning effort `medium`, sandbox `read-only`, and session `01a1a2ea-05b9-7f43-9aec-8f59f720abd3`. The prompt, the log, and the report are in the coordinator's session scratchpad (`review-29b-p1.md`, `review-29b-p1.log`, `review-29b-p1-report.md`); the report says that the worktree remained unchanged.
- Findings: Critical 0, High 1, Medium 5, Low 3, as in `passes.jsonl`; one line per finding in `findings.jsonl`. Every claim was checked against the code, Mantine 9.7.4's sources, the wire contracts, and the logs before its fix, and every one held; none was declined.
  1. High, `TaskDetailDrawer.tsx`: a board re-read that failed, such as a 403 after `stream-ended`, left the detail's snapshot shown and dropped its lost notice.
  2. Medium, `task-detail-feed.ts` and `useTaskDetail.ts`: a resync after a restore could replace the board with one below the detail's position, and the detail then read nothing; a board without the card was skipped.
  3. Medium, `TaskDetailDrawer.tsx`: the Drawer, always opened and unmounted with its route, never ran Mantine's focus return, so closing it lost the focus.
  4. Medium, `ProjectPicker.tsx`: the header's picker was behind the modal Drawer's overlay, so choosing another project while the detail was open was out of reach; the test used `hidden: true`.
  5. Medium, `screens.ts`: an identifier with a dot or a slash gave an address that the SPA's server answers with 404.
  6. Medium, `TaskDetailView.tsx` and `TaskList.tsx`: gate identifiers in badges, unbroken identifiers, and four-column tables could force sideways scrolling at phone width.
  7. Low, `TaskDetailDrawer.tsx`: a Mantine `Title` inside the Drawer's own `h2` nested two headings.
  8. Low, `design.md`: it said that the detail reads only once its board shows, and took a missing `card-changed` for a supported limitation.
  9. Low, `verification.md` and `tasks.md`: the evidence check did not resolve the prompt's mention of a rerun, task 3.2 stayed open, and the remaining gates required pass 2 without the stop rule.

### Pass 1 fixes

Pass 2 reviews these fixes. Fail-before logs are in the session scratchpad (`fb-29b-p1-<n>.log`); each ran the new tests of the test commit against the sources before the fix, and the whole `apps/web` suite passed after each fix.

- Finding 1 (`715e7418`): the board's `Outlet` hands the Drawer the live board with its retry; a failed board of the detail's project drops the detail and shows why, with the role a 403 names and a retry of the board and the detail (design, decision 6). Fail-before `fb-29b-p1-1.log`: "drops the detail and names the role when the board read after a stream end is denied" and "drops the detail when the board cannot be read after the stream closed, and retries both" fail, neither notice found.
- Finding 2 (`553a1048`): the board feed numbers its snapshots, and `boardReread` reads the detail again for each new one whatever the positions, dropping the changes held from before (design, decision 7). Fail-before `fb-29b-p1-2.log`: the three new feed tests fail (`boardReread` missing), and "reads the detail again after a resync, though the restored board lies below it" and "reads the detail again after a resync whose board no longer holds the card" fail, no new answer shown.
- Finding 3 (`97674267`): `TaskDetailRoute` focuses again, when it leaves, the element that had the focus as it opened, else the board's heading (design, decision 3). Fail-before `fb-29b-p1-3.log`: the four focus tests (Escape, the close button, the browser's back, and an address) fail, the focus on `body`.
- Finding 4 (`62700f6a`): the Drawer shows the Mantine `ProjectPicker` at its top (design, decision 4). Fail-before `fb-29b-p1-4.log`: "closes the detail when the operator chooses another project in its dialog" and "chooses a project by keyboard in its dialog, and keeps the detail for the same project" fail, no accessible picker in the dialog.
- Finding 5 (`bdcb7e49`): `taskDetailPath` writes every character other than a letter, a digit, `-`, or `_` as `~` and two hexadecimal digits, and `identifierOf` reads the address back in `BoardPage`, `TaskDetailRoute`, and `ProjectPicker` (design, decision 10). Fail-before `fb-29b-p1-5.log`: the 94 printable-character tests and the longest-identifier test of `screens.test.ts`, the three link tests, and "reads the detail of the identifiers that a route-safe address names" fail, 99 in all; the server rule was read from `apps/control-plane/src/api/web-app.ts` and is not exercised by a web test, which would import control-plane code.
- Finding 6 (`3c095f4c`): stages and trace links are bordered Mantine lists, gate identifiers stand beside their state badges, and `Breakable` now breaks only runs without a space, for every identifier and display text the Drawer shows (design, decision 5). Fail-before `fb-29b-p1-6.log`: "fits the longest identifiers and text at phone width" fails with a run of 129 characters without a break, and the stage and traceability tests fail on the tables. The check is in jsdom, not at 320 px in a browser.
- Finding 7 (`147364ff`): the Drawer's title is plain text in Mantine's `h2`. Fail-before `fb-29b-p1-7.log`: "titles the dialog with one heading of level 2 and no heading inside it" fails on two headings.
- Finding 8 (`904eb798`): design decision 7 says that the detail's first read starts with the Drawer, independently of the board, and "Risks and trade-offs" calls a missing `card-changed` a violation of wire contracts sections 8 and 10, which 15a emits.
- Finding 9 (this record): the evidence check resolves the rerun mention, task 3.2 is ticked, and the remaining gates follow the stop rule.
- `make verify` of the fixed tree (`9f29a899`, tree `55794397`), `verify-29b-p1.log` in the session scratchpad: passed at the first run, profile full, no rerun; in it `apps/web` Vitest ran 450 tests in 15 files, all passing, with 98.87% statements, 97.5% branches, 99.67% functions, and 100% lines. The generated part below records it.
- Coordinator decisions of 2026-11-03 (Niki), in `904eb798`: `listAgentSessions` is a follow-up of item 31, and the Drawer keeps the session indicator from `readTaskDetail` (design, "Agent sessions"); the picker leads to the board only from a task detail address, now the scenario "Another project on another page"; the removed "Web SPA task detail route" has a **Reason** and a **Migration** that names "Web SPA task detail address", so that the archive reads as a rename (`npm run openspec -- validate build-task-detail --strict` passes); and the other departures and trade-offs of the reviewed design are accepted (design, "Proof of concept").

### Pass 2

- Reviewer B `claude claude-fable-5-1#medium`, run by the coordinator on the diff `d3dd09ed..3d3be9dd` with `env -u JEV_MAF_LAB make review CHANGE=build-task-detail PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' ...`: Claude Code reported model `claude-fable-5-1` and session `7f8cdce1-9d38-4e97-8154-06b4a778355c`; the worktree snapshot was `781ddeb0…` before and after the run, so the worktree remained unchanged. The report is in the coordinator's session scratchpad (`review-29b-p2-report.md`).
- Findings: Critical 0, High 0, Medium 0, Low 8, as in `passes.jsonl`; one line per finding in `findings.jsonl`. The reviewer found all nine pass 1 fixes correct and complete. A pass with only Low findings ends the review (governance "Review sequence"), so pass 3 does not run and the fixes below are not reviewed.
  1. Low, `useTaskDetail.ts`: a board feed restarted without the detail feed could repeat or skip a snapshot number that the hook still held.
  2. Low, `design.md` risk 2: it named only a change of another card as the cause of a second detail read on a direct open.
  3. Low, `TaskDetailView.tsx` and `TaskList.tsx`: `Paper` and `Text` blocks inside the `span` of Mantine's `List.Item`, invalid HTML.
  4. Low, `TaskDetailView.tsx`: each section's `aria-label` repeated its own `h3`.
  5. Low, `TaskDetailDrawer.tsx`: closing pushed the board, so Back after a card link opened the detail again.
  6. Low, the spec delta: the scenario "Another project on another page" had no test.
  7. Low, `screens.ts`: `identifierOf` decoded only uppercase hexadecimal escapes.
  8. Low, `TaskDetailView.tsx` and `TaskList.tsx`: the detail views imported `stepOf` and `ObstacleText` from the card view.

### Pass 2 fixes

**Unreviewed.** No later pass reviews these fixes; the coordinator checks them as solution architect (governance "Architect check of unreviewed fixes"), and their `findings.jsonl` lines say `fixed-unreviewed`, the outcome of the finding schema for a fix that no later pass checked.

Fail-before logs in the session scratchpad: `fb-29b-p2.log`, the tests of `23789da3` over the sources before `49518eea`, 6 of 45 tests of `task-detail.test.tsx` fail; `fb-29b-p2-6.log`, the mutation for finding 6.

- Finding 1 (`49518eea`): the feed-start effect of `useTaskDetail` forgets the snapshot and the card it saw (design, decision 7). Fail-before: "reads the detail once on a retry of both after a resync, whatever the snapshot numbers" fails, 4 reads instead of 3.
- Finding 2 (`0e5a0f33`): risk 2 now states that a direct open reads the board and the detail concurrently, and reads the detail once more only when the board answers above the detail's position. The read is not skipped when the board's card equals the detail's, because wire contracts sections 8 and 10 announce a change of the detail alone, such as a stage, a gate, or a task, through a `card-changed` whose card can be unchanged, so the skip could hide a change; the brief allowed this alternative. No behaviour changed, so no test.
- Finding 3 (`49518eea`): the lists are Mantine `Stack` elements rendered as `ol` or `ul` (`ItemList`), with `Paper` or `Text` items rendered as `li` (design, decision 5); no CSS, `style`, `styles`, or `classNames`, and no new color pair, so the tested contrast pairs stay. Fail-before: "writes valid lists: no block inside phrasing content, each item in a list" fails on a `p` inside a `span`.
- Finding 4 (`49518eea`): each section is named by its `h3` through `aria-labelledby`. Fail-before: "names each section by its heading rather than by a second label" fails on the `aria-label` "Stages and gates".
- Finding 5 (`49518eea`), with the coordinator's constraint of 2026-11-03: the card link marks its history entry with the page load (`board-entry.ts`, `performance.timeOrigin`), and closing a detail so opened calls `navigate(-1)`; a detail from a direct link or a reload, whose entry has no mark of this page load, closes with `navigate('/', { replace: true })`, so closing never leaves the app (design, decision 3). The Drawer's picker keeps its push to the board. Fail-before: "closes a detail opened from a card by going back, so Back does not open it again" and "closes a detail opened from a direct link" and "… from a reload by replacing its address with the board" fail, `PUSH` instead of `POP` or `REPLACE`. The going-back test expected `/app` in `23789da3`; going back returns to the board's own entry `/app/`, so `49518eea` corrects the expected path, and the history action carries the check.
- Finding 6 (`23789da3`): "keeps that page when the operator chooses another project" renders `/app/sessions`, chooses another project in the header's picker, and expects the page to stay. It passes on the sources, which already implement the scenario; fail-before `fb-29b-p2-6.log`: with the picker made to lead to the board from every page (`detail === null ||`), it fails with `/app` instead of `/app/sessions`.
- Finding 7, **declined** under the coordinator's rule of 2026-11-03 (lowercase only if the control plane also decodes it): the control plane decodes each segment only by percent-encoding (`apps/control-plane/src/api/web-app.ts:73`, `decodeURIComponent`) and knows no `~` form, and `taskDetailPath` writes uppercase (`screens.ts`, `hex`), so `identifierOf` stays strict and one task keeps one address (design, decision 10).
- Finding 8 (`49518eea`): `stepOf` moved to `board-labels.ts` and `ObstacleText` to `ObstacleText.tsx`, which the card and the detail both import; covered by the existing card and detail tests.
- Coordinator decision Q3 (`0e5a0f33`): design decision 4 says why the picker appears twice, the modal Drawer keeping its focus trap and Escape, and that both pickers read and write the one selection of `ProjectsProvider` (`useProjects`), so they cannot disagree; they already share it, so no test was added.
- After the fixes the whole `apps/web` suite passes: 457 tests in 15 files, 98.88% statements, 97.65% branches, 99.68% functions, and 100% lines; `tsc` of both `apps/web` configurations and `npm run verify:comments` pass.
- `make verify` of the fixed tree: see "Generated checks" and the line below, written once it ran.
- Architect check by the coordinator (Niki): _pending_.

## Limitations

- No browser run: the Drawer was checked in jsdom only, with stubbed `ResizeObserver` and `matchMedia`; Mantine's transitions and focus trap were not checked in a browser.
- The 320 px check is jsdom-only (coordinator decision Q1 of pass 2): "fits the longest identifiers and text at phone width" bounds the longest run without a break to 24 characters and each table row to two cells. It does not cover long unbroken text that no `Breakable` wraps, tables wider than two columns that a later change might add, or the real layout, widths, and overflow of a browser at 320 px.
- Until item 25 registers cards and traceability, a running control plane answers an empty board, so no card links to a detail outside tests, and traceability shows only its empty state.
- `listAgentSessions` is not read; it is a follow-up of item 31 (design, "Agent sessions").
- The route-safe address is checked against the server's rule as read, not through the control plane's `webAppAnswer` (coordinator decision Q2 of pass 2). The rule's source is `apps/control-plane/src/api/web-app.ts`: lines 49-57 (`webAppAnswer`; line 54 answers `index.html` only for a path without an extension, so a last segment with a dot is looked up as a file and answers 404) and lines 68-80 (`buildPath`; line 73 percent-decodes each segment, lines 77-78 refuse an empty inner segment, `.`, `..`, and a decoded `/`, `\`, or NUL). The remaining risk is drift between the SPA's `taskDetailPath` and `webAppAnswer`: a later change of either could make an encoded address answer 404 without a failing test.
- Closing goes back only from an entry that a card link marked in this page load; a reload gives a new page load, so its entry closes by replacing its address, and Back then leads to the entries before it.

## Follow-ups

- A browser-level layout check of the UI screens at 320 px, with the end-to-end item (coordinator decision Q1 of pass 2).
- A later small task outside 29b: one control-plane test that feeds an SPA-encoded task address, as `taskDetailPath` writes it, through `webAppAnswer` and expects `index.html` (coordinator decision Q2 of pass 2).

## Remaining gates

- Architect check by the coordinator of the pass 2 fixes, which no later pass reviews (see "Pass 2 fixes").
- Integration into dev by the coordinator (single pull request).
