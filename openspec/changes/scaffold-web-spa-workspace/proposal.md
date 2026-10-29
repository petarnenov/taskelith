## Why

G3 item 28 (`scaffold-web-spa`, `docs/g3-plan.md`, row 28) starts the product SPA with the stack of D1 and Mantine (D17). The coordinator Niki split it on 2026-10-29 into 28a `scaffold-web-spa-workspace`, 28b `build-web-spa-shell`, and 28c `serve-web-spa-from-control-plane` ([design](design.md), "Coordinator decisions"). This change is 28a: the workspace, its build and tests inside `make verify`, the generated control-plane client, the bundle boundary, and the make targets, so that 28b can port the shell onto a verified base. Nothing in 28a is a screen.

## What Changes

- `apps/web` (`@taskelith/web`, private): React 19.3.1, Vite 8.3.5 with `@vitejs/plugin-react` 6.1.2, Vitest 5.0.5 with jsdom 30.1.3 and `@vitest/coverage-v8` 5.0.5, Testing Library, Mantine 9.7.4, React Router 8.5.1, TanStack Query 5.104.5, and the React 19.3.0 types, all exact-pinned development dependencies added in one commit; its own TypeScript configurations (root TypeScript stays 5.9.3); a Vite build under `/app/` with `.env` files off and no source maps; one Mantine page that names the scaffold; Vitest tests with 75% thresholds.
- Control-plane client: `scripts/generate-web-api-types.ts` generates `apps/web/src/generated/control-plane.ts` from `control-plane.openapi.json` alone with `openapi-typescript` 7.13.0, without description comments, as a committed file; `npm run verify:web-api-types` in `make verify` fails on drift. `apps/web/src/api/client.ts` is a small typed fetch over those types that sends `X-CSRF-Token` on every request other than GET. `openapi-fetch` and the shared `HttpPaths` are not used.
- Browser application kind (`scripts/workspace-packages.ts`): `apps/web` is checked against its own contract instead of the package contract, left out of `tsc --build`, and built through its `build` script by `npm run build`; `scripts/check-coverage-scope.ts` checks its `src/` modules, `.tsx` included, against its Vitest report; the Node test patterns of `npm test` and `tsconfig.check.json` leave it out; `npm test` runs its Vitest tests.
- Bundle boundary: `scripts/check-boundaries.ts` limits web rules to `apps/web/src/`, forbids any `@taskelith/` import there, and allows only `import.meta.env.MODE`; `scripts/check-web-bundle.ts` checks the built `dist/` for secret shapes, environment values, and external origins, through a test that `npm test` runs after the build.
- `make web-build`, `make web-test`, and `make web-dev`, a Vite HTTPS development server on `localhost` that proxies every path outside `/app/` to the control plane on port 8443, trusting only the installation CA, with a per-start TLS certificate in a temporary directory (`scripts/web-dev.sh`).
- Records: the dependency register rows (candidate, with license, advisories, maintenance, and the 2026-10-29 recheck), the license reviews of 29 new coverage gaps and the regenerated inventory, `docs/g3-plan.md` row 28 with the 28a, 28b, and 28c split, and the README's development section.

## Capabilities

### New Capabilities

### Modified Capabilities

- `workspace-packages`: modifies "Workspace package layout" (the browser application follows its own requirements; a new scenario) and adds "Browser application contract" and "Browser application build and test".
- `engineering-principles`: modifies "Code coverage threshold" (the browser application's `src/` measured by Vitest; a new scenario).
- `product-ui`: adds "Web SPA control-plane client", "Web SPA development server", and "Web SPA bundle boundary".

No requirement is removed.

## Impact

Private workspace and tooling only; the published `taskelith` package is unchanged. 128 packages enter the lockfile, all as development dependencies; `npm audit` reports only the two findings it reported before. No contract document changes. The installation images build the SPA during `npm run build` and keep `apps/web/dist`; the control plane does not serve it until 28c. Out of scope: the shell, routing, login and sessions, themes, the D10 navigation, the contrast and badge tests (28b), static serving, the SPA fallback, and the CSP (28c), and items 29 to 34 and 40.

## Follow-ups

- 28b `build-web-spa-shell` ports the shell, theme, and D10 navigation, with an empty Mantine page per route that names its item, and the contrast and badge tests of the coordinator's decisions D4 and D5.
- 28c `serve-web-spa-from-control-plane` serves `apps/web/dist` under `/app/` on the browser endpoint with the SPA fallback and the CSP; until then the SPA runs only through `make web-dev`.
