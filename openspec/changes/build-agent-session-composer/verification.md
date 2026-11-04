# Verification: build-agent-session-composer

## Scope and source

G3 item 31 (`docs/g3-plan.md`, row 31), sub-change 31b under the coordinator's split (brief question Q9, Niki, 2026-11-04), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `743f4661` (#440): the composer that stays visible at the end of the agent session screen (decision Q9), `submitTurn` through the board gateway with the session's CSRF token reached through a getter (Q1), one idempotency key per composed message (Q2) kept in `sessionStorage` through a storage adapter with an in-memory fallback for a retry after a reload (Q4), the states of every documented answer with the retry of the same key and one session re-read after a CSRF refusal (Q3), the blocks of the composer (Q6), the message length check (Q8), and the recorded or duplicate turn shown in the timeline at once (Q10) ([design](design.md), decisions 1 to 10). Out of scope: the output tail (31a follow-up), native requests and the inbox (item 32), new task (item 30), an unsent draft across a reload (Q5), and any OpenAPI or control-plane change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `743f4661b78657f2c2656574d912d7e7d0f9ac5c`, the brief's checklist base and the merge base with `origin/dev`.
- `fea4d676` `chore: start the build-agent-session-composer change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-agent-session-composer --at 743f4661b78657f2c2656574d912d7e7d0f9ac5c --size M` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `9ffc223d` `test: expect the web agent session composer, its submission states, the turn retry records, and submitTurn`: the tests, before the implementation.
- `98dc9377` `chore: build the web agent session composer with submitTurn, the CSRF token getter, and the turn retry records`. The first `npm run verify:comments` of the implementation failed on one three-line comment of `turn-records.ts`; the comment was shortened and, because the branch was never pushed, the implementation commit was amended with the fix instead of a fix commit, so one route record describes the reviewed diff.
- `e972915d` `docs: record the build-agent-session-composer proposal, design, spec delta, and SPA status`: the proposal, the design, the spec delta, `tasks.md`, this record's hand-written part, and the README status.
- `75357447` `docs: route the build-agent-session-composer change` (`route.json`, unedited, at head `e972915d`): "route: elevated (lines, files), rule version 5", 1,665 lines in 26 files, size M; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.60) and agrees; recommendation only, the brief's effort medium applies.
- `docs: name the route and the first verify run in the build-agent-session-composer record`, then `docs: record the make verify run of the build-agent-session-composer change`: the record commit, with the generated part below; pass 1 reviews `743f4661..` that commit.

## Environment

macOS 26.6 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 31b scope of the decisions. `git diff 743f4661 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. `submitTurn` and every status and reason the composer maps are in `control-plane.openapi.json` 0.5.0 (`submitTurn`, `TurnSubmission`, `TurnSubmitted`, `CsrfRejection`, `AccessDenial`, `CommandConflict`, `TurnRefusal`).
- Existing tests: `git diff 743f4661 HEAD --stat -- apps/web/test` touches `fakes.tsx` (`FakeBoardGateway.submitTurn` and the `turnRecords` argument of `renderApp`), `style-nonce.test.tsx` (one line: `App` now requires `turnRecords`, a genuine change of its props), and the five new test files; `session-page.test.tsx`, `session-feed.test.ts`, `control-plane-session.test.ts`, `control-plane-board.test.ts`, `agent-session-reads.test.ts`, `board-feed.test.ts`, `board-page.test.tsx`, `app.test.tsx`, and every other test file are unchanged and pass.
- No mock data: the composer renders only the control plane's answers and the operator's own submissions; fixtures live only in `apps/web/test/fakes.tsx`.
- Hexagonal boundaries: the composer depends on the `BoardGateway` port and the `Session` context; only `control-plane-board.ts` and `control-plane-session.ts` touch the typed fetch; `composer-model.ts` and `turn-records.ts` are plain TypeScript without React, tested without a DOM tree; `grep -rn 'agent-session/' apps/web/src/board` finds nothing, and `agent-session/TurnRecordsProvider.tsx` keeps the store out of `board/`.
- Token exposure (decision 1): the token is read by `createApiClient` through the getter at send time; `grep -rn 'console\.' apps/web/src` finds nothing; `settledGateway` of `SessionProvider` copies only the port's three operations, so the getter reaches no context; the wiring test "sends the session token with the turn and writes it nowhere the page, the storage, or the console shows" checks the HTML, both storages, and the console.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop in `agent-session/`; `Paper`, `Textarea`, `Button`, `Alert`, `Loader`, `Group`, and `Stack` are Mantine components, with `pos` and `bottom` as style props.
- Design rules: the composer's field and button are Mantine's with the theme's 44 px targets (the test checks the button's `min-height`); the message text breaks through `TurnText` and `Breakable` at phone width; no new color pair (design, decision 10).
- Spec delta: `product-ui` adds three requirements (489, 479, and 406 characters); `npm run openspec -- validate build-agent-session-composer --strict` passes, the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-31b.log` in the session scratchpad: `+ 3 added`, `validate --all --strict` 71 passed, 0 failed), which was then deleted, and `npm run verify:archive` passes.
- Comments: `npm run verify:comments` passes after the fix named under "Revision".
- Links: `npm run verify:links` passes.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass; `npm run build --workspace=@taskelith/web` builds the SPA.
- Coverage (Vitest, `apps/web`, 672 tests in 25 files, `coverage-31b-0.log` in the session scratchpad, before the comment fix, which changed no code), per file changed or added by this change, as statements, branches, functions, and lines: `Composer.tsx` 96.61 / 92.3 / 100 / 98 (its one uncovered line, the unreachable `default` of `stateText`, was removed with the comment fix), `useComposer.ts` 98.21 / 83.33 / 100 / 100 (the unmounted guard and a retry of an unknown key), `turn-records.ts` 97.67 / 95.65 / 100 / 100, `TurnRecordsProvider.tsx` 90.9 / 75 / 100 / 100 (the missing-provider throw), `SessionPage.tsx` 100 / 95.23 / 100 / 100, `session-feed.ts` 100 / 97.36 / 100 / 100, `session-model.ts` 100 / 96.66 / 100 / 100, `BoardServices.tsx` 97.14 / 75 / 100 / 100 (its one uncovered branch, the missing provider, predates this change), `control-plane-board.ts` 98.58 / 97.77 / 100 / 100, `agent-session-wire.ts` 98.61 / 99.18 / 100 / 100, `SessionProvider.tsx` 100 / 97.05 / 100 / 100, `control-plane-session.ts`, `board.ts`, `composer-model.ts`, `useLiveSession.ts`, `TurnTimeline.tsx`, and `App.tsx` at 100 on every metric; `apps/web` overall 98.86% statements, 97.06% branches, 100% functions, and 99.92% lines, every file at or above the 75% thresholds.
- Test authoring: no sleeps; the feed test drains microtasks as the 31a feed tests do; the page tests hold answers in deferred promises and wait on rendered roles and `waitFor`; the stream of the wiring test never emits, so no timer runs.

