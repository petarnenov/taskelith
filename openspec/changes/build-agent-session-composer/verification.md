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
- `48680bf0` `docs: name the route and the first verify run in the build-agent-session-composer record`, then `8108301e` `docs: record the make verify run of the build-agent-session-composer change`: the record commit, with the first generated part; pass 1 reviewed `743f4661..8108301e`.
- Pass 1 fixes, each a test commit then a fix commit (`d7686533`/`9f9cd89b` finding 1, `972d3c61`/`6a56645a` finding 2, `41dc8913`/`82ac1971` finding 3, `4b326c61`/`12bacd41` finding 4, `02aa816e`/`9578be8c` finding 5, `9258fae9`/`d22d25a4` finding 6, `2ca6ff34`/`55622c99` finding 7, `dd8f04d5`/`987c0a82` finding 8, `118c7715`/`1de2976e` finding 9, `a69badf1`/`b862588b` finding 10, `f0832730`/`bad8c6e5` finding 11), then `a2a0dfda` `docs: record the pass 1 fixes and the coordinator decision on the 401 retry in the build-agent-session-composer design and spec delta`. Two fix commits were amended before any push: finding 4's, after the existing removal-throws test showed that a failed removal must still keep the records out of this page's reads, and finding 9's, for a three-line comment and one assertion of its own test (the account menu shows initials, not the login name).
- `e6684b73` `docs: record the build-agent-session-composer pass 1 summary, findings, and fixes`, then `89a96c09` `docs: route the build-agent-session-composer change after the pass 1 fixes`: the fixes changed the diff, so the old `route.json` was deleted and the change routed again at head `e6684b73` (`route.json` unedited): "route: elevated (lines, files)", rule version 5, 2,389 lines in 34 files, size M; the same reviewers and efforts as before; shadow `jev-1.14.0` elevated (P(third) 0.62) and agrees; recommendation only, the brief's effort medium applies (policy version 11).
- `docs: record the make verify run of the build-agent-session-composer change after the pass 1 fixes`: this record commit, with the generated part below; pass 2 reviews `743f4661..` that commit.

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
- Spec delta: `product-ui` adds three requirements (489, 479, and 406 characters before the pass 1 fixes; 492, 496, and 485 after them, with the scenarios "Turn answered after a move", "Session read fails after a CSRF refusal", "Sign-in changes during the session read", "Refusal without its reason", "Signed out with a turn unconfirmed", and "Session addresses that share a text" added); `npm run openspec -- validate build-agent-session-composer --strict` passes, the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-31b.log` in the session scratchpad: `+ 3 added`, `validate --all --strict` 71 passed, 0 failed), which was then deleted, and `npm run verify:archive` passes.
- Comments: `npm run verify:comments` passes after the fix named under "Revision".
- Links: `npm run verify:links` passes.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass; `npm run build --workspace=@taskelith/web` builds the SPA.
- Coverage (Vitest, `apps/web`, 672 tests in 25 files, `coverage-31b-0.log` in the session scratchpad, before the comment fix, which changed no code), per file changed or added by this change, as statements, branches, functions, and lines: `Composer.tsx` 96.61 / 92.3 / 100 / 98 (its one uncovered line, the unreachable `default` of `stateText`, was removed with the comment fix), `useComposer.ts` 98.21 / 83.33 / 100 / 100 (the unmounted guard and a retry of an unknown key), `turn-records.ts` 97.67 / 95.65 / 100 / 100, `TurnRecordsProvider.tsx` 90.9 / 75 / 100 / 100 (the missing-provider throw), `SessionPage.tsx` 100 / 95.23 / 100 / 100, `session-feed.ts` 100 / 97.36 / 100 / 100, `session-model.ts` 100 / 96.66 / 100 / 100, `BoardServices.tsx` 97.14 / 75 / 100 / 100 (its one uncovered branch, the missing provider, predates this change), `control-plane-board.ts` 98.58 / 97.77 / 100 / 100, `agent-session-wire.ts` 98.61 / 99.18 / 100 / 100, `SessionProvider.tsx` 100 / 97.05 / 100 / 100, `control-plane-session.ts`, `board.ts`, `composer-model.ts`, `useLiveSession.ts`, `TurnTimeline.tsx`, and `App.tsx` at 100 on every metric; `apps/web` overall 98.86% statements, 97.06% branches, 100% functions, and 99.92% lines, every file at or above the 75% thresholds.
- Test authoring: no sleeps; the feed test drains microtasks as the 31a feed tests do; the page tests hold answers in deferred promises and wait on rendered roles and `waitFor`; the stream of the wiring test never emits, so no timer runs; the expiry test of finding 11 advances the manual clock.
- Coverage after the pass 1 fixes (`coverage-31b-p1.log` in the session scratchpad, 710 tests in 26 files): `Composer.tsx` 98.3 / 95.91 / 100 / 100 (an unreachable submit of a disabled form and the singular of "character"), `useComposer.ts` 100 / 91.89 / 100 / 100 (the unmounted guard of `spend` and a retry of an unknown key), `turn-records.ts` 98.3 / 97.14 / 100 / 100, `TurnRecordsProvider.tsx` 92.85 / 75 / 100 / 100 (the missing-provider throw), `session-feed.ts` 100 / 97.36 / 100 / 100, `live-feed.ts` 97.82 / 92.85 / 100 / 100 (unchanged branches), `control-plane-board.ts` 98.62 / 97.95 / 100 / 100, `SessionProvider.tsx` 100 / 97.61 / 100 / 100, and `session-address.ts`, `useLiveSession.ts`, `SessionPage.tsx` (branches 95.23), `composer-model.ts`, `Shell.tsx`, `SignInPage.tsx`, `App.tsx`, and `theme.ts` at 100 on every metric; `apps/web` overall 99.03% statements, 97.35% branches, 100% functions, and 100% lines.

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
- Pass 1 fixes (`fb-31b-p1-<n>.log`, `<n>` the finding): each log is the run of the finding's test commit against the sources before its fix commit.
  - Finding 1: 7 of 28 submitTurn tests fail, a 403, 409, or 422 without its reason read as a refusal.
  - Finding 2: 3 fail, the two failed-read tests and the wire test, the key sent again with the refused token.
  - Finding 3: 4 fail, the error text on the page and in an input in both schemes (3.28, 3.28, 3.44, 3.01).
  - Finding 4: 1 fails, the fresh store over the same storage still lists the record written before the failing write.
  - Finding 5: 2 fail, the store lists the record of a/b + c for a + b/c, and the composer of a + b/c shows its notice.
  - Finding 6: 1 fails, session-2 shows turn-3 of session-1.
  - Finding 7: 6 fail, the five blocked retries enabled and two records sent in one tick.
  - Finding 8: 4 fail, the spent read not kept in the record and the session read again after a retry and after a reload ("gives each key its own session read" passes before and after, as a guard).
  - Finding 9: 3 fail, the key sent again under another operator, from a composer that left, and after a sign-out.
  - Finding 10: 1 fails, the older snapshot drops turn-3.
  - Finding 11: 5 fail, `clearAll` answering nothing and the sign-in page saying nothing of the turn after the expiry and after the sign-out.

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

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. The passes are run by the worker session, not by the subagent that developed the change. `route.json` recommends effort high for passes 1 and 2, before and after the pass 1 fixes; the brief's effort medium applies (policy version 11).

### Pass 1

- Reviewer A `codex gpt-6-astra#medium`, run by the worker session on `743f4661..8108301e` with `env -u JEV_MAF_LAB make review CHANGE=build-agent-session-composer PASS=1 ROLE=A REVIEWER='codex gpt-6-astra#medium' ...`: `make review` found `route.json` made for this tree, printed "recommends effort high; the authorized medium applies (policy version 11)", and ran `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only`; Codex CLI reported model `gpt-6-astra`, reasoning effort `medium`, sandbox `read-only`, and session `01a1a5c3-dbd3-7581-8f0e-c0fc44c7e9fd`. The worktree snapshot was the same before and after the run (`snap-31b-p1-before.txt`, `snap-31b-p1-after.txt`). The prompt, the log, the command output, and the report are in the session scratchpad (`review-31b-p1.md`, `review-31b-p1.log`, `review-31b-p1.out`, `review-31b-p1-report.md`).
- Findings: Critical 0, High 4, Medium 7, Low 0, as in `passes.jsonl`; one line per finding in `findings.jsonl`. Every claim was checked against the code, the OpenAPI document (`AccessDenial`, `CsrfRejection`, `CommandConflict`, `TurnRefusal`), Mantine's `Input.css` and default CSS variables resolver, and the brief before its fix, and every one held; none was declined. The reviewer's category "accessibility" for finding 3 is not in `categories.txt`; it is recorded as `contract-drift`, the code against the product UI design rule of 4.5:1 that the design claimed to meet. Finding 11 waited for a coordinator decision, which arrived during the fixes and is applied (Niki, 2026-11-04).
  1. Medium, `control-plane-board.ts`: a 403 without the role reason, every 409, and every 422 became terminal refusals whatever the body said.
  2. Medium, `useComposer.ts`: an unavailable or throwing session read after a CSRF refusal still consumed the one re-read and sent the key again with the unchanged token.
  3. Medium, `Composer.tsx`: the over-limit error drew Mantine's error color at 3.28:1 (light) and 3.44:1 (dark), untested, against the design's "no new color pair".
  4. High, `turn-records.ts`: after any storage throw, `clearAll` never reached the storage, so text written before a quota failure survived a sign-out.
  5. High, `turn-records.ts`: the record names and the session keys joined raw identifiers with a slash, so `a/b` + `c` and `a` + `b/c` collided.
  6. High, `useLiveSession.ts`: `showTurn` dereferenced the current feed, so a late answer of session A amended session B's timeline.
  7. Medium, `Composer.tsx` and `useComposer.ts`: Retry buttons bypassed every block and the hook had no in-flight guard.
  8. Medium, `useComposer.ts`: each manual retry reset the one-re-read allowance of the key; a reload reset it too.
  9. High, `useComposer.ts`: the automatic resend ran after another sign-in, a sign-out, or the composer's unmount.
  10. Medium, `session-feed.ts`: a resync read whose snapshot predated the submission dropped the turn `showTurn` had amended in.
  11. Medium, `design.md` and the spec delta: the Q3 against Q4 conflict on a 401 was a recorded departure, not a decision.

