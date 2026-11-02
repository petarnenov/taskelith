# Verification: build-web-spa-shell

## Scope and source

G3 item 28 (`docs/g3-plan.md`, row 28), sub-change 28b, developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `ecf8cd3c` (#418): the session shell, routing under `/app/`, login and logout against the existing `readSession`, `logIn`, and `logOut` operations, session expiry handling, the dark and light themes with a kept choice and a contrast test, the D10 navigation, the seven icons of the proof of concept, and an empty Mantine page per screen that names its G3 item ([design](design.md), decisions 1 to 11), plus the follow-up of #417 that the web build ignores `NODE_ENV` (decision 10). Out of scope and untouched: 28c (static serving, SPA fallback, CSP), every screen's content (items 29 to 34 and 40), the OpenAPI document, and the control plane.

## Revision

- Base: `dev` `ecf8cd3c62d293bab7330bc5318a8be4335f8cea`, the brief's checklist base; `git fetch origin` before routing showed `origin/dev` still at `ecf8cd3c`.
- `e36d87d5` `test: check that the web build ignores NODE_ENV`: the fail-before test alone, failing on this commit (see "Fail-before").
- `1682692d` `chore: build the web SPA in production mode whatever NODE_ENV says`: the fix in `apps/web/vite.config.ts`.
- `2548069c` `chore: start the build-web-spa-shell change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save build-web-spa-shell --at ecf8cd3c62d293bab7330bc5318a8be4335f8cea --size M-L` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `661fa865` `chore: build the web SPA session shell with routes, themes, and the D10 navigation`: `apps/web/src` and its tests, React Router's texts in `scripts/check-web-bundle.ts`, and the updated markers and allowlist format test in `test/check-web-bundle.test.ts`.
- `2a727030` `docs: record the build-web-spa-shell design, spec delta, and README status`.
- `a683a63b` `docs: route the build-web-spa-shell change` (`route.json`, unedited, at head `2a727030`): "route: elevated (lines, files, size), rule version 3"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.79) and agrees; recommendation only.
- `bc71cc6b` `docs: record the make verify of build-web-spa-shell`, the `make record` of the passing `make verify` on the tree of `a683a63b`; pass 1 reviewed this head.
- `226d6fa0` merges `origin/dev` `26697ab0` (#419, governance v10) without conflicts; the change is not routed again.
- `9eece10a`, `1c7847b0`, and `a10be4ae`: the review pass 1 fixes, and the commit after them records the findings (section "Review pass 1 fixes").

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test`.

## Author self-check

- Scope: only the brief's 28b scope. No OpenAPI operation, contract document, or control-plane file changed (`git diff ecf8cd3c HEAD -- packages` is empty); login needs no new operation, because `readSession` starts the anonymous session whose CSRF token `logIn` needs. No dependency changed: React Router and Mantine came with 28a, and `package-lock.json` is unchanged. No mock or sample data: each page names its screen, its G3 item, and its change, and says that it shows no data.
- D17: only Mantine components, their props, and theme settings in `createTheme` (`primaryShade`, two color tuple shades, component default props); no CSS file, no Styles API, no custom component library. React Router's `Link` is the `component` of Mantine's `Button` and `NavLink`. The seven icons are the proof of concept's `icons.tsx` unchanged.
- System fonts: the theme sets no font family, so Mantine's system stacks apply; the bundle check finds no external origin.
- Proof of concept: the design names the followed sources (`docs/ui-poc/src/main.tsx`, `theme.ts`, `icons.tsx`) and each departure with the requirement or decision behind it ("Reference proof of concept").
- Hexagonal boundaries: the shell depends on `SessionGateway` and `Clock` ports; `createSessionGateway` is the only module that knows the session wire format; `npm run check:boundaries` passes.
- Secrecy: no credential, token, or key is in the repository, the bundle, or a log; the tests use fixture strings (`fixture-password`, `fixture-secret`, tokens of repeated letters). The CSRF token lives in memory only.
- Spec delta: `product-ui` adds "Web SPA session shell" (396 characters), "Web SPA session expiry" (274), "Web SPA screen routes" (368), and "Web SPA color schemes" (362), and modifies "Web SPA bundle boundary" (434, 413 before), keeping its four scenarios and adding "Development NODE_ENV in the shell". `npm run verify:archive` archives it into strictly valid specs.
- Comments: `npm run verify:comments` passes; it does not check `.tsx`, so every comment in the new `.tsx` files was checked by hand against two lines of 80 characters (coordinator answer 6 of 28a).
- Coverage of `apps/web/src`: statements 100% (237/237), branches 99.17% (120/121), functions 100% (79/79), lines 100% (199/199), in the Vitest run of the `make verify` below (tests 106, pass 106).

## Evidence check

The generated part below matches the tree (`make record-check`). The Vitest totals and coverage above are from `verify-28b-2.log` in the session scratchpad. A first `make verify` on the same tree (`verify-28b-1.log`) failed only `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` "a token that expires while its use waits for the row lock enrolls nothing" (tests 4090, pass 4080, fail 1, skipped 9): the test gives its token one second of life and holds a row lock for 1.5 s, and the loaded host stretched it; this change touches no PostgreSQL code, and the second run passed unchanged.

## Fail-before

Logs in the session scratchpad.

- `NODE_ENV` (`fail-before-node-env.log`): the new test of `e36d87d5` with `apps/web/vite.config.ts` of `ecf8cd3c`, after `npm run build`; `node --experimental-strip-types --test --test-name-pattern='whatever NODE_ENV' test/check-web-bundle.test.ts`: tests 1, pass 0, fail 1, "the web build yields the production bundle whatever NODE_ENV says", with `assets/index-DXIfAk-p.js: references the external origin of https://react.dev/link/special-props` and further `react.dev/link/...` links of React's development build. It passes on `1682692d`.
- Contrast settings (`fb-28b-contrast.log`): `primaryShade` and the two color tuple shades removed from `apps/web/src/theme.ts` on the recorded tree; `test/theme-contrast.test.ts`: tests 32, pass 27, fail 5 (dimmed text on the page and on a dropdown in both schemes, filled primary in the light scheme); restored with `git checkout`.
- React Router's texts (`fb-28b-allowlist.log`): the four new `ALLOWED_URLS` entries removed on the recorded tree, over the dist that `make verify` built; "the built web SPA holds no secret shape, environment value, or external origin": tests 1, pass 0, fail 1, naming `http://localhost`, `//g,`, `https://reactrouter.com/en/main/routers/picking-a-router.`, and `server://singlefetch/`; restored with `git checkout`.
- Required-field asterisk: `withAsterisk={false}` turned back on in `SignInPage.tsx` before the commit; the sign-in page test failed (tests 21, pass 20, fail 1) and passed after the restore.
- The other tests are new tests of new behavior; `test/theme-contrast.test.ts` also shows that Mantine's default dimmed text fails the 4.5:1 check.

## Review pass 1 fixes

Pass 1 (reviewer A, codex gpt-6-astra, variant medium, session `01a19e4e-66c1-75c3-8dfe-f7d538fc2060`) reported 0 Critical, 0 High, 5 Medium, and 4 Low findings (`findings.jsonl`, `passes.jsonl`).

- `9eece10a` `chore: guard the web session against late and invalid answers and fit the shell to review pass 1` (findings 1 to 5 and 9).
- `1c7847b0` `test: name the React Router source of each allowed bundle URL and reject near misses` (the coordinator's conditions on the allowlist).
- `a10be4ae` `docs: apply review pass 1 fixes to the build-web-spa-shell design, spec delta, and review plan` (findings 6 to 8, and the fixes of the others in `design.md`).

| Finding | Fix | Fail-before |
| --- | --- | --- |
| 1 (Medium) | The gateway's token keeper counts the logins and logouts that ended; an answer to a request sent before one ended keeps no token, and a late logout does not forget a later login's token (design, decision 1) | `fb-28b-p1-gateway.log`: the new tests against the gateway of `bc71cc6b`, tests 31, fail 16, among them both "answer order" tests (the stale read's token and the forgotten login token were sent) |
| 2 (Medium) | A successful logout shows the sign-in page at once, cancelling the expiry check; every answer changes the view only if no newer view showed; the post-logout read takes over only an authenticated session (design, decision 2) | `fb-28b-p1-provider.log`: `SessionProvider.tsx` of `bc71cc6b` under the final tests, tests 29, fail 6, among them "shows the sign-in page as soon as the logout ends, before the next read", "keeps a new login over the read that followed the logout", and "keeps a new login over a logout that ends after the session expired"; `fb-28b-p1-guard-mutation.log`: with the provider's view guard disabled, the two "keeps a new login" tests fail |
| 3 (Medium) | The gateway checks the fields it uses and maps an empty, HTML, incomplete, or unparsable body to unavailable; the provider reads a rejected gateway call as unavailable or a failed logout; the sign-in form always leaves its submitting state | `fb-28b-p1-gateway.log`: the 14 "invalid answers" tests failed (TypeError or a wrong outcome); `fb-28b-p1-provider.log`: the three "gateway that rejects" tests failed with unhandled rejections |
| 4 (Medium) | Hover pairs of every variant and the hovered navigation link in the contrast test; `indigo.2` `#c8d3ff` in `createTheme` (4.13:1 to 4.59:1) | `fb-28b-p1-contrast-hover.log`: the extended test against the theme of `bc71cc6b`, tests 42, fail 1, "keeps hovered primary light at 4.5:1 or more", 4.127 in the light scheme |
| 5 (Medium) | Below `sm` the header keeps the burger, the logo, "Needs you", and the account menu, and the navbar takes "New task" and the scheme switch, through Mantine's `visibleFrom` and `hiddenFrom` only (design, decision 5) | `fb-28b-p1-header.log`: the phone-width test against `AppLayout.tsx`, `navigation.tsx`, and `ColorSchemeToggle.tsx` of `bc71cc6b`, fail 1 (five controls instead of three) |
| 6 (Low) | The retry-only page is limited to a session read without a valid answer; a failed login or logout keeps the current page and says so; scenarios "Control plane without a valid answer" and "Late answer" | Records only |
| 7 (Low) | "a URL of an external origin" restored in "Web SPA bundle boundary" | Records only |
| 8 (Low) | The review plan cites the owner decision of 2026-11-02 and governance v10, on this branch since `226d6fa0`, and calls `medium` the authorized effort | Records only |
| 9 (Low) | The invalid-request hint states the `LoginName` pattern, 1 to 64 characters starting with a letter or digit, and a password of 1 to 1024; the fields carry `maxLength` 64 and 1024 | `fb-28b-p1-signin-limits.log`: against `SignInPage.tsx` of `bc71cc6b`, tests 29, fail 2, the boundary test (a 65th character was taken) and the invalid-request hint |

Coordinator conditions on the bundle allowlist: each React Router entry is an exact string, which the check compares whole through `Map.has`, applies only to `.js` files, and has a comment naming its React Router 8.5.1 source (design, decision 11). The new test "the React Router texts pass only exactly and only in scripts" rejects `http://localhost:1234`, `http://localhost.example.com`, `https://localhost`, `server://singlefetch/x`, and `//g.example` in a script and every entry in `index.html` and a style sheet; it pins behavior that already held, so it passes on `bc71cc6b` too, and `fb-28b-p1-allowlist-mutation.log` shows it failing with a prefix match in place of `Map.has`. New task is the empty `PlannedPage` route stub that names item 30, and each departure from the proof of concept names its source in `docs/ui-poc/` and, where it applies, D10 (design, "Proof of concept").

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `npm run test --workspace=@taskelith/web` (inside `make verify`) | `a683a63b` | tests 106, pass 106; statements 100%, branches 99.17%, functions 100%, lines 100% |
| `npm run verify:comments`, `verify:links`, `verify:archive`, `verify:findings`, `verify:web-api-types`, `check:boundaries` | `2a727030` | each passed |
| `npm run openspec -- validate build-web-spa-shell --strict` | `2a727030` | `Change 'build-web-spa-shell' is valid` |
| `make record-check CHANGE=build-web-spa-shell` | this record | `the generated part matches the tree` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `0b5f5fc75590d48f47830433c4c572bc789fdb3c`; tests 4090, pass 4081, fail 0, skipped 9; all files 99.39% lines, 92.59% branches, 98.87% functions.
- `npm run openspec -- validate build-web-spa-shell --strict`: passed, `Change 'build-web-spa-shell' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 95 file(s); every pass summary file is valid: 75 file(s); every route file is valid: 30 file(s).`.
- Spec diff against the merge base `ecf8cd3c62d2` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Review plan (at most three passes, stopping at a pass that reports only Low findings or none), after the owner decision of 2026-11-02 that governance policy version 10 records: `docs/governance.md` on this branch holds version 10 since `226d6fa0` merged `origin/dev` `26697ab0` (#419, `assign-argon-to-review-pass-3`); the tree that pass 1 reviewed held version 9, and the decision applied to it already under "Tasks during the change to version 10":

- Pass 1: reviewer A `codex gpt-6-astra#medium`.
- Pass 2: reviewer B `claude claude-fable-5-1#medium`.
- Pass 3, only after a pass 2 with a Medium or worse finding: reviewer A `agy gemini-4-argon-medium#medium`.

Reviewer mismatch: `route.json` (rule version 3) names `codex gpt-6.1-sol#high` for pass 3 and effort `high` for every pass, which only recommends (governance "Routed effort"). Pass 3 is Argon by the owner decision of 2026-11-02 (governance v10, "Reviewer assignment"), and every pass runs at `medium`, the effort that the authorized reviewer list authorizes and the brief names, not the routed `high`. Later passes keep this `route.json`; the change is not routed again.

### Pass 1

Reviewer A, codex gpt-6-astra, variant medium, session `01a19e4e-66c1-75c3-8dfe-f7d538fc2060`, on head `bc71cc6b`: 0 Critical, 0 High, 5 Medium, 4 Low, all fixed (section "Review pass 1 fixes"); the counts match `passes.jsonl`.

- Invocation: `env -u JEV_MAF_LAB make review CHANGE=build-web-spa-shell PASS=1 REVIEWER='codex gpt-6-astra#medium' PROMPT=review-28b-p1.md LOG=review-28b-p1.log`, prompt, log, report, and the output of `make review` (`review-28b-p1.out`) in the session scratchpad, outside the tree. `make review` ran `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /Users/petarnenov/taskelith-worktrees/build-web-spa-shell -`, environment `PATH HOME USER LANG TERM TMPDIR`, started 2026-11-02T22:08:20.465Z, and printed "route: recommends effort high; the authorized medium applies (policy version 9)".
- Confirmation, as `make review` printed it from the reviewer's log: `session: 01a19e4e-66c1-75c3-8dfe-f7d538fc2060`, `model: gpt-6-astra (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`.
- Snapshot: the tree's snapshot before and after the review was identical (`1bb5e429ebfd5074ddd1ae373ba62b7f78d88780ee6d432b842e99ac5722f4b1`); the reviewer changed no file.

### Pass 2

Not run yet.

### Pass 3

Not run yet; runs only after a pass 2 with a Medium or worse finding.

### Architect check of unreviewed fixes

Place for the coordinator's check of any fix that no later pass reviews.

## Limitations

- No browser run against a running installation: the shell was tested in jsdom with a fake gateway and a fake `fetch`, and `make web-dev` was not started; 28c or the first installation run closes this, as for 28a.
- jsdom has no layout, so the 44 px targets are checked through the theme's default props, not measured; the phone-width header is checked through Mantine's `visibleFrom` and `hiddenFrom` classes and the width arithmetic of design decision 5, not in a browser at 320 px.
- The contrast test covers the pairs the shell draws at rest and hovered (design, decision 7), not focus rings or the pairs of later screens.
- The expiry check trusts the client clock within a 10 s margin (design, "Risks and trade-offs").

## Remaining gates

- Independent review pass 2 and, after a pass 2 with a Medium or worse finding, pass 3, recorded in `passes.jsonl`, `findings.jsonl`, and this record; pass 1 is recorded.
- Architect check by the coordinator of any unreviewed fixes.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
