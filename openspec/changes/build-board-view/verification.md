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

- `make verify`: passed, profile full, tree `6bfd91d0c822443241bd0db961c4d3af1c507bba`; tests 4610, pass 4601, fail 0, skipped 9; all files 99.44% lines, 92.70% branches, 98.87% functions.
- `npm run openspec -- validate build-board-view --strict`: passed, `Change 'build-board-view' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 109 file(s); every pass summary file is valid: 89 file(s); every route file is valid: 42 file(s).`.
- Spec diff against the merge base `0e8d10e0a7bd` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2; the authorized effort medium applies.

No pass has run yet.

## Limitations

- No browser run: the board was checked in jsdom only, with a stubbed `ResizeObserver` and `matchMedia`; the `EventSource` adapter was tested with a fake source, not against the control plane's stream.
- The audited reconciliation of an uncertain process is not offered (design, "Risks and trade-offs").
- Until item 25 registers cards, a running control plane answers an empty board, so only the empty state shows outside tests.

## Remaining gates

- Independent review: pass 1, then pass 2 if pass 1 reports a Medium or worse finding, then pass 3 if pass 2 does.
- Architect check by the coordinator of any unreviewed fixes.
- Archive in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
