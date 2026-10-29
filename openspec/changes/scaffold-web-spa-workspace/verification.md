# Verification: scaffold-web-spa-workspace

## Scope and source

G3 item 28 (`docs/g3-plan.md`, row 28), sub-change 28a, developed by a briefed subagent of the worker session Pepi for the coordinator Niki (architect), from `dev` `115c16c4`: the `apps/web` workspace with the D1 and D17 libraries, its build and Vitest tests in `make verify`, the browser application's exemptions from the package contract and the Node coverage, the generated control-plane types with a drift check, a typed fetch with the CSRF header, the bundle boundary, and `make web-build`, `make web-test`, and `make web-dev` ([design](design.md), decisions 1 to 9). The coordinator approved the split into 28a, 28b, and 28c and decided D1 to D5 on 2026-10-29; the design records them verbatim.

## Revision

- Base: `dev` `115c16c4` (#414), the brief's checklist base; `git fetch origin` before the worktree was created showed `origin/dev` at `115c16c4`.
- `b17c1fc8` `chore: start the scaffold-web-spa-workspace change` (the brief's `checklist.json`, saved `--at 115c16c41016ae5f45dee6609558a9299ef8b165 --size M-L`, unedited; empty `findings.jsonl` and `passes.jsonl`).
- `ff6a7795` `chore: add the exact-pinned dependencies of the web SPA workspace`: `apps/web/package.json`, `package-lock.json`, `docs/dependencies/license-reviews.json` (29 new reviews), and the regenerated `licenses.json` and `sbom.cdx.json`, every dependency addition in this one commit.
- `3e221892` `chore: scaffold the web SPA workspace with generated control-plane types and a CSRF-aware fetch`.
- `b4460b36` `chore: build, test, and measure the browser application in make verify`.
- `e73ff2e3` `chore: keep server modules, environment values, secrets, and external origins out of the web bundle`.
- `397ffd3e` `docs: record the scaffold-web-spa-workspace design, spec deltas, and plan split`: the proposal, the design, the spec deltas, the task list, this record, the dependency register, `docs/g3-plan.md` row 28, and the README.
- `ac04ad01` `docs: route the scaffold-web-spa-workspace change` (`route.json`, unedited). The first `make verify` on that tree (log `verify-28a-1.log` in the session scratchpad) passed every test, tests 3927, pass 3918, fail 0, skipped 9, and the web tests, then failed `npm run verify:dependencies`: the inventory records the hash of the root `package.json`, whose `test` script `b4460b36` changed after the inventory of `ff6a7795`.
- `68de6c09` `chore: regenerate the dependency inventory for the web test scripts`: `make dependency-inventory` changed only that hash in `docs/dependencies/licenses.json`; no dependency changed, so the additions stay in `ff6a7795`.
- `7a436fbc` `docs: route the scaffold-web-spa-workspace change again after the inventory regeneration` (`route.json`, unedited, at head `68de6c09`): the regeneration changed the diff outside the change directory, so under worker step 4 the first route was deleted and the change routed again. "route: elevated (lines, files, capabilities, size), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high`; shadow `jev-1.14.0` elevated (P(third) 0.81) and agrees; recommendation only. The route's pass 2 reviewer differs from the brief's `claude claude-fable-5-1#medium`, and its efforts are above the brief's; the brief's reviewers stand unless the coordinator decides otherwise. `git fetch origin` before routing showed `origin/dev` at `2250f3f7` (#415, `assign-fable-to-review-pass-2`), which this branch has not merged.
- `docs: record the make verify of scaffold-web-spa-workspace`, the `make record` of the passing second `make verify` on the tree of `7a436fbc` (log `verify-28a-2.log` in the session scratchpad). The web workspace's own Vitest coverage in that run: tests 17, pass 17; statements 100% (30/30), branches 100% (24/24), functions 100% (9/9), lines 100% (24/24); `Every product module is in the coverage report.`

## Environment

macOS 26.6.2 on x86_64; Node.js 24.22.1 (`.nvmrc`) and npm 12.2.1 (the `Makefile` pin); OpenSSL 4.0.3 for the development certificate; Docker for the services of `make test` and the installation images.

## Author self-check

- Scope: 28a only, as the coordinator's approved scope lists it. The shell, routing, login and sessions, themes, D10 navigation, the contrast test, and the badge test (28b), static serving, the SPA fallback, and the CSP (28c), and items 29 to 34 and 40 are untouched. The only page names the scaffold and promises nothing that exists; the README states that the SPA runs only through `make web-dev` until 28c.
- Dependencies: only the approved list. D1 additions `@vitest/coverage-v8@5.0.5`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.8` (no `jest-dom`), `@types/react@19.3.0`, and `@types/react-dom@19.3.0`; the item 1 versions `react@19.3.1`, `react-dom@19.3.1`, `vite@8.3.5`, `@vitejs/plugin-react@6.1.2`, `vitest@5.0.5`, `jsdom@30.1.3`, and `@tanstack/react-query@5.104.5`; the same-minor patches `@mantine/core@9.7.4`, `@mantine/hooks@9.7.4`, and `react-router@8.5.1` (design, decision 8). `openapi-fetch` is not used; `openapi-typescript@7.13.0` was already a root development dependency. All are exact-pinned development dependencies of the private `@taskelith/web`; root TypeScript stays 5.9.3. A semantic comparison of the lockfiles shows 153 added entries, none changed or removed. `npm audit` reports the same two findings as at the base (`ip-address`, `undici` inside the release plugin's npm). osv.dev returned no record for any pinned version on 2026-10-29; the register rows record the recheck date, the advisory checks, licenses, and maintenance evidence.
- Inventory: `npm run inventory:dependencies` first failed on 29 unreviewed license coverage gaps, the 15 `@rolldown/binding-*` and 11 `lightningcss-*` platform packages, `fsevents`, `react-remove-scroll-bar@2.3.8`, and `saxes@6.0.0`. Each published tarball was listed on 2026-10-29 and reviewed as `text-located`; then generation passed with 918 package paths and 70 reviewed gaps.
- Wire: no change; `git diff 115c16c4 HEAD -- packages/contracts` is empty. The generated types cover the 39 paths of `control-plane.openapi.json` only.
- Secrecy: no CA, key, certificate, secret, or token is in the repository, the bundle, the tests, or a log. `scripts/web-dev.sh` writes the CA copy and the development key to a temporary directory and deletes it on exit; the bundle check refuses PEM blocks; the secret fixtures of `test/check-web-bundle.test.ts` are assembled at run time from fragments, so no secret shape is tracked; the fetch tests use the fixture strings `csrf-fixture` and `fixture-password`.
- Hexagonal and boundaries: SPA source imports no workspace package, Node built-in, or server SDK, and reads only `import.meta.env.MODE`; `npm run check:boundaries` passed.
- Spec deltas: `workspace-packages` modifies "Workspace package layout" (435 characters), keeping its four scenarios unchanged and adding "Browser application", and adds "Browser application contract" (369) and "Browser application build and test" (351); `engineering-principles` modifies "Code coverage threshold" (433), keeping its three scenarios and adding "Untested browser application module"; `product-ui` adds "Web SPA control-plane client" (372), "Web SPA development server" (425), and "Web SPA bundle boundary" (381). None is removed. "Workspace package contract" (478 characters) is not modified: the layout requirement routes the browser application to its own requirements.
- Comments: `npm run verify:comments` passes. It does not check `.tsx` files; the two `.tsx` source files hold one one-line comment.

## Fail-before

Each behavior was broken in place on `e73ff2e3`, its tests run, and the file restored with `git checkout`; the logs, each with its diff and command, are in the session scratchpad.

- Browser application contract and build (`fb-28a-build-contract.log`): `scripts/build-workspaces.ts` checks every workspace against the package contract, as at the base. `test/browser-application.test.ts`: tests 7, pass 4, fail 3; the fixture builds fail on the package contract (`exports must be only the root entry ...`, `tsconfig.json is missing`) instead of running the build script or naming the dependency problems.
- Coverage scope (`fb-28a-coverage-scope.log`): no browser application report read. `test/check-coverage-scope.test.ts`: tests 9, pass 7, fail 2; the untested `.tsx` module and the missing report are not reported.
- Node test pattern (`fb-28a-node-test-glob.log`): the base pattern `'apps/*/test/*.test.ts'` restored in `package.json`; the pattern test fails, matching `apps/web/test/client.test.ts` and `apps/web/test/dev-server.test.ts`.
- Root typecheck (`fb-28a-root-typecheck.log`): the `exclude` removed from `tsconfig.check.json`; the typecheck test fails, and `tsc -p tsconfig.check.json` reports `TS2835` and `TS2345` in `apps/web/src/api/client.ts` and the web tests.
- Environment reads (`fb-28a-web-environment.log`) and workspace imports (`fb-28a-web-workspace-import.log`): each web rule disabled in `scripts/check-boundaries.ts`; the web boundary test fails each time, missing the three `import.meta.env` violations and the two `@taskelith/` imports.
- CSRF header (`fb-28a-csrf-header.log`): the header never set; the Vitest run: tests 17, pass 15, fail 2 (POST and DELETE). Header also on GET (`fb-28a-csrf-get.log`): tests 17, pass 16, fail 1.
- Development server bind (`fb-28a-dev-server-host.log`): `host` `0.0.0.0`; `test/dev-server.test.ts`: tests 5, pass 4, fail 1.
- Generated types with comments (`fb-28a-types-comments.log`): the generator returns `openapi-typescript`'s output unprinted; `test/generate-web-api-types.test.ts`: tests 4, pass 2, fail 2 (the committed file no longer matches, and the description comments are back).
- Type drift (`fb-28a-types-drift.log`): one operation changed in the committed `apps/web/src/generated/control-plane.ts`; `npm run verify:web-api-types` exits 1 naming the stale file, and the drift test fails.
- External font (`fb-28a-bundle-font.log`): a Google Fonts stylesheet link added to `apps/web/index.html` and the SPA rebuilt; the real-dist bundle test fails with `index.html: references the external origin of https://fonts.googleapis.com/css2?family=IBM+Plex+Sans`. The other secret, environment, and origin shapes are unit-tested on fixtures.

## Image size

`make installation-build` at the base (`115c16c4`, in a temporary detached worktree) and at this branch (`e73ff2e3` with the records' working tree; the images are built from tracked files), on the same host, log `image-size-28a.log` in the session scratchpad:

| Image | Base bytes | Branch bytes | Change |
| --- | --- | --- | --- |
| `taskelith-control-plane` | 331,863,706 | 332,947,507 | +1,083,801 (+0.33%) |
| `taskelith-worker` | 404,305,373 | 405,389,174 | +1,083,801 (+0.27%) |

`npm prune --omit=dev` removes every web library from the runtime stage; the growth is mainly `apps/web` (764 KiB, of which `dist/` is 516 KiB); the pruned `node_modules` grew by 64 KiB (34,648 to 34,712 KiB by `du -sk`), with the `@taskelith/web` link, 15 scope directories that the prune leaves, and an empty `.vite-temp`. The images were removed after the measurement.

## Development server

`make web-dev` needs a running installation for `make installation-ca`, which this host did not run. The server itself was started once by hand with a throwaway self-signed certificate as both CA and server certificate: it listened on `[::1]:5173` only, served `/app/` over HTTPS, and answered `/session` with `502` because nothing listened on `127.0.0.1:8443` (proxy error `ECONNREFUSED 127.0.0.1:8443`), so the proxy target is right and no request reached anything else.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `node --experimental-strip-types --test` of the new and changed root tests after `npm run build` | `e73ff2e3` | tests 76, pass 76, fail 0: workspace packages, coverage scope, boundaries, browser application, bundle, web API types, contract generation, comment length |
| `npm run test --workspace=@taskelith/web` | `e73ff2e3` | tests 17, pass 17, fail 0; statements 100% (30/30), branches 100% (24/24), functions 100% (9/9), lines 100% (24/24) |
| `make web-build` | `e73ff2e3` | built `dist/index.html`, one script of 264.24 kB and one stylesheet of 248.44 kB; `The web bundle holds no secret shape, environment value, or external origin.` |
| `npm run verify:comments` | records working tree | `Every comment is within the comment length rule.` |
| `npm run check:boundaries` | `e73ff2e3` | `Workspace and hexagonal boundary checks passed.` |
| `npm run verify:dependencies` | `ff6a7795` | `Verified 918 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)` |
| `npm run openspec -- validate scaffold-web-spa-workspace --strict` | records working tree | `Change 'scaffold-web-spa-workspace' is valid` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4d683c9de87763a0af8a4f5b0e3390fca145b2fe`; tests 3927, pass 3918, fail 0, skipped 9; all files 99.38% lines, 92.54% branches, 98.84% functions.
- `npm run openspec -- validate scaffold-web-spa-workspace --strict`: passed, `Change 'scaffold-web-spa-workspace' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 91 file(s); every pass summary file is valid: 71 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `115c16c41016` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

The brief assigns pass 1 to reviewer A `codex gpt-6-astra#medium`, pass 2 to reviewer B `claude claude-fable-5-1#medium`, and pass 3, only after a pass 2 with a Medium or worse finding, to reviewer A `codex gpt-6.1-sol#medium`, at most three passes and stopping at a Low-only pass (governance v9). No pass has run yet.

## Limitations

- The SPA is not served by the control plane until 28c; `make web-dev` is its only way to run, and it was not run against an installation (see "Development server").
- `dev-server.ts` and `scripts/web-dev.sh` have no automated test against a running control plane; the unit tests cover the bind address, the strict port, the proxy pattern, and the CA-only agent.
- The fetch does not validate answer bodies against the document, and it covers JSON operations only; the SSE stream and the terminal WebSocket belong to later items.
- React Router, TanStack Query, and most of Mantine are installed but unused until 28b (design, decision 8).
- `npm run verify:comments` does not check `.tsx` files; the comment rule's file list in `AGENTS.md` does not name them.
- The bundle URL allowlist is exact, so an upgrade that changes a React or Mantine error link needs a reviewed list change.

## Remaining gates

- Independent review passes 1 to 3 as governance requires, and the architect check of any unreviewed fixes by the coordinator.
- Archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
