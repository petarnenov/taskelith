# Verification: build-board-view

## Scope and source

G3 item 29 (`docs/g3-plan.md`, row 29), sub-change 29a under the coordinator's split (brief question Q1, answer (b), Niki, 2026-11-03), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `0e8d10e0` (#432): the board at `/app/` with its columns, merge gate, cards, and session activity indicators, the board states, the project picker, live updates through `streamProjectEvents`, the routing of a 401 `unauthenticated` answer into the session state, and the reserved task-detail route ([design](design.md), decisions 1 to 15). Out of scope and untouched: the task detail (29b `build-task-detail`), project setup screens, the inbox (item 32), new task (item 30), the agent session screen (item 31), the reconciliation action, and every server, contract, or OpenAPI change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `0e8d10e0a7bdd24680897050231c175fd016783c`, the brief's checklist base and the merge base with `origin/dev` (`git fetch origin` before routing showed `origin/dev` at `0e8d10e0`).
- `49c8a4ae` `chore: start the build-board-view change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-board-view --at 0e8d10e0a7bdd24680897050231c175fd016783c --size M-L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `833c6a1d` `test: expect the web board, its states, project picker, live updates, and expired-session routing`: the tests, before the implementation.
- `615e7f81` `chore: build the web board with its states, project picker, live updates, and expired-session routing`.
- `77bee22d` `docs: record the build-board-view proposal, design, spec delta, plan row, and SPA status`.
- `89f1ed93` `docs: route the build-board-view change` (`route.json`, unedited, at head `77bee22d`): "route: elevated (lines, files, size), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.70) and agrees; recommendation only, the brief's effort medium applies.
- Then this record and the `make record` of its `make verify`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test`.

## Author self-check

- Scope: only the 29a scope of the brief and the decisions Q1 to Q3. `git diff 0e8d10e0 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. Every operation used (`listProjects`, `readBoard`, `streamProjectEvents`, and the session operations) is in `control-plane.openapi.json` 0.4.0.
- No mock data: the board renders only `readBoard` answers and stream events; fixtures live only in `apps/web/test/fakes.tsx`.
- Hexagonal boundaries: screens depend on the `BoardGateway` port (`src/board/board.ts`); only `control-plane-board.ts` touches the typed fetch and `EventSource`; `board-feed.ts` and `board-model.ts` are plain TypeScript without React, tested without a DOM tree.
- Mantine only (D17): no CSS file, no `styles` or `classNames` prop, no `style` prop; layout and color only through component props and theme colors; `ColorSwatch`, `Loader`, `Badge`, `Card`, `Menu`, `List`, `ScrollArea`, and `Alert` are Mantine components.
- Design rules: dark by default as before; 44 px targets through the theme's defaults for `Button` and `Menu.Item`; contrast pairs extended (design, decision 14); at phone width only the board columns scroll sideways, and the picker moves into the navbar below `sm`.
- First run (decision Q3): checked on `dev` that the CLI has no project command (`src/cli.ts`) and that `createProject` is served (`apps/control-plane/src/api/routes.ts`), so the Alert names `createProject` (`POST /projects`).
- Spec delta: `product-ui` adds six requirements (454, 279, 390, 422, 283, and 244 characters); `npm run openspec -- validate build-board-view --strict` passes, and `npm run verify:archive` archives the delta into strictly valid specs in a temporary copy.
- Comments: `npm run verify:comments` passes; it does not read `.tsx`, so the comments of the `.tsx` files of this change were checked with a script for at most two lines of at most 80 characters.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass.
- Coverage of the new files (Vitest, `apps/web/src/board`): 100% lines in every file; statements 97.32%, branches 95.74%, functions 99.09% for the directory; the lowest file is `BoardServices.tsx` with 75% branches (the missing-provider throw).

## Evidence check

The generated part below matches the tree (`make record-check`). Since the pass 1 fixes its totals are from `verify-29a-p1.log` in the session scratchpad, the `make verify` of the tree of `d3f7ce31` (`49bdafdf`), which passed at the first run; in it `apps/web` Vitest ran 260 tests, all passing, with 98.58% statements, 97.43% branches, 99.55% functions, and 100% lines. Before review they were from `verify-29a-2.log`, the second `make verify` on the tree of `ab35acb9` (`6bfd91d0`), unchanged between the runs. The first run, `verify-29a-1.log`, failed only the control-plane test "a body over the limit is 413 before any verification, and one at the limit is read", whose request ended in `fetch failed` with `write ECONNRESET` (tests 4610, pass 4600, fail 1, skipped 9); this change touches no file under `apps/control-plane`, so the run was repeated once on the same tree without a change, and it passed. The first run stopped at that failure before `apps/web` Vitest ran; in the second run it ran 246 tests, all passing, with 98.52% statements, 97.13% branches, 99.54% functions, and 100% lines (pass 1 finding 8).

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/72320a31-29ec-4dad-bb0b-5d2fa342f935/scratchpad`).

