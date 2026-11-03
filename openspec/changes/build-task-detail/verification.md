# Verification: build-task-detail

## Scope and source

G3 item 29 (`docs/g3-plan.md`, row 29), sub-change 29b under the coordinator's split (item brief question Q1, answer (b), Niki, 2026-11-03), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `d3dd09ed` (#433): the task detail at `/app/projects/:projectId/cards/:runId` as a Mantine Drawer over the board (decision Q2), its content from `readTaskDetail`, its states, its live updates through the 29a board feed, and the three 29a follow-ups: the address's project in the picker, the shell's session-check loader under reduced motion, and card links ([design](design.md), decisions 1 to 9). Out of scope: answering inbox items (item 32), new task (item 30), the agent session screen (item 31), `listAgentSessions` (design, "Agent sessions"), and any OpenAPI or control-plane change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `d3dd09ed86b57f3fb0f885bef3757d67f96c02c1`, the brief's checklist base and the merge base with `origin/dev` (`git fetch origin` before routing showed `origin/dev` at `d3dd09ed`).
- `b5b3eb70` `chore: start the build-task-detail change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-task-detail --at d3dd09ed86b57f3fb0f885bef3757d67f96c02c1 --size M-L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `61093439` `test: expect the web task detail, its live updates, card links, the address's project, and the still session loader`: the tests, before the implementation.
- `defeb7fa` `chore: build the web task detail drawer with live updates, card links, the address's project, and a still session loader`.
- `9e7e9b7a` `docs: record the build-task-detail proposal, design, spec delta, and SPA status`.
- `54f41806` `docs: route the build-task-detail change` (`route.json`, unedited, at head `9e7e9b7a`): "route: elevated (lines, files, size), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.66) and agrees; recommendation only, the brief's effort medium applies.
- `70f5da18` `docs: record the build-task-detail verification`, then the `make record` of its `make verify`.

## Environment

macOS on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 29b scope of the brief and its three follow-ups. `git diff d3dd09ed HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. Every operation used (`readTaskDetail`, and the 29a `listProjects`, `readBoard`, `streamProjectEvents`, and session operations) is in `control-plane.openapi.json` 0.4.0.
- No mock data: the Drawer renders only `readTaskDetail` answers; fixtures live only in `apps/web/test/fakes.tsx`; traceability shows its honest empty state while the answer is `[]`.
- Hexagonal boundaries: screens depend on the `BoardGateway` port; only `control-plane-board.ts` touches the typed fetch; `task-detail-feed.ts` and `task-detail-wire.ts` are plain TypeScript without React, tested without a DOM tree.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop; `Drawer`, `Table`, `List`, `Paper`, `Badge`, `Anchor`, `Alert`, and `Loader` are Mantine components; long identifiers break through `<wbr>` elements, not a style.
- Design rules: no table scrolls sideways; the Drawer's `xl` size is capped by Mantine at the viewport width; the card link is an `Anchor` with the theme's 44 px line height; contrast pair of the link on a card added (design, decision 9).
- Spec delta: `product-ui` removes "Web SPA task detail route" and adds four requirements (424, 332, 163, and 368 characters); `npm run openspec -- validate build-task-detail --strict` passes, and the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (totals + 4, ~ 0, - 1; `openspec validate --specs --strict`: 71 passed), which was then deleted; `npm run verify:archive` passes too.
- Comments: `npm run verify:comments` passes; the comments of the `.tsx` files of this change were checked with a script for at most two lines of at most 80 characters.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass.
- Coverage of the new files (Vitest, `apps/web`): 100% lines in every file; `TaskDetailView.tsx` 83.33% branches, `Breakable.tsx` 75% branches (the empty text), `TaskList.tsx` 95%, `task-detail-wire.ts` 98.13%, and every other new file 100%; `apps/web` overall 98.92% statements, 97.69% branches, 99.66% functions, and 100% lines over 339 tests.
- Test authoring: no sleeps; the feed tests settle held reads and drain microtasks as the 29a feed tests do. A first draft of the live-update test raced the board's first render against the stream events (2 of 6 coverage runs red); it now waits for the shown board before it emits, and 8 runs in a row passed.

## Evidence check

The generated part below matches the tree (`make record-check`). Its totals are from `verify-29b-1.log` in the session scratchpad, the `make verify` of the tree of `70f5da18` (`f8f348de`), which passed at the first run; in it `apps/web` Vitest ran 339 tests in 14 files, all passing, with 98.91% statements, 97.68% branches, 99.66% functions, and 100% lines.

## Fail-before

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

- `make verify`: passed, profile full, tree `f8f348de3c496f2a23a1e9e6894f9e84cad6c57b`; tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.73% branches, 98.87% functions.
- `npm run openspec -- validate build-task-detail --strict`: passed, `Change 'build-task-detail' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 110 file(s); every pass summary file is valid: 90 file(s); every route file is valid: 43 file(s).`.
- Spec diff against the merge base `d3dd09ed86b5` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2; the brief's effort medium applies. No pass has run yet.

## Limitations

- No browser run: the Drawer was checked in jsdom only, with stubbed `ResizeObserver` and `matchMedia`; Mantine's transitions and focus trap were not checked in a browser.
- Until item 25 registers cards and traceability, a running control plane answers an empty board, so no card links to a detail outside tests, and traceability shows only its empty state.
- `listAgentSessions` is not read (design, "Agent sessions").

## Remaining gates

- Review passes 1 and 2, and pass 3 if pass 2 reports a Medium or worse finding.
- Architect check by the coordinator of any fixes that no later pass reviews.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
