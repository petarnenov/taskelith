## Why

G3 item 28 (`scaffold-web-spa`, `docs/g3-plan.md`, row 28) is split into 28a `scaffold-web-spa-workspace` (landed, #417), 28b `build-web-spa-shell`, and 28c `serve-web-spa-from-control-plane`. This change is 28b: the session shell, routing, login and sessions, the dark and light themes, and the navigation of G3 decision D10, with an empty Mantine page per route that names the G3 item that builds it, from the layout of the proof of concept in `docs/ui-poc/` (ADR 0011). It also carries the follow-up of #417: the web build must ignore `NODE_ENV`, because `test/check-web-bundle.test.ts` failed when the shell exported `NODE_ENV=development`.

## What Changes

- Session shell (`apps/web/src/session/`, `apps/web/src/shell/`): a session gateway over the control plane's existing `readSession`, `logIn`, and `logOut` operations through the 28a typed fetch, which keeps the CSRF token of the latest session answer; a session provider that reads the session before any page shows, logs in and out, and reads the session again when its `expiresAt` has passed; a sign-in page, the Mantine `AppShell` layout of the proof of concept with its header navigation, burger navbar, "New task" and "Needs you" links, color scheme toggle, and account menu.
- Routing (`apps/web/src/routes.tsx`, `apps/web/src/screens.ts`, `apps/web/src/pages.tsx`): React Router under the `/app` base for the board, agent sessions, reviews, workers and account pools, SCM integrations, plugins, the "Needs you" inbox, and new task, each an empty Mantine page that names its G3 item, and a not-found page.
- Theme (`apps/web/src/theme.ts`): Mantine `createTheme` with the proof of concept's settings, the system font stacks, `primaryShade` 7 and 8, and two color tuple shades, so that every text and primary color pair of the shell is at least 4.5:1 in both schemes; the color scheme choice is kept in `localStorage`. A Vitest test computes the WCAG contrast of each pair from Mantine's own resolvers.
- The seven inline SVG icons of the proof of concept (`apps/web/src/icons.tsx`).
- Build: `apps/web/vite.config.ts` builds in production mode whatever `NODE_ENV` says, with a fail-before test in `test/check-web-bundle.test.ts`; `scripts/check-web-bundle.ts` allows four more exact library texts of React Router that are never requested, each with its reason.
- Records: the README's SPA status.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: adds "Web SPA session shell", "Web SPA session expiry", "Web SPA screen routes", and "Web SPA color schemes", and modifies "Web SPA bundle boundary" (the production bundle whatever `NODE_ENV` says, the allowed texts named as library texts, and a new scenario).

No requirement is removed.

## Impact

Private workspace and tooling only; the published `taskelith` package is unchanged. No dependency changes: React Router and Mantine were installed by 28a. No contract document or control-plane code changes; the shell uses only operations the OpenAPI document already has. Out of scope: static serving, the SPA fallback, and the CSP (28c), and every screen's content (items 29 to 34 and 40).