- Base (`fb-29a-base.log`): the tests of `833c6a1d` over the sources of `0e8d10e0` (the implementation stashed): `board-feed.test.ts`, `board-labels.test.ts`, `board-page.test.tsx`, and `control-plane-board.test.ts` fail to resolve `../src/board/*`, and `navigation.test.tsx` fails on the missing `PLANNED_SCREENS`; 5 of 12 files fail, the other 139 tests pass.
- Targeted mutations of `615e7f81`, one at a time, each restored with `git checkout`:
  - Expired-session routing, the 28b follow-up (`fb-29a-expire.log`): `useBoardServices` does not call `expire`: fail 3, the `readBoard` and `listProjects` 401 tests and the takeover test of `board-page.test.tsx`.
  - Skipped events (`fb-29a-skip.log`): `isAfter` with `>=`: fail 1, "applies changes above the position and skips the ones the snapshot holds".
  - Resync (`fb-29a-resync.log`): the stream not closed on `resync`: fail 1, "closes the stream on a resync, reads the board, and opens a new stream after its position".
  - Reduced motion (`fb-29a-motion.log`): the indicator ignores the preference: fail 1, "spins nowhere when the system asks for reduced motion, and keeps the labels".
  - Retry delay (`fb-29a-retry-delay.log`): a closed stream reopened at once: fail 2, the retry-delay test and the cancelled-retry test.
  - Reads during events (`fb-29a-buffer.log`): a snapshot replaces the changes that arrived during its read: fail 1, "reads the board again after stream-ended and keeps the changes that arrive during the read".
  - No stale data (`fb-29a-no-data.log`): a failed read keeps the view: fail 2, "shows no board data once a read after a failed stream fails" and "shows the failure of the first read and opens no stream".
  - Body check (`fb-29a-wire.log`): the column not checked: fail 1, "reads a board with a card in an unknown column as unreachable".
  - Platform-managed step (`fb-29a-step.log`): the step always the stage identifier: fail 1, "shows "platform-managed" where the framework mapping records a gap".
  - Merge gate (`fb-29a-gate-column.log`): every Review card at the gate: fail 2, the two merge gate tests.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `49bdafdf31fa2c68268b78946668caf6e4159162`; tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.72% branches, 98.85% functions.
- `npm run openspec -- validate build-board-view --strict`: passed, `Change 'build-board-view' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 109 file(s); every pass summary file is valid: 89 file(s); every route file is valid: 42 file(s).`.
- Spec diff against the merge base `0e8d10e0a7bd` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a28c-fb8e-7173-966a-655865635f91` | 0 | 0 | 6 | 2 |
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2; the authorized effort medium applies.

### Pass 1

- Reviewer A `codex gpt-6-astra#medium` through `make review` on `0e8d10e0..3d0a083b`: `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`, started 2026-11-03T17:55:10Z, exit 0; model `gpt-6-astra`, effort `medium`, and sandbox `read-only` as reported by the CLI; session `01a1a28c-fb8e-7173-966a-655865635f91`. The report and logs are in the session scratchpad (`review-29a-p1-report.md`, `review-29a-p1.make.log`), and the report says that the reviewer changed no file.
- Findings: Critical 0, High 0, Medium 6, Low 2, as in `passes.jsonl`; one line per finding in `findings.jsonl`. Every finding was checked against the code and the logs before its fix, and every claim held; none was declined.
  1. Medium, `board-feed.ts`: every change was kept between reads, so a long healthy stream grew without bound.
  2. Medium, `BoardServices.tsx`: a late 401 of a request sent before a logout could end the session of a later login.
  3. Medium, `board-feed.ts`: repeated resyncs read the board and opened a stream again at once, without a limit.
  4. Medium, `board-feed.ts`: the lost-updates notice disappeared when a new stream started to connect, before it opened, and a resync did not show it.
  5. Medium, `BoardColumns.tsx`: the columns' scroll viewport took no keyboard focus.
  6. Medium, `BoardPage.tsx`: the loading states spun their loader under reduced motion.
  7. Low, `control-plane-board.ts`: project pagination caught only a self-naming page, not a cycle of cursors.
  8. Low, this record: the evidence check credited both verify runs with the web results of the second.

### Pass 1 fixes

Pass 2 reviews these fixes. Fail-before logs are in the session scratchpad; each ran the new tests against the sources before the fix.