## Evidence check

The generated part below matches the tree (`make record-check`). Two `make verify` runs were made before pass 1, both in the session scratchpad, both passing at the first run with no rerun. `verify-31b-1.log` is the run of the clean tree of `75357447` (profile full, tree `c366a364`, 4,783 tests, 4,774 passed, 0 failed, 9 skipped; `apps/web` Vitest 672 tests in 25 files); the command that wrote it appended its exit code as a last line, so `make record` refused the log as one not ending with the stamped result, and it is kept unedited. `verify-31b-2.log` is the run of the clean tree after the hand-written part of this record was committed, which the generated part records.

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/38f2ee40-59fa-49d7-b7a0-efd6c305ef14/scratchpad`).

- Base (`fb-31b-base.log`): the tests of `9ffc223d` over the sources of `743f4661` (`apps/web/src` stashed, the new source files included): all five new files fail to resolve their modules (`composer-model`, `turn-records`, the `submitTurn` and `csrfToken` of the adapters, `showTurn` of the feed); 5 of 5 files fail, no test runs.
- Targeted mutations of `98dc9377`, one at a time, each restored with `git checkout` (script `mutate-31b.py` in the scratchpad):
  - CSRF never refreshed (`fb-31b-csrf-never-refreshed.log`): every `csrf-rejected` is terminal: fail 3, the re-read-once, second-refusal, and session-ended tests.
  - Record kept on settle (`fb-31b-record-kept-on-settle.log`): `useComposer` never removes a record: fail 12, every test that expects the record cleared.
  - Turn not shown at once (`fb-31b-turn-not-shown-at-once.log`): `showTurn` does nothing: fail 7, every test that waits for the recorded turn in the timeline.
  - Turn shown twice (`fb-31b-turn-shown-twice.log`): `withSubmittedTurn` appends without the freshness check: fail 2, "keeps the read or event state of a turn the view already knows" and "shows a turn the stream delivered before the answer only once".
  - Stopped session takes turns (`fb-31b-stopped-takes-turns.log`): `blockOf` ignores `session.limit`: fail 1, "is disabled when the session stopped at an account limit".
  - Records survive sign-out (`fb-31b-records-survive-sign-out.log`): the provider never clears: fail 2, the sign-out and the 401 tests.
  - Storage throw unhandled (`fb-31b-storage-throw-unhandled.log`): `attempt` without its try/catch: fail 3, the three fallback tests.
  - Limit off by one (`fb-31b-limit-off-by-one.log`): `>=` for the length check: fail 2, the longest-text and code-point tests.
  - Token never sent (`fb-31b-token-never-sent.log`): the board gateway ignores its `csrfToken` option: fail 2, the header test and the session-gateway wiring test.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c1fc44da40ec446c89e2366ac8b570ecf8df5028`; tests 4783, pass 4774, fail 0, skipped 9; all files 99.45% lines, 92.85% branches, 98.87% functions.
- `npm run openspec -- validate build-agent-session-composer --strict`: passed, `Change 'build-agent-session-composer' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 117 file(s); every pass summary file is valid: 97 file(s); every route file is valid: 50 file(s).`.
- Spec diff against the merge base `743f4661b786` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. The passes are run by the worker session, not by the subagent that developed the change.

## Remaining gates

- Independent review passes (task 4.1) and the architect check by the coordinator (Niki) of any fix no later pass reviews (task 4.2).
- Archive (task 4.3).
- Integration into dev by the coordinator (single pull request).
