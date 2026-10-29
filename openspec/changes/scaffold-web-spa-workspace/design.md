# Design: scaffold-web-spa-workspace

## Context

G3 item 28 (`docs/g3-plan.md`, row 28) builds the SPA on the stack of D1 (React, Vite, Vitest, React Router, TanStack Query) and Mantine (D17), from the proof of concept in `docs/ui-poc/` (ADR 0011). Before this change no browser code existed in a workspace: every workspace package was a Node package compiled by `tsc --build` from `tsconfig.package.json`, tested by Node's test runner over `dist/`, and measured by `scripts/check-coverage-scope.ts` against Node's report. The worker Pepi proposed a split and the coordinator Niki approved it with decisions D1 to D5 on 2026-10-29. They are recorded verbatim below; this change implements the 28a scope they approve.

## Coordinator decisions (verbatim)

> Coordinator decisions (Niki, architect, 2026-10-29), verbatim:
>
> Item 28 split approved (architect, 2026-10-29): 28a `scaffold-web-spa-workspace` (M-L), then 28b `build-web-spa-shell` (M-L), both chore. Save 28a's checklist as scaffold-web-spa-workspace at 115c16c41016ae5f45dee6609558a9299ef8b165 --size M-L; 28b saves at the dev commit of its own brief. Record the split in g3-plan row 28 in 28a. Keep root TS at 5.9.3. Do not reuse HttpPaths; generate types for the control plane only.
>
> Versions: pin the recorded item 1 versions. Exception: take a patch of the same minor where it exists, Mantine 9.7.4 being the one case. Stay on TanStack 5.104.5; a minor bump needs an advisory to justify it. Record the recheck date and each advisory check in the dependency register.
>
> Decisions:
> - D1. Approved as devDependencies, each registered as `candidate` in the register with license, advisories and maintenance evidence:
>   - @vitest/coverage-v8 5.0.5;
>   - @testing-library/react, dom and user-event (no jest-dom);
>   - @types/react and @types/react-dom 19.3.0.
>   openapi-fetch is rejected (pre-1.0, never qualified). Write a small typed fetch wrapper over the generated openapi-typescript types, with the CSRF header on non-GET and a test for it. Fonts: system fonts only, with no external font request; a test asserts that the built dist references no external origin.
> - D2. Agreed on (b): the SPA under /app/, with no contract change. The dev proxy goes to 8443 over Vite https with the installation CA, dev only, and no CA key or cert in the repo or the bundle. Static serving, the SPA fallback and the CSP become a new sub-change, 28c `serve-web-spa-from-control-plane`, after 28b. Add the row to g3-plan in 28a. Until then the SPA runs only through the dev server, and the docs say so honestly.
> - D3. Agreed. 28b ports the shell, theme and D10 navigation. Each route shows an empty Mantine page that names the item that builds it, with no mock or fabricated data. The POC screens stay in docs/ui-poc for items 29–34.
> - D4. Keep the 7 inline SVG icons as the POC has them (accepted by ADR 0011). Style props set as theme defaults are allowed. A hover-only badge never counts as a target: anything interactive is a focusable control with an accessible name, so a badge stays informational or becomes a button. Test this with Testing Library.
> - D5. Theme-level settings in createTheme (color tuples, primaryShade, autoContrast) count as D17 "theme settings", not overrides; overrides are CSS or per-component style overrides. This is my decision, not an owner question. Add a test computing WCAG contrast ≥4.5:1 for text and primary-on-background in both schemes.
>
> Risks accepted with your mitigations:
> - a fail-before test for each workspace and coverage exemption;
> - the dev server bound to localhost;
> - jsdom stubs, with UI tests that use no timing bounds;
> - report the image size before and after.
> On lockfile conflicts: keep 28a's dependency additions in one commit so a re-merge is cheap.
>
> Pepi's 28a scope (approved proposal):
> - apps/web workspace (all libraries devDependencies; root TS 5.9.3; Vite/Vitest config; base /app/).
> - Exemptions for a "browser application" kind, each with a spec delta and a fail-before test: scripts/workspace-packages.ts:53-83 (spec workspace-packages:27-28) requires dist/index.js and tsconfig.package.json; scripts/check-coverage-scope.ts expects Node lcov src->dist (engineering-principles spec:56), must also read Vitest lcov; npm test glob and tsconfig.check.json (NodeNext) must not pick up apps/web.
> - Control-plane-only types from openapi-typescript (7.13.0, already present) into apps/web/src/generated/ with a drift check in make verify; small typed fetch wrapper with X-CSRF-Token on non-GET, tested.
> - Bundle boundary: extend scripts/check-boundaries.ts web rules (:250-265, scans .tsx :330) + a test over built dist for secret shapes, import.meta.env keys other than MODE, and no external origin.
> - make web-build, web-dev (Vite https dev server on localhost, proxy to 8443 with the installation CA, dev only), web-test; Vitest coverage >=75/75/75 inside make verify; vite build in the root build.
> - Dependency register rows (candidate for the D1 additions; recheck date and advisories for all) + inventory:dependencies; all dependency additions in ONE commit.
> - g3-plan: record split row 28 (28a, 28b, 28c serve-web-spa-from-control-plane).
> - Report the Docker image size before and after.
> - 28b content (shell, router, session, themes, navigation, contrast test, badge test) is NOT in 28a.

## Decisions

