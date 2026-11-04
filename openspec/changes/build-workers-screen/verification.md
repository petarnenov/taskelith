# Verification: build-workers-screen

## Scope and source

G3 item 33 (`docs/g3-plan.md`, row 33), sub-change 33a under the coordinator's split (`brief-33-plan.md`, Niki, 2026-11-04), developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `d0acd304` (#445): the workers screen at `/app/workers` with the admission and self-check results of every enrolled worker as `listWorkers` answers them (decisions Q3 (a), Q6 (a), Q7 (a)), over a `WorkersGateway` port of its own with an adapter on the shared typed fetch and the shared expiry wrapper (Q8 (b)), the installation-owner gate (Q2 (a)), `asOf` with a Refresh that keeps the shown list (Q5 (a)), the empty state (Q4 (a)), the failed states, the contrast pair of a failed check on a card, and the redaction test (Q9 (a) and (b)) ([design](/openspec/changes/build-workers-screen/design.md), decisions 1 to 9). Out of scope: enrollment tokens (33b), account slots (33c), per-worker reachability, capacity, and last contact (departure with a follow-up for the contract change), live updates, and any OpenAPI or control-plane change.

Commit type: `apps/web` is a private workspace; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE`, so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `d0acd304ef722a5a9fec036a66bbb8060db9eb76`, the brief's checklist base and the merge base with `origin/dev`.
- `c09e8d4c` `chore: start the build-workers-screen change`: `.openspec.yaml` and the brief's `checklist.json` saved with `--save build-workers-screen --at d0acd304ef722a5a9fec036a66bbb8060db9eb76 --size M` (unedited); the empty `findings.jsonl` and `passes.jsonl` were added with the records commit below, not with this one.
- `01451efc` `test: expect the web workers screen, its installation-owner gate, the self-check results, and listWorkers`: the tests, before the implementation.
- `4499056b` `chore: build the web workers screen over a workers gateway with the installation-owner gate and the self-check results`. The first `npm run verify:comments` of the committed implementation failed on three three-line comments (`expiring-call.ts`, `useWorkers.ts`, `workers-wire.ts`); each was shortened and, because the branch was never pushed, the implementation commit was amended instead of a fix commit, so one route record describes the reviewed diff. The targeted mutations below ran against the commit before the amendment (`40599a91`), whose code differs only in those comments.
- `52ab84bd` `docs: record the build-workers-screen proposal, design, spec delta, and SPA status`: the proposal, the design, the spec delta, `tasks.md`, the empty `findings.jsonl` and `passes.jsonl`, this record's hand-written part, and the README status.
- `a05ed32c` `docs: route the build-workers-screen change` (`route.json`, unedited, at head `52ab84bd`): "route: elevated (lines, files), rule version 5", 1,172 lines in 25 files, size M; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.62) and agrees; recommendation only, the brief's effort medium applies.
- `docs: record the make verify run of the build-workers-screen change`: this record commit, with the generated part below; pass 1 reviews `d0acd304..` that commit.

## Environment

macOS 26.6 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker for the services of `make test`.

## Author self-check

- Scope: only the 33a scope of the decisions. `git diff d0acd304 HEAD -- packages apps/control-plane apps/worker package-lock.json` is empty: no OpenAPI document, generated type, contract, control-plane code, or dependency changed. `listWorkers`, `WorkersView`, `WorkerAdmissionEntry`, `WorkerHost`, `WorkerAdmissionState`, `SelfCheckResult`, `NotApplicableReason`, `AccessDenial`, and `InstallationRole` are in `control-plane.openapi.json` 0.5.0.
- Existing tests: `git diff d0acd304 HEAD --stat -- apps/web/test` touches `fakes.tsx` (`worker`, `workersView`, `FakeWorkersGateway`, and the `workersGateway` argument of `renderApp`), `style-nonce.test.tsx` (the `workers` prop of `App`, a genuine change of its props, as 31b's `turnRecords` was), `theme-contrast.test.ts` (one added pair), and the four new test files (`workers-wire.test.ts`, `workers-labels.test.ts`, `control-plane-workers.test.ts`, `workers-page.test.tsx`). `app.test.tsx` and `navigation.test.tsx`, which the brief names as the tests that pin the planned page, are unchanged and pass: the login landing test asserts the heading "Workers and account pools", which decision Q1 (a) keeps; the navbar choice test asserts the same heading; and the planned-page loop iterates `PLANNED_SCREENS`, from which `WORKERS` left, so the loop no longer visits `/workers`, and `workers-page.test.tsx` asserts instead that `/app/workers` shows the built screen without "it shows no data" and that the navigation entry opens it. Every other test file is unchanged and passes; the board's tests cover the moved `failureOf`, `denialOf`, `reachable`, and `expiringCall` through the re-exports.
- No mock data: the screen renders only the control plane's answers; fixtures live only in `apps/web/test/fakes.tsx` and the page test.
- Hexagonal boundaries: the screen depends on the `WorkersGateway` port and the `Session` context; only `control-plane-workers.ts` touches the typed fetch; `workers-wire.ts` and `workers-labels.ts` are plain TypeScript without React, tested without a DOM tree; `grep -rn "workers/" apps/web/src/board apps/web/src/agent-session` finds nothing, and `grep -rn "board/" apps/web/src/api apps/web/src/session` finds nothing, so the shared `api/read-result.ts` and `session/expiring-call.ts` depend on no screen.
- Redaction (design, decision 8): the view lives in the hook's state only; `grep -rn 'console\.\|localStorage\|sessionStorage' apps/web/src/workers` finds nothing; the parser rebuilds the view from the documented fields, and the wire, adapter, and page tests check that a planted field and the session token reach no view, HTML, storage, or console argument.
- Mantine only (D17): no CSS file, no `styles`, `classNames`, or `style` prop in `workers/`; `Card`, `List`, `Alert`, `Button`, `Group`, `Stack`, `Text`, and `Title` are Mantine components; the error color goes through the `c` prop as the theme's variable.
- Design rules: the Refresh and Retry buttons are the theme's 44 px `Button`s; hostnames, identifiers, check identifiers, and problems break through `Breakable` at phone width (the page test keeps the longest unbroken run at 16); the new pair "a failed self-check on a worker card" is in the contrast matrix for both schemes (light 5.46:1, dark 4.89:1); no badge is drawn.
- Spec delta: `product-ui` adds three requirements (492, 462, and 357 characters); `npm run openspec -- validate build-workers-screen --strict` passes; the pinned CLI archived the delta into strictly valid specs in a scratch copy of the repository's `openspec/` (`archive-probe-33a.log` in the session scratchpad: `+ 3 added`, `validate --all --strict` 71 passed, 0 failed; the `--archived` line of the probe fails only on the four tasks not yet ticked), which was then deleted.
- Comments: `npm run verify:comments` passes after the fix named under "Revision".
- Links: `npm run verify:links` passes.
- Type checks: `tsc -p apps/web/tsconfig.json` and `tsc -p apps/web/tsconfig.tooling.json`, which includes the tests, pass.
- Coverage (Vitest, `apps/web`, 780 tests in 30 files, `coverage-33a-0.log` in the session scratchpad, before the comment fix, which changed no code), per file changed or added by this change, as statements, branches, functions, and lines: `control-plane-workers.ts` 91.66 / 100 / 75 / 100 (its one uncovered function is the CSRF getter that answers nothing, which the client never calls for a GET), `src/workers` as a whole 98.36 / 99.02 / 97.29 / 100, `src/session` 100 / 99.09 / 100 / 100, `src/board` 98.41 / 97.29 / 100 / 100 (`control-plane-board.ts` 98.5 / 97.72 / 100 / 100 and `board-wire.ts` 98.3 / 99.13 / 100 / 100, their uncovered branches predating this change), and `WorkersPage.tsx`, `WorkersServices.tsx`, `useWorkers.ts`, `workers-labels.ts`, `workers-wire.ts`, `workers.ts`, `read-result.ts`, `expiring-call.ts`, `BoardServices.tsx`, `board.ts`, `App.tsx`, `routes.tsx`, and `screens.ts` at 100 on every metric; `apps/web` overall 98.99% statements, 97.5% branches, 99.82% functions, and 100% lines, every file at or above the 75% thresholds.
- Test authoring: no sleeps and no timers; the page tests hold answers in deferred promises, settle them inside `act`, and wait on rendered roles and `waitFor` (the overtaken read's answer settled through a zero-delay `setTimeout` until pass 1 finding 5); the redaction test's control plane answers only `/session` and `/workers` and throws on any other request.

## Evidence check

The generated part below matches the tree (`make record-check`). The `make verify` run before pass 1 is `verify-33a-1.log` in the session scratchpad, the run of the clean committed tree of `a05ed32c` (profile full, tree `7440f214`, 4,852 tests, 4,843 passed, 0 failed, 9 skipped; `apps/web` Vitest 780 tests in 30 files, 100% lines): passed at the first run, no rerun of any suite, nothing appended to the log; the record commit adds the generated part from it.

## Fail-before

Logs in the session scratchpad (`/private/tmp/claude-503/-Users-petarnenov-taskelith/38f2ee40-59fa-49d7-b7a0-efd6c305ef14/scratchpad`).

- Base (`fb-33a-base.log`): the tests of `01451efc` over the sources of `d0acd304` (`apps/web/src` stashed, the new source files included): the four new files fail to resolve their modules (`workers/control-plane-workers`, `workers/workers-labels`, `workers/workers-wire`); 4 of 6 files fail, no test of theirs runs; `theme-contrast.test.ts` passes, since the theme's error color already meets 4.5:1 on the card surface, and `style-nonce.test.tsx` passes at run time, since React ignores the unknown `workers` prop, while `tsc -p apps/web/tsconfig.tooling.json` refuses it against the base `App`.
- Targeted mutations of `40599a91` (the implementation before its comment amendment), one at a time, each restored with `git checkout` (script `mutate-33a.py` in the scratchpad), run over the four new test files (62 tests):
  - Gate ignored (`mut-33a-gate-ignored.log`): every signed-in operator passes the gate: fail 1, "shows the heading and the role it needs, and reads nothing, without the role".
  - Refresh blanks the list (`mut-33a-refresh-blanks.log`): the effect sets `loading` on every read: fail 3, the keeps-the-shown-list, overtaken-read, and reduced-motion tests.
  - Parser keeps the body (`mut-33a-parser-keeps-body.log`): `workersViewOf` returns the body as received: fail 3, the planted-field tests of the wire and the adapter and the no-`reportedAt` test.
  - Failed checks not first (`mut-33a-failed-not-first.log`): `failedFirst` puts them last: fail 2, the labels test and the page's check-list test.
  - 404 as not found (`mut-33a-404-not-found.log`): the adapter passes `failureOf` through: fail 1, "reads 404, which listWorkers does not document, as unavailable".
  - Stale answer shown (`mut-33a-stale-answer-shown.log`): the effect's `current` guard removed: fail 1, "drops the answer of a read that a later refresh overtook".

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `7440f214334489797beb3b6098d740dcd6c52074`; tests 4852, pass 4843, fail 0, skipped 9; all files 99.45% lines, 92.87% branches, 98.87% functions.
- `npm run openspec -- validate build-workers-screen --strict`: passed, `Change 'build-workers-screen' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 122 file(s); every pass summary file is valid: 102 file(s); every route file is valid: 55 file(s).`.
- Spec diff against the merge base `d0acd304ef72` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. The passes are run by the worker session, not by the subagent that developed the change. Review checklist of the brief: contract-drift, error-handling, concurrency-race, redaction, spec-wording, docs, evidence-mismatch.

## Fixes no later pass reviewed

None yet.

## Limitations

- The session's installation roles are a snapshot of the last successful session read (at the announced end of the session and on `refresh`); the gate follows them, and the control plane's 403 is the authority for a role that changed since (design, decision 4 and "Risks").
- The view is a snapshot with a manual Refresh; no worker event exists on the wire (design, "Follow-ups").
- The screen shows no reachability, capacity, or last contact, which the plan row names and the wire does not carry (design, "Departures").

## Remaining gates

- Independent review passes 1 to 3 as governance "Review sequence" requires, run by the worker session.
- Archive of the change in the last commit of the branch (protocol step 7).
- Integration into dev by the coordinator (single pull request).
