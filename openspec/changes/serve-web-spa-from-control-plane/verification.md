# Verification: serve-web-spa-from-control-plane

## Scope and source

G3 item 28 (`docs/g3-plan.md`, row 28), sub-change 28c, developed by a briefed subagent of the worker session Desi for the coordinator Niki (architect), from `dev` `12dee8c7` (#423): static serving of the built SPA under `/app/` on the browser endpoint, the SPA fallback, cache headers, the content security policy with a style nonce for Mantine and the related headers, path confinement, the behaviour without a build, and the image wiring ([design](design.md), decisions 1 to 10). Out of scope and untouched: every screen's content (items 29 to 34 and 40), new OpenAPI operations (none was needed, decision 10), and the regex-literal decoder of the bundle check.

Commit type: `apps/control-plane`, `apps/web`, and `infra/` are private workspaces and tooling; the published `taskelith` package ships only `dist/cli.js`, `docs/architecture.md`, `README.md`, and `LICENSE` (`package.json` `files`, checked by `scripts/verify-package.ts`), so every commit uses `chore`, `test`, or `docs`, never `feat` or `fix`.

## Revision

- Base: `dev` `12dee8c7af80e9064ac6ce4b6514207d845f07fa`, the brief's checklist base; the merge base with `origin/dev` is `3341f8a8` since `6b390339`. `git fetch origin` before routing showed `origin/dev` at `3341f8a8` (#424, `add-github-token-secret-shape`); the pass 1 fix round merges it.
- `08cf9a07` `chore: start the serve-web-spa-from-control-plane change`: `.openspec.yaml`, the brief's `checklist.json` saved with `--save serve-web-spa-from-control-plane --at 12dee8c7af80e9064ac6ce4b6514207d845f07fa --size M` (unedited), and the empty `findings.jsonl` and `passes.jsonl`.
- `dde56498` `chore: serve the built web SPA under /app/ on the browser endpoint`: the control plane, the SPA nonce, the image, and their tests.
- `3e96d94d` `docs: record the serve-web-spa-from-control-plane design, spec deltas, and SPA status`, with the README, the `Makefile` `web-dev` comment, and the installation contract's listeners.
- `0f34df27` `docs: route the serve-web-spa-from-control-plane change` (`route.json`, unedited, at head `3e96d94d`): "route: elevated (lines, files, contracts, docker), rule version 5"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium`, which governance runs only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` elevated (P(third) 0.76) and agrees; recommendation only.
- `8f8367f1` `docs: record the make verify of serve-web-spa-from-control-plane`, the `make record` of the passing `make verify` on the tree of `0f34df27`; pass 1 reviewed this head.
- Pass 1 fix round: `6b390339` merges `origin/dev` `3341f8a8` (#424, no conflict); `41e12b2e` `test: expect the SPA to refuse raw dot segments, links, and replaced entries, with headers on failures and on the browser endpoint only`; `da8aa6d4` `chore: check the SPA path as sent, remember left-out links, read the build without following links, and reserve /app/ in the wire contracts`; then the docs and records commits of the round and the `make record` of its `make verify` (`b8a15dc6`); pass 2 reviewed this head.
- Pass 2 fix round: `8daccf93` `test: expect the web build's start failure to name the directory and the error code`; `e650fdd5` `chore: name the directory and the error code in the web build's start failure` (L4); `14c45a97` `chore: name the SPA's file answer and the listener context apart from the page and the listener` (L5); `355854b5` `docs: apply review pass 2 fixes to the serve-web-spa-from-control-plane records` (L1 to L3, and the directory of L4 in the design, the spec delta, and the installation contract); then the record of pass 2 and the `make record` of its `make verify`.

## Environment

macOS 26.6.2 on x86_64 (the iMac); Node.js 24.22.1 (`.nvmrc`) and the `Makefile`'s npm pin; Docker 29.5.2 for the services of `make test`; Google Chrome (headless) for the browser check below.

## Author self-check

- Scope: only the brief's 28c scope. No change under `packages/contracts`, so no OpenAPI document or generated type changed (`git diff 12dee8c7 HEAD -- packages` is empty); the wire contracts gain the `/app` reservation and the installation contract's listeners name `TASKELITH_WEB_APP_DIR`; no dependency changed (`package-lock.json` unchanged). The SPA change is wiring only: `pageStyleNonce` and the `styleNonce` prop of `App`.
- Library choice: no static plugin fits, because the control plane has no HTTP framework; `serve-static` and `send` were rejected for per-request file-system resolution and a new runtime dependency (design, decision 1).
- Hexagonal boundaries: the HTTP side depends on the `WebAppFiles` port (`src/api/web-app.ts`, `file` and `isLeftOut`); only `src/composition/web-app-directory.ts` touches the file system, at start; its optional `WebAppEntryProbe` is the tests' barrier between the listing and each open; `npm run check:boundaries` passes.
- API non-shadowing: every route is matched before the SPA, the SPA is passed only to the browser listener, and no path of `control-plane.openapi.json` lies under `/app` (test).
- Secrecy: the nonce is not a credential and is never logged; the request log of an SPA answer holds the operation `web-app` and no path or query (test).
- Spec deltas: `control-plane-api` adds five requirements (452, 235, 493, 475, and 436 characters, after the pass 2 fixes); `product-ui` modifies "Web SPA development server" (477, its scenario kept) and adds "Web SPA style nonce" (363). `npm run verify:archive` archives them into strictly valid specs.
- Comments: `npm run verify:comments` passes; it does not check `.tsx`, so the comments of `App.tsx` and `style-nonce.test.tsx` were checked by hand; the Dockerfile comment is one line.
- Coverage (pass 2 fix round): `apps/control-plane/dist/api/web-app.js` 100% lines, 95.45% branches, 100% functions; `web-app-directory.js` 100% lines, 91.84% branches (95.65% after pass 1; the fallback of an error without a code is not reached), 100% functions; `apps/web/src` statements 100% (330/330), branches 100% (172/172), functions 100% (107/107), lines 100% (275/275), Vitest tests 146.

## Evidence check

The generated part below matches the tree (`make record-check`). Its totals are from `verify-28c-p2-1.log` in the session scratchpad, the first `make verify` of the pass 2 fix round, on the tree of `e5518458` (`4e0e5944`); it passed, so no rerun was needed. In the pass 1 fix round they came from `verify-28c-p1-1.log`, on the tree of `72e58479` (`17656e3e`), which also passed on its first run. Before that round, the totals came from `verify-28c-2.log`, the second `make verify` on the tree of `0f34df27` (`05961f46`), unchanged between the runs. The first run, `verify-28c-1.log`, failed only `test/installation-script.test.ts` "a bound with a leading zero is read in base 10", whose timer measured 9.118 s for a 10 s bound (tests 4131, pass 4121, fail 1, skipped 9); this change does not touch `scripts/installation.sh` or that test, and the same test flaked on this host for 28b. The rerun passed.

Browser check (logs in the session scratchpad under `browser/`): a plain HTTP `createApiServer` with `readWebAppDirectory('apps/web/dist')` on `127.0.0.1`, loaded in headless Chrome at `/app/sessions`. With the shipped policy, Chrome logged no console message (`chrome.log`, 0 `CONSOLE` lines), Mantine's two style elements applied with their nonce hidden as the browser does under a policy, and the shell rendered its retry page against the stub API. With the nonce stripped from `style-src` by a wrapper (`chrome-no-nonce.log`), Chrome logged two "Applying inline style violates the following Content Security Policy directive 'style-src 'self''" errors, so the nonce is what admits Mantine's styles.

## Image build and smoke

Coordinator condition b of the pass 1 fix round; logs in the session scratchpad.

- Build (`image-28c-p1-build.log`): `make installation-build` at head `da8aa6d4` with a clean code tree, exit 0. It builds the `control-plane` and `worker` stages of `infra/installation/Dockerfile` through `scripts/installation.sh build` into `taskelith-control-plane:taskelith-1897053002-installation` (`sha256:ca7c3c9db0f3…`, 334 MB) and `taskelith-worker:taskelith-1897053002-installation` (407 MB). `make installation-build` takes no Docker slot, so none was taken; nothing was pruned. The control-plane image's environment holds `TASKELITH_WEB_APP_DIR=/opt/taskelith/apps/web/dist` (`docker image inspect`).
- Smoke (`smoke-28c-p1.log`): `docker run -d --name taskelith-28c-smoke -p 127.0.0.1:18480:8080` of that image with a read-only bind mount of a scratchpad script as `/opt/taskelith/smoke.mjs` and the command `node smoke.mjs`, which calls the image's own `readWebAppDirectory(process.env.TASKELITH_WEB_APP_DIR)` and `createApiServer(handlers, { webApp })` with refusing handlers on plain HTTP; then `docker stop` and `docker rm`.
  - `curl -sS -D - http://127.0.0.1:18480/app/`: `200`, `content-type: text/html; charset=utf-8`, `cache-control: no-cache`, `content-security-policy: default-src 'none'; script-src 'self'; style-src 'self' 'nonce-CIJoGkCFtvXItiX5DWN5oQ=='; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, with `nosniff`, `no-referrer`, `DENY`, and both same-origin policies; the 531-byte page loads `/app/assets/index-Jcys7jHB.js` and holds no `TASKELITH_CSP_NONCE` left.
  - `curl -sS -D - http://127.0.0.1:18480/app/assets/index-Jcys7jHB.js`: `200`, `content-type: text/javascript; charset=utf-8`, `cache-control: public, max-age=31536000, immutable`, `content-length: 548385`, and the policy with `style-src 'self'`.

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

### Fail-before of the pass 1 fixes

Logs in the session scratchpad. `41e12b2e` holds the tests alone.

- Unit (`fb-28c-p1-unit.log`): the tests of `41e12b2e` against the sources of `8f8367f1` (`web-app.ts`, `api-server.ts`, `web-app-directory.ts`, `index.ts`, and the wire contracts restored from `HEAD` over the fixed files, then `npx tsc -b apps/control-plane`, then the fixes applied again), `node --experimental-strip-types --test apps/control-plane/test/web-app.test.ts`: tests 19, pass 11, fail 8, each new or changed test failing on its own:
  - "a dot segment that the URL would remove is refused before any lookup" (finding 1): `/app/%2e/sessions` actual 200, expected 404.
  - "a file replaced by a link after the directory listed it fails the read", "a directory replaced by a link after the listing fails the read", "a directory replaced by a link while its files are read fails the read", and "a build root that is a symbolic link fails the read and names the variable" (finding 2): each `expected a failure`, the read succeeded.
  - "a link of the build without an extension, and every path below a link, is a 404, never the page" (finding 3): `/app/leak` actual 200, expected 404.
  - "every failure of the web app carries the security headers and stays JSON and no-store" (finding 4): `GET /app/assets/index-missing.js` actual `[application/json, no-store, nosniff, undefined, undefined, undefined, undefined]`, expected `no-referrer`, `DENY`, `same-origin`, `same-origin` in the last four.
  - "no operation of the control-plane document lives under /app, which the wire contracts reserve" (coordinator condition a): the wire contracts did not match `/^The path `\/app` and every path below `\/app\/` are reserved for the built SPA/m`.
- With the fixes (`da8aa6d4`), the same command: tests 19, pass 19, fail 0.
- Integration (finding 5; `it-28c-p1-fixed.log`, `fb-28c-p1-worker-build.log`, `fb-28c-p1-browser-no-build.log`): `node --experimental-strip-types scripts/docker-slot.ts run -- bash scripts/services.sh run taskelith-1897053002-verify` around `node --experimental-strip-types --test --test-name-pattern='TLS listeners' apps/control-plane/test/control-plane-api.integration.test.ts`, with `SETTINGS.webAppDirectory` set to a fixture build. Fixed: tests 10, pass 10, fail 0. The worker listener also given the build in `src/composition/control-plane.ts`: fail 1, "the browser endpoint serves the configured web build, and the worker endpoint never does" (`/app/sessions` on the worker endpoint actual `[200, text/html; charset=utf-8]`, expected `[404, application/json]`). The browser listener without the build: fail 1, the same test (`/app/sessions` on the browser endpoint actual `[404, application/json]`, expected `[200, text/html; charset=utf-8]`). The file was restored and rebuilt after each run (`git diff` empty).

### Fail-before of the pass 2 fixes

Logs in the session scratchpad. `8daccf93` holds the test alone.

- L4 (`fb-28c-p2-directory.log`): the test of `8daccf93` against the sources of `b8a15dc6`, after `npx tsc -b apps/control-plane`, `node --experimental-strip-types --test apps/control-plane/test/web-app.test.ts`: tests 19, pass 18, fail 1, "a directory without index.html or that cannot be read fails and names it and the error": for the directory without `index.html`, actual details `directory` and `code` `[undefined, undefined]`, expected the directory and `undefined`. With `e650fdd5` (`fb-28c-p2-directory-fixed.log`): tests 19, pass 19, fail 0; the missing directory names `ENOENT` and a file given as the directory `ENOTDIR`.
- L5 is a rename with no behaviour change; the same 19 tests pass after `14c45a97`. L1 to L3 change records only.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4e0e59442e00d679b7d1e8c46070007e0596d98c`; tests 4166, pass 4157, fail 0, skipped 9; all files 99.39% lines, 92.61% branches, 98.88% functions.
- `npm run openspec -- validate serve-web-spa-from-control-plane --strict`: passed, `Change 'serve-web-spa-from-control-plane' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 101 file(s); every pass summary file is valid: 81 file(s); every route file is valid: 34 file(s).`.
- Spec diff against the merge base `3341f8a82c2d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a19f28-b5fd-7971-85cd-78597aad9656` | 0 | 0 | 5 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `45a4e8b6-e060-4098-b203-24bbf77b8c8b` | 0 | 0 | 0 | 5 |
<!-- make record: end -->

## Independent review

Review plan of the brief (governance v11, effort medium, `env -u JEV_MAF_LAB` before each invocation): pass 1 reviewer A `codex gpt-6-astra#medium`; pass 2 reviewer B `claude claude-fable-5-1#medium`; pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; stop at a pass with only Low findings or none. `route.json` recommends effort high for passes 1 and 2; the authorized effort medium applies.

### Pass 1

- Failed attempt: `codex gpt-6-astra#medium`, started 2026-11-03T02:04:48.572Z, answered "Selected model is at capacity"; `make review` exited 2 with no report, and the snapshot stayed unchanged (logs `review-28c-p1-astra-failed.log` and `.out` in the session scratchpad). No pass ran, so it has no line in `passes.jsonl` or `findings.jsonl`. The coordinator Niki assigned `codex gpt-6.1-sol#medium` as its replacement under governance "Unavailable reviewer".
- Reviewer: Codex CLI `gpt-6.1-sol`, role A, as that replacement, through `env -u JEV_MAF_LAB make review CHANGE=serve-web-spa-from-control-plane PASS=1 REVIEWER='codex gpt-6.1-sol#medium' PROMPT=<scratchpad>/review-28c-p1.md LOG=<scratchpad>/review-28c-p1.log`, started 2026-11-03T02:06:47.597Z, at head `8f8367f1` against `12dee8c7`; session `01a19f28-b5fd-7971-85cd-78597aad9656`; model `gpt-6.1-sol`, effort `medium`, and sandbox `read-only`, each reported in the header. Snapshot `09f617014e4f73474ce4b0e46b139bcdf3ab0676226ff33a121b17aec50658cd` before and after, unchanged.
- Result: Critical 0, High 0, Medium 5, Low 3, recorded in `passes.jsonl` and `findings.jsonl`.
- Finding 1 (Medium, `contract-drift`): `new URL()` removed dot segments before the SPA's check, so `/app/%2e/sessions` and `/app/assets/../assets/real.js` were answered. Fixed: the listener gives the SPA the path as sent (`request.url` before `?`), and the check refuses those segments before any lookup; test with a spying `WebAppFiles`.
- Finding 2 (Medium, `concurrency-race`): an entry swapped for a link after the listing was read through it, and the build root was followed. Fixed: `O_NOFOLLOW` opens with a descriptor type check, a refused root link, and a directory identity check after the read (design decision 6); four barrier tests through `WebAppEntryProbe`. The residue of a swap and swap back between two checks is stated in the design's risks and in the requirement's wording.
- Finding 3 (Medium, `contract-drift`): `/app/outside` and other extensionless paths at or below a link got the page. Fixed: the adapter remembers left-out entries and `isLeftOut` refuses a path at or below one before the fallback; test with a file link, a directory link, and descendants.
- Finding 4 (Medium, `contract-drift`): SPA failures lacked the policy and related headers. Fixed: every SPA failure carries them and keeps JSON and `no-store`; test of GET and HEAD for a missing asset, a refused path, a link, and malformed encoding.
- Finding 5 (Medium, `missing-fail-before-test`): no test exercised the composition's listener split. Fixed: the integration test starts the composition with `webAppDirectory` and checks both HTTPS endpoints; fail-before mutations above.
- Finding 6 (Low, `docs`): the worker image decision left by 28a was unrecorded. Fixed: design decision 11 keeps the build in the worker image, with the reason.
- Finding 7 (Low, `docs`): the design said a `no-cache` page is never stored. Fixed: the risk now states storage with revalidation before reuse.
- Finding 8 (Low, `process`): the remaining gates made pass 2 unconditional. Fixed: pass 2 follows a pass 1 with a Medium or worse finding, pass 3 a pass 2 with one.
- Coordinator conditions: the wire contracts' section 1 reserves `/app/` for the SPA, and the OpenAPI test checks that sentence (fail-before above); the image build and smoke below.

### Pass 2

- Reviewer: Claude Code `claude-fable-5-1`, role B, variant `medium`, through `env -u JEV_MAF_LAB make review CHANGE=serve-web-spa-from-control-plane PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=<scratchpad>/review-28c-p2.md LOG=<scratchpad>/review-28c-p2.log`, started 2026-11-03T02:30:04.990Z, at head `b8a15dc6` against `3341f8a8`; session `45a4e8b6-e060-4098-b203-24bbf77b8c8b`; model `claude-fable-5-1` (reported). `make review` printed that the route recommends effort high and the authorized medium applies. Snapshot `5b26501337517ec4f4c08addff940d28cf01197797b8464609c3d27e8a9f680b` before and after, unchanged; the reviewer changed no file.
- Result: Critical 0, High 0, Medium 0, Low 5, recorded in `passes.jsonl` and `findings.jsonl`. It confirmed that the five Medium and three Low fixes of pass 1 are correct and complete. Under governance "Low findings are fixed" the five are fixed without another pass.

| Finding | Fix | Commit |
| --- | --- | --- |
| L1 (Low, `evidence-mismatch`) | The proposal's impact and the self-check say no change under `packages/contracts`, and name the wire contracts' `/app` reservation and the installation contract's `TASKELITH_WEB_APP_DIR` | `355854b5` |
| L2 (Low, `stale-citation`) | `12dee8c7` is the checklist base; the merge base is `3341f8a8` since `6b390339`; the pass 3 condition is governance's, not `route.json`'s | `355854b5` |
| L3 (Low, `spec-wording`) | "Web SPA served under /app/" specifies GET and HEAD of `/app` and of every path under `/app/` (452 characters) | `355854b5` |
| L4 (Low, `error-handling`) | Every start failure of the build names `directory` in its details, and an unreadable directory also the system error's `code`; the design, the "Web SPA build at start" requirement (436 characters), and the installation contract name the directory | `8daccf93`, `e650fdd5`, `355854b5` |
| L5 (Low, `naming`) | `WebAppFile` with `content`, `fileAnswer`, `writeWebAppFile`, and `'content' in answer`; the listener's shared state is `ListenerContext` | `14c45a97` |

### Pass 3

Not run: pass 2 reported only Low findings, so the review stops (governance "Low findings are fixed").

### Architect check of unreviewed fixes

The pass 2 fixes are unreviewed fixes; no later pass reviews them. Each awaits the coordinator's check as solution architect (governance "Architect check of unreviewed fixes"):

- L4, `8daccf93` and `e650fdd5` (`apps/control-plane/src/composition/web-app-directory.ts`, `apps/control-plane/test/web-app.test.ts`): architect check pending.
- L5, `14c45a97` (`apps/control-plane/src/api/web-app.ts`, `apps/control-plane/src/api/api-server.ts`): architect check pending.
- L1 to L3 and the records of L4, `355854b5` (`proposal.md`, `design.md`, `specs/control-plane-api/spec.md`, `verification.md`, `docs/contracts/installation-and-enrollment.md`): architect check pending.

## Limitations

- The image smoke (above) started the image's own modules over plain HTTP, not the composed control plane on the installation's HTTPS endpoint; the composed endpoints are covered by the integration test "the browser endpoint serves the configured web build, and the worker endpoint never does".
- The build is held in memory without a size bound, and a directory swapped for a link and back again between its open and the identity check after the read would pass the start's checks (design, "Risks and trade-offs").
- No `Strict-Transport-Security` header (design, decision 7).

## Remaining gates

- Architect check of the unreviewed pass 2 fixes by the coordinator.
- Integration into dev by the coordinator (single pull request)