- Finding 7 (`7a1e4cb7`): the adapter keeps every cursor it followed and reads a page whose `next` names one of them as `unavailable` (design, decision 3). Fail-before `fb-29a-p1-7.log`: "reads pages whose cursors cycle as unreachable instead of looping" fails, the adapter answered `read` with duplicates.
- Finding 6 (`bc7dcbb3`): the loading states leave the Mantine `Loader` out under `useReducedMotion` and keep their status text (design, decision 7). Fail-before `fb-29a-p1-6.log`: "keeps the loading texts but spins no loader when the system asks for reduced motion" fails on the loader; the session indicator test now shares the reduced-motion helper.
- Finding 5 (`2f501ccb`): the `ScrollArea` viewport gets `tabIndex` 0, the role `region`, and the name "Board columns" through `viewportProps` (design, decision 8). Fail-before `fb-29a-p1-5.log`: "lets the keyboard reach and scroll the columns through a named, focusable viewport" fails, no such region. jsdom shows focus and the region, not browser scrolling; no browser run.
- Finding 2 (`530e0df0`): `SessionProvider`'s `expire` became `expiryOfRequest`, called as a request starts; the function it returns ends the session only while no newer session view showed (design, decision 12; proposal and task 2.5 renamed). Fail-before `fb-29a-p1-2.log`: "of a request sent before a logout leaves the session of a later login signed in", where the deferred `readBoard` 401 arrives after the board unmounted at the logout and a new login showed it again, fails on the expired notice.
- Findings 1, 3, and 4 (`6d310f92`, one commit because they change the same functions of `board-feed.ts`; design, decisions 5 and 6, and "Risks and trade-offs"):
  - 1: changes are kept only while a read runs, and a read that falls `MAX_CHANGES_DURING_READ` (1,000) changes behind is replaced by a resync. Fail-before `fb-29a-p1-1.log`: "replaces a read that falls too far behind the stream with a resync" fails; "keeps no changes while no read runs, however many the stream delivers" passes before and after and guards the count. Memory growth itself is not observable through the feed's interface.
  - 3: a first resync recovers at once; each further resync before the stream delivered a change waits `RESYNC_DELAY_MILLISECONDS` (1 s), doubled up to `STREAM_RETRY_MILLISECONDS` (10 s), and stopping cancels it. Fail-before `fb-29a-p1-3.log`: "recovers from a first resync at once and waits longer before each repeated one", "waits at most the stream retry delay between repeated resyncs", and "cancels a pending resync when stopped" fail; "recovers from a resync at once again after the stream delivered a change" passes before and after. `fb-29a-p1-3-unreadable.log`: "makes the board feed wait longer after each repeated unreadable event", the feed over the real adapter with a fake `EventSource`, fails.
  - 4: `open` no longer sets `connecting`, and a resync sets `lost`, so the notice shows from a drop or resync until a stream opens. Fail-before `fb-29a-p1-4.log`: "keeps the live updates lost after a failed stream until the new stream opens" and "shows the live updates as lost from a resync until the new stream opens" fail.
  - The spec delta's "Web SPA live board updates" now opens a new stream after a first resync at once and after a repeated one up to 10 s later (468 characters, was 422), with the scenario "Repeated resync in the SPA"; "Web SPA expired session on a request" gains the scenario "Late answer of an earlier session".
- Finding 8: the evidence check above credits the web results to the second run only.
- Coordinator decision (Niki, 2026-11-03): the project choice stays in `localStorage` in 29a, and the deviations this keeps (the board's address names no project; design, "Risks and trade-offs") are accepted. `11a810ee` adds "shows the first run, without an error, when the kept project is gone and none is listed" and asserts no error in the existing fallback to the first listed project; both pass before and after, since the behaviour was already there. Follow-up for 29b: when the route `/app/projects/:projectId/...` opens, it sets the picker to that project.
- Route: the fixes changed the diff, so `route.json` was deleted and the change routed again on the fixed head; the new record is committed unedited.
- Checks after the fixes: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json` pass; `apps/web` Vitest 260 tests pass; `npm run openspec -- validate build-board-view --strict` passes; the new and changed comments of the `.tsx` files were checked for at most two lines of at most 80 characters. The `make verify` of the fixed tree is in "Generated checks".

## Limitations

- No browser run: the board was checked in jsdom only, with a stubbed `ResizeObserver` and `matchMedia`; the `EventSource` adapter was tested with a fake source, not against the control plane's stream.
- The audited reconciliation of an uncertain process is not offered (design, "Risks and trade-offs").
- Until item 25 registers cards, a running control plane answers an empty board, so only the empty state shows outside tests.

## Remaining gates

- Independent review: pass 2 of the pass 1 fixes, then pass 3 if pass 2 reports a Medium or worse finding.
- Follow-up for 29b `build-task-detail`: the route `/app/projects/:projectId/...` sets the project picker to its project.
- Architect check by the coordinator of any unreviewed fixes.
- Archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
