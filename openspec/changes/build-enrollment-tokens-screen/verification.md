# Verification: build-enrollment-tokens-screen

## Scope and source

G3 item 33 (`docs/g3-plan.md`, row 33), sub-change 33b under the coordinator's split (`brief-33-plan.md`, Niki, 2026-11-04), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `3191c262` (#447): the enrollment tokens section of `/app/workers` over the four token operations added to the `WorkersGateway` port, with the list of every page and its truncation note (decisions Q9 (a), Q10 (a)), the inline issue form (Q1 (a)), the confirmations (Q6 (a)), the one-time reveal with its copy and close step (Q2 (a), Q3 (a), Q4 (b), Q5 (a)), the status region with the per-reason texts (Q7 (a)), one command at a time with the single CSRF resend (Q11 (a), Q12 (a)), the list read again after every answer that changed it (Q8 (a)), the link of the workers' empty state, and the redaction tests of every close path ([design](design.md), decisions 1 to 9). Out of scope: account pools (33c), the 12d B backend, and any OpenAPI or control-plane change (the CA fingerprint in the browser document and idempotency keys on issue and rotate are follow-ups).

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `3191c26217da161ce28c9738adf21d87493cfba6`, the brief's checklist base and the merge base with `origin/dev`.
- `541f9db3` `chore: start the build-enrollment-tokens-screen change`: `.openspec.yaml` and the brief's `checklist.json` saved with `--save build-enrollment-tokens-screen --at 3191c26217da161ce28c9738adf21d87493cfba6 --size M` (unedited); the empty `findings.jsonl` and `passes.jsonl` were added with the records commit below.
- `81db8a06` `test: expect the web enrollment tokens section, its commands, the one-time secret reveal, and the token operations of the workers gateway`: the tests, before the implementation.
- `f1cdbc77` `chore: build the web enrollment tokens section with the one-time secret reveal over the extended workers gateway`: the implementation.
- The records commit `docs: record the build-enrollment-tokens-screen proposal, design, spec delta, and SPA status`: the proposal, the design, the spec delta, `tasks.md`, the empty `findings.jsonl` and `passes.jsonl`, this record's hand-written part, and the README status.
- The route commit `docs: route the build-enrollment-tokens-screen change` (`route.json`, unedited) and the record commit of the `make verify` run, whose generated part is below; the commit identifiers of these three are named in "Evidence check" once made.

## Environment

