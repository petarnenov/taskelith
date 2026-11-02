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
- `docs: record the make verify of build-web-spa-shell` (this record), the `make record` of the passing `make verify` on the tree of `a683a63b`.

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

Review plan (governance v10, owner decision 2026-11-02; at most three passes, stopping at a pass that reports only Low findings or none):

- Pass 1: reviewer A `codex gpt-6-astra#medium`.
- Pass 2: reviewer B `claude claude-fable-5-1#medium`.
- Pass 3, only after a pass 2 with a Medium or worse finding: reviewer A `agy gemini-4-argon-medium#medium`.

Reviewer mismatch: `route.json` (rule version 3) names `codex gpt-6.1-sol#high` for pass 3 and effort `high` for every pass; by owner decision 2026-11-02 pass 3 is Argon, and every pass runs at the routed effort `medium` that the brief names.

### Pass 1

Not run yet.

### Pass 2

Not run yet.

### Pass 3

Not run yet; runs only after a pass 2 with a Medium or worse finding.

### Architect check of unreviewed fixes

Place for the coordinator's check of any fix that no later pass reviews.

## Limitations

- No browser run against a running installation: the shell was tested in jsdom with a fake gateway and a fake `fetch`, and `make web-dev` was not started; 28c or the first installation run closes this, as for 28a.
- jsdom has no layout, so the 44 px targets are checked through the theme's default props, not measured, and the phone-width layout was not checked in a browser.
- The contrast test covers the pairs the shell draws (design, decision 7), not hover states or the pairs of later screens.
- The expiry check trusts the client clock within a 10 s margin (design, "Risks and trade-offs").

## Remaining gates

- Independent review passes 1, 2, and, after a pass 2 with a Medium or worse finding, 3, recorded in `passes.jsonl`, `findings.jsonl`, and this record.
- Architect check by the coordinator of any unreviewed fixes.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