1. **A browser application kind, not a package.** `BROWSER_APPLICATIONS` in `scripts/workspace-packages.ts` names `apps/web`. It is an npm workspace under `apps/*`, but Vite bundles it and Vitest tests it, so it neither exports `dist/index.js` nor extends `tsconfig.package.json`. `browserApplicationProblems` checks what matters for it instead: private, `@taskelith/web`, `type: module`, no entry points, every library an exact-pinned development dependency (the coordinator's "all libraries devDependencies"), and no workspace dependency. `scripts/build-workspaces.ts` dispatches each workspace to its contract, runs `tsc --build` for the Node packages only, then runs each browser application's `build` script and requires `dist/index.html`. A list rather than a manifest field keeps the kind visible in one reviewed place.
2. **Its own TypeScript configurations.** `apps/web/tsconfig.json` type-checks `src/` with `Bundler` resolution, `react-jsx`, the DOM library, and only the `vite/client` types, so no Node global type-checks in SPA code; `tsconfig.tooling.json` adds the Node types for the tests and the Vite and Vitest configurations. Both run with the root TypeScript 5.9.3 in the workspace's `build` script. `tsconfig.check.json`, which runs under `NodeNext`, excludes `apps/web/**`, and the Node test pattern of `npm test` is `apps/!(web)/test/*.test.ts`; a test checks both against every browser application and every other workspace package.
3. **Coverage from Vitest.** `vitest.config.ts` measures `src/**/*.{ts,tsx}` with V8 at 75% lines, branches, and functions, excluding `src/generated/`, and writes `apps/web/coverage/lcov.info`. `scripts/check-coverage-scope.ts` checks each browser application's modules, `.tsx` included, against that report, resolving its paths against the application directory, and skips a module that transpiles to nothing, such as the generated types. `npm test` runs the Vitest tests after Node's and before the scope check, so the docs-only profile of `make verify` skips them with the rest of `make test`.
4. **Committed generated types with a drift check.** The coordinator asks for types of the control plane only, not the shared `HttpPaths`. `scripts/generate-web-api-types.ts` runs `openapi-typescript` 7.13.0 on `control-plane.openapi.json` and prints the result through TypeScript's printer without comments: the descriptions stay in the document, and the committed file holds no comment beyond its one-line banner, so the comment rule needs no new exemption. `npm run verify:web-api-types` runs in every `make verify` profile and fails on a stale or missing file.
5. **A typed fetch instead of `openapi-fetch`.** `createApiClient` takes a CSRF token provider and returns `request(method, path, options)`, whose path, method, path and query parameters, JSON body, and per-status answers come from the generated `paths`. Every request other than GET carries `X-CSRF-Token` when a token is known; GET never asks for it. The session's anonymous token for `logIn` and its refresh belong to 28b. The answer body is the document's type for the status and is not validated; the SSE and WebSocket operations are outside the fetch.
6. **Bundle boundary in two places.** In source, `scripts/check-boundaries.ts` applies the web rules to `apps/web/src/` only, so tests and the Vite configuration may use Node, forbids every `@taskelith/` import there (other packages' modules and `HttpPaths` stay out), and allows only `import.meta.env.MODE`. In the build, Vite reads no `.env` file (`envDir: false`) and writes no source map, and `scripts/check-web-bundle.ts` fails on a PEM block, an issued Taskelith secret (prefixes kept equal to `SECRET_PREFIXES` by a test), an NKey seed, a JSON Web Token, a bearer credential, a GitHub token, an `sk-` key, an AWS access key, `import.meta.env`, a `VITE_` name, the `BASE_URL` of a whole environment object, an unexpected file type, and any URL with a host. Only six URLs pass, and only in scripts: four XML namespace names of React DOM and the error documentation links of React and Mantine, all text that is never requested. The check runs as a test over the real `apps/web/dist` that `npm run build` has just written. The theme uses Mantine's system font stack, so no font is requested (D1).
7. **Development server.** `make web-dev` runs `scripts/web-dev.sh`: it copies the installation CA from `make installation-ca` and generates a P-256 certificate for `localhost`, valid for one day, into a temporary directory that the script deletes on exit, and passes the three paths in `TASKELITH_WEB_DEV_*` variables to Vite. `apps/web/dev-server.ts` binds `localhost` with a strict port, serves HTTPS with that certificate, and proxies every path that does not start with `/app` to `https://127.0.0.1:8443` through an HTTPS agent whose only CA is the installation CA. Vite's own client paths live under the `/app/` base and stay local. Tests run with `vitest.config.ts`, which has no dev server, so they need none of the files. Nothing of the CA or the key reaches the repository or the bundle (`*.pem` and `*.key` stay ignored, and the bundle check refuses PEM blocks).
8. **Dependencies in one commit.** All 16 direct libraries, the lockfile, and the regenerated inventory with 29 new license reviews are one commit, so a lockfile conflict on a later merge is re-resolved once. Router, Query, and most of Mantine are unused until 28b; installing them now keeps 28b free of lockfile changes. React Router is 8.5.1, the patch of the recorded 8.5.0 minor that appeared on 2026-10-27, under the coordinator's rule to take a patch of the same minor where it exists; the coordinator named Mantine 9.7.4 as the one case, because 8.5.1 was not yet recorded.
9. **Honest bootstrap status.** The only page says it is the scaffold and that sign-in, navigation, and screens come later; it renders with Mantine's dark color scheme, the specification's default, and no theme settings, which 28b ports. The README says that until 28c the SPA runs only through `make web-dev`.

## Risks and trade-offs

- A browser application list in a script is one more place to keep in step with `package.json`'s test pattern; the test over both names any drift.
- The bundle URL allowlist is exact, so a React or Mantine upgrade that changes an error link fails the check until the list is reviewed.
- `dev-server.ts` and `scripts/web-dev.sh` have no test against a running installation; the unit tests cover the bind address, the proxy pattern, and the CA agent, and the server was started once by hand with a throwaway certificate (verification).
- jsdom lacks `matchMedia`, which `test/setup.ts` stubs; no UI test uses a timing bound.
