# Verification: serve-web-spa-from-control-plane

## Scope and source

G3 item 28 (`docs/g3-plan.md`, row 28), sub-change 28c, developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `12dee8c7` (#423): static serving of the built SPA under `/app/` on the browser endpoint, the SPA fallback, cache headers, the content security policy with a style nonce for Mantine and the related headers, path confinement, the behaviour without a build, and the image wiring ([design](design.md), decisions 1 to 10). Out of scope and untouched: every screen's content (items 29 to 34 and 40), new OpenAPI operations (none was needed, decision 10), and the regex-literal decoder of the bundle check.

Commit type: `apps/control-plane`, `apps/web`, and `infra/` are private workspaces and tooling; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE` (`package.json` `files`, checked by `scripts/verify-package.ts`), so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `12dee8c7af80e9064ac6ce4b6514207d845f07fa`, the brief's checklist base and the merge base. `git fetch origin` before routing showed `origin/dev` at `3341f8a8` (#424, `add-github-token-secret-shape`); the branch does not merge it.
- `08cf9a07` `chore: start the serve-web-spa-from-control-plane change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save serve-web-spa-from-control-plane --at 12dee8c7af80e9064ac6ce4b6514207d845f07fa --size M` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `dde56498` `chore: serve the built web SPA under /app/ on the browser endpoint`: the control plane, the SPA nonce, the image, and their tests.
- `3e96d94d` `docs: record the serve-web-spa-from-control-plane design, spec deltas, and SPA status`, with the README, the `Makefile` `web-dev` comment, and the installation contract's listeners.
- `0f34df27` `docs: route the serve-web-spa-from-control-plane change` (`route.json`, unedited, at head `3e96d94d`): "route: elevated (lines, files, contracts, docker), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.76) and agrees; recommendation only.
- `docs: record the make verify of serve-web-spa-from-control-plane` (this record), the `make record` of the passing `make verify` on the tree of `0f34df27`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test`; Google Chrome (headless) for the browser check below.

## Author self-check

- Scope: only the brief's 28c scope. No OpenAPI document, wire contract, or generated type changed (`git diff 12dee8c7 HEAD -- packages` is empty); no dependency changed (`package-lock.json` unchanged). The SPA change is wiring only: `pageStyleNonce` and the `styleNonce` prop of `App`.
- Library choice: no static plugin fits, because the control plane has no HTTP framework; `serve-static` and `send` were rejected for per-request file-system resolution and a new runtime dependency (design, decision 1).
- Hexagonal boundaries: the HTTP side depends on the `WebAppFiles` port (`src/api/web-app.ts`); only `src/composition/web-app-directory.ts` touches the file system, at start; `npm run check:boundaries` passes.
- API non-shadowing: every route is matched before the SPA, the SPA is passed only to the browser listener, and no path of `control-plane.openapi.json` lies under `/app` (test).
- Secrecy: the nonce is not a credential and is never logged; the request log of an SPA answer holds the operation `web-app` and no path or query (test).
- Spec deltas: `control-plane-api` adds five requirements (424, 235, 472, 367, and 418 characters); `product-ui` modifies "Web SPA development server" (477, its scenario kept) and adds "Web SPA style nonce" (363). `npm run verify:archive` archives them into strictly valid specs.
- Comments: `npm run verify:comments` passes; it does not check `.tsx`, so the comments of `App.tsx` and `style-nonce.test.tsx` were checked by hand; the Dockerfile comment is one line.
- Coverage: `apps/control-plane/dist/api/web-app.js` 100% lines, 94.87% branches, 100% functions; `web-app-directory.js` 100% in each; `apps/web/src` statements 100% (330/330), branches 100% (172/172), functions 100% (107/107), lines 100% (275/275), Vitest tests 146.

## Evidence check

The generated part below matches the tree (`make record-check`). The totals are from `verify-28c-2.log` in the session scratchpad, the second `make verify` on the tree of `0f34df27` (`05961f46`), unchanged between the runs. The first run, `verify-28c-1.log`, failed only `test/installation-script.test.ts` "a bound with a leading zero is read in base 10", whose timer measured 9.118 s for a 10 s bound (tests 4131, pass 4121, fail 1, skipped 9); this change does not touch `scripts/installation.sh` or that test, and the same test flaked on this host for 28b. The rerun passed.

Browser check (logs in the session scratchpad under `browser/`): a plain HTTP `createApiServer` with `readWebAppDirectory('apps/web/dist')` on `127.0.0.1`, loaded in headless Chrome at `/app/sessions`. With the shipped policy, Chrome logged no console message (`chrome.log`, 0 `CONSOLE` lines), Mantine's two style elements applied with their nonce hidden as the browser does under a policy, and the shell rendered its retry page against the stub API. With the nonce stripped from `style-src` by a wrapper (`chrome-no-nonce.log`), Chrome logged two "Applying inline style violates the following Content Security Policy directive 'style-src 'self''" errors, so the nonce is what admits Mantine's styles.

## Fail-before

Logs in the session scratchpad.

- Base (`fb-28c-base.log`, `fb-28c-base-web.log`): the new tests with the implementation files of `dde56498` removed and the rest of `12dee8c7`'s code rebuilt: `apps/control-plane/test/web-app.test.ts`, `control-plane-settings.test.ts`, and `test/web-app-build.test.ts` fail to load (`SyntaxError: The requested module '@taskelith/control-plane' does not provide an export named 'WEB_APP_DIR_VARIABLE'` or `'WEB_APP_NONCE_PLACEHOLDER'`), "the control-plane image serves the SPA that its build stage builds" fails (tests 20, pass 16, fail 4), and `apps/web/test/style-nonce.test.tsx` fails to resolve `../src/style-nonce`.
- Each guard broken on the tree of `dde56498`, one at a time, then restored; `web-app.test.ts` has 12 tests:
  - Path traversal through a link (`fb-28c-symlink-file.log`): the adapter also reads a link that points to a file: fail 1, "a path that leaves the build is refused and never answers a file outside it". Following every link (`fb-28c-symlink-follow-all.log`) loops through the `outside` link and the build no longer loads.
  - Refused segments (`fb-28c-segments.log`): the dot, separator, and NUL check disabled: fail 1, the same traversal test (`/app/..%2Foutside` and the others without an extension answered the page).
  - Fallback (`fb-28c-fallback.log`): any missing file answers the page: fail 2, "a missing file with an extension is a 404, never the page" and the traversal test.
  - Shadowing (`fb-28c-shadowing.log`): the SPA consulted before the routes: fail 1, "no API path is shadowed: routes come first, and paths outside /app/ never get the page".
  - Cache headers (`fb-28c-cache.log`): every file immutable: fail 1, "a hashed asset is immutable for a year, and any other file is revalidated".
  - Policy (`fb-28c-csp.log`): `style-src 'self' 'unsafe-inline'` instead of the nonce: fail 2, the page test and "the page and its files carry the content security policy and the related headers".
  - Fresh nonce (`fb-28c-nonce.log`): one fixed nonce: fail 1, "every path without a file extension under /app/ answers index.html with a fresh nonce".
  - Mantine nonce (`fb-28c-web-nonce.log`): `getStyleNonce` removed from `App`: Vitest tests 3, fail 1, "reaches every style element that Mantine adds".

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `05961f46c6228cea95df8379c87fc6320f49d9c2`; tests 4131, pass 4122, fail 0, skipped 9; all files 99.39% lines, 92.60% branches, 98.88% functions.
- `npm run openspec -- validate serve-web-spa-from-control-plane --strict`: passed, `Change 'serve-web-spa-from-control-plane' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 100 file(s); every pass summary file is valid: 80 file(s); every route file is valid: 33 file(s).`.
- Spec diff against the merge base `12dee8c7af80` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not started. Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2, which needs governance authorization.

## Limitations

- No image was built or started: the image wiring is checked by `test/installation-composition.test.ts` against the Dockerfile, and serving by the unit tests and the headless Chrome run over plain HTTP, not over the installation's HTTPS endpoint.
- The build is held in memory without a size bound, and a file swapped for a link between the directory read and the file read at start would be read through it (design, "Risks and trade-offs").
- No `Strict-Transport-Security` header (design, decision 7).

## Remaining gates

- Independent review passes 1 and 2, and pass 3 after a pass 2 with a Medium or worse finding.
- Architect check by the coordinator of any unreviewed fixes.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request)