### Pass 1 fixes

Pass 2 reviews these fixes. Fail-before logs are in the session scratchpad (`fb-31b-p1-<n>.log`, see "Fail-before"); each ran the new tests of the finding's test commit against the sources before the fix, and the whole `apps/web` suite passed after each fix.

- Finding 1 (`9f9cd89b`): `refusalOf` reads a 403 as `csrf-rejected` or `denied` by its reason, a 409 as `key-reused` only for `idempotency-key-reused`, and a 422 as `session-stopped` only for `session-stopped`; any other body reads as `unavailable`, so the composer keeps the key (design, decision 2; spec scenario "Refusal without its reason").
- Finding 2 (`6a56645a`): `Session.refresh` answers the `SessionRead`; the hook sends the key again only after an `authenticated` read and keeps the record as `token-not-renewed`, with a retry, after an `unavailable` one; the wire test checks that the second request carries the renewed token and never the refused one (design, decisions 3 and 6; spec scenario "Session read fails after a CSRF refusal").
- Finding 3 (`82ac1971`): `theme.ts` exports a `cssVariablesResolver` that sets `--mantine-color-error` to red.9 (light, 5.46:1) and red.5 (dark, 5.59:1 on the page, 4.89:1 in an input); `App` gives it to `MantineProvider`; `contrast.ts` merges a resolver as the provider does, and the matrix tests "error text under an input, on the page" and "text in an erroneous input" in both schemes, plus Mantine's defaults failing (design, decision 10, which no longer claims no new pair).
- Finding 4 (`12bacd41`): `clearAll` tries the storage whatever threw before and falls back to memory only when the removal itself throws (design, decision 4).
- Finding 5 (`9578be8c`): `session-address.ts` encodes each identifier; the record names, `useLiveSession`, and `SessionPage` use it (design, decision 4; spec scenario "Session addresses that share a text").
- Finding 6 (`d22d25a4`): `useLiveSession.showTurn` is bound to the feed of its address and load (design, decision 7; spec scenario "Turn answered after a move").
- Finding 7 (`55622c99`): Retry buttons are disabled under every block; the hook's synchronous in-flight flag drops a send or retry while a record is being sent; the new `use-composer.test.tsx` renders the hook under the providers (design, decisions 6 and 8; spec requirement "take no turn, sent or retried").
- Finding 8 (`987c0a82`): the spent re-read is the record's `tokenRefreshed`, kept in `sessionStorage` through `add`, which replaces a known key in place, so it holds across failures, retries, and a reload (design, decision 3; spec scenario "Stale CSRF token").
- Finding 9 (`1de2976e`): `Session.signedInGeneration` numbers each sign-in; the hook captures it at send and resends only from a mounted composer under the same generation, else keeps the record as `session-changed` (design, decision 6; spec scenario "Sign-in changes during the session read").
- Finding 10 (`b862588b`): the live feed keeps the amendments made during a read with the stream changes and applies them over the snapshot (design, decision 7).
- Finding 11 (`bad8c6e5`, design and spec in `a2a0dfda`): the coordinator decision (Niki, 2026-11-04) replaces the departure: Q4 wins for a 401; `clearAll` answers whether it dropped a record, the provider keeps that, and the sign-in page's expired and signed-out alerts add "Your last turn may not have been sent; check the timeline after signing in." only then (design, decision 5; spec scenario "Signed out with a turn unconfirmed").
- After the fixes the whole `apps/web` suite passes: 710 tests in 26 files (`coverage-31b-p1.log`), 99.03% statements, 97.35% branches, 100% functions, and 100% lines; `tsc` of `apps/web/tsconfig.tooling.json`, `npm run verify:comments`, and `npm run openspec -- validate build-agent-session-composer --strict` pass.

## Remaining gates

- Independent review passes (task 4.1) and the architect check by the coordinator (Niki) of any fix no later pass reviews (task 4.2).
- Archive (task 4.3).
- Integration into dev by the coordinator (single pull request).