macOS 26.6 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 33b scope of the decisions. `git diff 3191c262 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. The four operations, `EnrollmentToken`, `EnrollmentTokenPage`, `HostConstraints`, `IssuedEnrollmentToken`, and `EnrollmentTokenSecret` are in `control-plane.openapi.json` 0.5.0.
- Existing tests: `git diff 3191c262 HEAD --stat -- apps/web/test` touches `fakes.tsx` (`enrollmentToken`, `TOKEN_SECRET`, `issuedToken`, `tokenList`, and the four methods of `FakeWorkersGateway`), `control-plane-workers.test.ts` (the four operations appended; the 33a `listWorkers` tests unchanged), `theme-contrast.test.ts` (the "danger light" pair and its hover), `workers-page.test.tsx` (the empty-state test asserts the link to `#enrollment-tokens` instead of no link, for the modified "No worker" scenario, and the redaction test's scripted plane answers `/enrollment-tokens` with an empty page instead of throwing), and the new files `read-pages.test.ts`, `tokens-wire.test.ts`, `tokens-model.test.ts`, `use-token-commands.test.tsx`, and `enrollment-tokens.test.tsx`. The board's tests, `control-plane-board.test.ts` and `agent-session-reads.test.ts` included, are unchanged and pass over the moved `readPages` through the re-exported `MAX_PAGES` and `MAX_PROJECT_PAGES`; the "board-limit-tolerated" mutation below shows that they still pin the board's page-limit rule. Every other test file is unchanged and passes.
- No mock data: the section renders only the control plane's answers; fixtures live only in `apps/web/test/fakes.tsx` and the test files; the secret shape `tken_` plus 43 characters lives in the tests alone, so `make verify`'s bundle check is unaffected (the parser's pattern holds no such value).
- Hexagonal boundaries: the section depends on the `WorkersGateway` port and the `Session` context; only `control-plane-workers.ts` touches the typed fetch; `tokens-wire.ts` and `tokens-model.ts` are plain TypeScript without React, tested without a DOM tree; `grep -rn "workers/" apps/web/src/board apps/web/src/agent-session` finds nothing, and `grep -rn "board/" apps/web/src/api apps/web/src/session apps/web/src/workers/tokens-wire.ts apps/web/src/workers/tokens-model.ts` finds nothing.
- Redaction (design, decision 6): the secret lives in `useTokenCommands`'s `useState`, called by the section; `grep -rn 'console\.\|localStorage\|sessionStorage' apps/web/src/workers apps/web/src/api` finds nothing; the reveal dialog is mounted only while that state holds a secret; the page test asserts after each close path (Close after a copy, Close anyway, a rotation's replacement, a route change, the session's end, a sign-out, and an answer that settles after the section left) that the HTML holds no secret shape, both storages are empty, no console argument (an `Error`'s stack included) holds the shape, and no unexpected console output appeared; the real-gateway test records every request and asserts none after the 201 carries the secret and only the POST carries the CSRF token.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop in `workers/`; `Modal`, `Alert`, `Anchor`, `Button`, `Card`, `NativeSelect`, `TextInput`, `List`, `SimpleGrid`, `Group`, `Stack`, `Text`, and `Title` are Mantine components; `CommandButton` is a Mantine `Button` with Mantine's documented `data-disabled` modifier; the theme's `red.9` shade is a theme color, as the `gray`, `dark`, and `indigo` shades of 28 and 31b are.
- Design rules: every button is the theme's 44 px `Button` and the selects are `size="lg"`; identifiers and hostnames break through `Breakable` at phone width (the page test checks the `<wbr>`s of a 33-character identifier); the new pair "danger light" and its hover are in the contrast matrix for both schemes; the reveal's copy status and the command status are live regions; the focus returns to the row's button on Cancel and moves to the status region after an answer and after the reveal closes (both asserted).
- Spec delta: `product-ui` adds three requirements (484, 436, and 480 characters) and modifies "Web SPA workers screen" (492, unchanged text) for its "No worker" scenario; `npm run openspec -- validate build-enrollment-tokens-screen --strict` passes; the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-33b.log` in the session scratchpad: `+ 3 added`, `~ 1 modified`, `validate --all --strict` 71 passed, 0 failed, the modified scenario reading "links the enrollment token to the enrollment tokens section of the same page"; the `--archived` line of the probe fails only on the tasks not yet ticked), which was then deleted.
- Comments: `npm run verify:comments` passes; every comment of the `.tsx` files this change touches was checked by hand against the two-line, 80-character rule, since the checker skips `.tsx`; one 81-character line of `EnrollmentTokens.tsx` found by that check was shortened before the implementation commit.
- Links: `npm run verify:links` passes.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass.
- Coverage (Vitest, `apps/web`, 1,012 tests in 37 files, `coverage-33b-1.log` and the `lcov.info` it wrote, in the session scratchpad), per file changed or added by this change, as lines, branches, and functions: `api/read-pages.ts`, `api/read-result.ts`, `main.tsx`, `theme.ts`, `workers/EnrollmentTokens.tsx`, `workers/WorkersPage.tsx`, `workers/WorkersServices.tsx`, `workers/control-plane-workers.ts`, `workers/tokens-model.ts`, `workers/tokens-wire.ts`, `workers/useEnrollmentTokens.ts`, `workers/useSnapshot.ts`, `workers/useTokenCommands.ts`, `workers/useWorkers.ts`, `workers/workers-wire.ts`, and `workers/workers.ts` at 100 on each; `board/control-plane-board.ts` 100 / 97.33 / 100, its two uncovered branches (lines 116 and 138, the session and detail identity checks) predating this change; `apps/web` overall 99.28% statements, 98.04% branches, 100% functions, and 100% lines. The 75% thresholds of `vitest.config.ts` apply to the aggregate; every changed file is above them on every metric.
- Test authoring: no sleeps and no timers of the tests' own; the page tests hold answers in deferred promises, settle them inside `act`, and wait on rendered roles and `waitFor`; Mantine's modal transitions and focus return run on their own timers, awaited with `waitFor`; the real-gateway tests' control plane throws on any request outside its script; the clipboard is a stub installed after user-event's own, which records or refuses, or removed for the no-clipboard case.

## Evidence check

The generated part below matches the tree (`make record-check`). The `make verify` run before pass 1 is `verify-33b-1.log` in the session scratchpad with its exit code `0` in `verify-33b-1.exit`: the clean committed tree `62908d3ae7c367309b4e163e851c960506045a41` of the route commit `09c3d268`, profile full, 4,861 Node tests (4,852 passed, 9 skipped, 0 failed), the `apps/web` Vitest suite 37 files and 1,012 tests passed, no flaky rerun (the `rerun with TASKELITH_TEST_SEED` lines are the property tests' seed hints after passing runs). The records commit is `772004de`; the record commit adds the generated part, ticks task 3.2, and names itself in the branch history as `docs: record the make verify run of the build-enrollment-tokens-screen change`. `make findings ARGS="route ..."` recommends `#high` for passes 1 and 2 (tier elevated: lines, files, security) and notes that the brief names the reviewers and that an effort above standard needs governance authorization; the brief's plan at effort medium stands unless the coordinator decides otherwise.

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/38f2ee40-59fa-49d7-b7a0-efd6c305ef14/scratchpad`).

- Base (`fb-33b-base.log`, exit code 1 in `fb-33b-base.exit`): the tests of `81db8a06` over the sources of `3191c262` (`apps/web/src` stashed, the new source files included), 8 files: `read-pages.test.ts`, `tokens-wire.test.ts`, `tokens-model.test.ts`, `use-token-commands.test.tsx`, and `control-plane-workers.test.ts` fail to resolve their modules (`api/read-pages`, `workers/tokens-wire`, `workers/useTokenCommands`), so no test of theirs runs; `enrollment-tokens.test.tsx` resolves (its imports exist at the base, the new types being erased) and 54 of its 55 tests fail on the missing section (the one that passes is "reads nothing without the installation-owner role", which the 33a gate already satisfied); `workers-page.test.tsx` fails its empty-state test (no link); `theme-contrast.test.ts` fails "hovered danger light" in the light scheme (3.76:1). Totals: 8 files failed, 56 tests failed, 92 passed.
- Targeted mutations of `f1cdbc77`, one at a time, each restored with `git checkout` (script `mutate-33b.py` in the scratchpad), run over the six token test files and the two board tests of the page limit (338 tests):
  - Secret kept after close (`mut-33b-secret-kept-after-close.log`): `closeReveal` clears nothing: fail 4, the close-after-copy, Close-anyway, rotation-replaces, and real-gateway redaction tests.
  - CSRF never resent (`mut-33b-csrf-never-resent.log`): every `csrf-rejected` is final: fail 7, the six stale-token page tests and the model test.
  - CSRF resent forever (`mut-33b-csrf-resent-forever.log`): every `csrf-rejected` retries: fail 2, the second-refusal page test and the model test.
  - Generation ignored (`mut-33b-generation-ignored.log`): the resend ignores `signedInGeneration`: fail 1, "sends nothing again when the session read finds another operator".
  - Secret shape unchecked (`mut-33b-secret-shape-unchecked.log`): any string is a secret: fail 6, the two adapter tests of a 201 with a wrong secret and the four wire tests of the pattern.
  - List not reread (`mut-33b-list-not-reread.log`): no command refreshes the list: fail 11, every test that expects the list read again, the hook test included.
  - Truncation hidden (`mut-33b-truncation-hidden.log`): the adapter answers `truncated: false` always: fail 1, "says that the list was cut short at the page limit".
  - Second command overlaps (`mut-33b-second-command-overlaps.log`): the `inFlight` guard removed: fail 1, the hook's one-at-a-time test.
  - Retry on issue (`mut-33b-retry-on-issue.log`): `retryable` allows a Retry of any command without an answer: fail 3, the issue and rotate no-answer page tests and the model test.
  - Board limit tolerated (`mut-33b-board-limit-tolerated.log`): `readPages` passes a truncated list through: fail 3, the two unchanged board tests of the page limit and the `read-pages` test, which shows that the lift kept the board's rule.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `62908d3ae7c367309b4e163e851c960506045a41`; tests 4861, pass 4852, fail 0, skipped 9; all files 99.45% lines, 92.91% branches, 98.90% functions.
- `npm run openspec -- validate build-enrollment-tokens-screen --strict`: passed, `Change 'build-enrollment-tokens-screen' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 124 file(s); every pass summary file is valid: 104 file(s); every route file is valid: 57 file(s).`.
- Spec diff against the merge base `3191c26217da` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. The passes are run by the worker session, not by the subagent that developed the change. Review checklist of the brief: contract-drift, error-handling, concurrency-race, docs, redaction, spec-wording, evidence-mismatch.

No pass has run yet.

## Limitations

- The secret of a token whose 201 was lost is unrecoverable; the status says so and the list shows the token for a revoke or a rotation (design, decision 5 and "Risks").
- The CSRF resend of issue and rotate relies on the contract's "nothing took effect" for a `csrf-token-invalid` 403 (design, "Risks").
- The list is a snapshot with a manual refresh and a refresh after each answer that changed it; no token event exists on the wire.
- The reveal names where the installation CA fingerprint comes from and cannot show it (follow-up below).

## Follow-ups for the coordinator

- The installation CA fingerprint in the browser OpenAPI document (an OpenAPI change): `readInstallationCa` is served from the execution document only, so the SPA has no typed read of it and the reveal can only say that `TASKELITH_INSTALLATION_CA_SHA256` comes from the CLI enrollment bundle (decision Q2 addition; design, "Follow-ups").
- Idempotency keys on `issueEnrollmentToken` and `rotateEnrollmentToken` (an OpenAPI and control-plane change): without one no failure of issue or rotate can be retried, and a lost 201 leaves a pending token whose secret nobody has (decision Q12 addition; design, "Follow-ups").
- The `readPages` lift split the function into `readPagesUpTo` and a wrapping `readPages` so the tokens can report the page limit honestly; the board's behaviour and tests are unchanged, but the body is not verbatim (design, "Departures"); the coordinator may want to confirm that this meets the "pure move" wording.
- `scripts/check-comment-length.ts` still skips `.tsx` (33a follow-up); the `.tsx` comments of this change were checked by hand.

## Remaining gates

- Independent review passes under the brief's plan, run by the worker session.
- Architect check by the coordinator (Niki) of any fix no later pass reviews.
- Archive of the change in the last commit of the branch (protocol step 7).
- Integration into dev by the coordinator (single pull request).
