## Why

G3 item 28 (`scaffold-web-spa`, `docs/g3-plan.md`, row 28) is split into 28a `scaffold-web-spa-workspace` (#417), 28b `build-web-spa-shell` (#423), and 28c `serve-web-spa-from-control-plane`. This change is 28c: until now the SPA ran only through `make web-dev`, because the control plane did not serve it. The browser endpoint now serves the built SPA under `/app/`, same-origin with the API (architecture section 11), with the SPA fallback, cache headers, and a strict content security policy.

## What Changes

- Control plane (`apps/control-plane`): the browser endpoint answers GET and HEAD under `/app/` that no operation matches with the built SPA (`src/api/web-app.ts`): a file of the build with its content type, `index.html` for a path without a file extension, and a JSON 404 for a missing file with an extension. Operations are matched first, the worker endpoint serves no SPA, and the request log names the operation `web-app` without the path.
- Cache headers: files under `assets/`, whose names Vite hashes, are immutable for a year; `index.html` and every other file are `no-cache`.
- Security headers on every SPA answer: a `Content-Security-Policy` with `default-src 'none'`, `script-src 'self'`, and `style-src 'self'` plus, on the page, a nonce of 128 random bits fresh per answer for Mantine's style elements; `nosniff`, `no-referrer`, `DENY` framing, and same-origin opener and resource policies.
- Path confinement: the build is read once at start as an in-memory map of its regular files, never following a symbolic link (`src/composition/web-app-directory.ts`, the file-system adapter behind the `WebAppFiles` port); dot segments, encoded separators, backslashes, and NUL are refused without a lookup.
- Settings: `TASKELITH_WEB_APP_DIR` names the build; a directory that cannot be read or lacks `index.html` fails the start with `precondition-failed` and names the variable; without it `/app/` answers 404.
- SPA (`apps/web`): Vite's `html.cspNonce` writes the placeholder `TASKELITH_CSP_NONCE` into the built `index.html`; `pageStyleNonce` reads the page's `csp-nonce` meta tag, and `App` passes it to Mantine's `getStyleNonce`.
- Image: the control-plane stage of `infra/installation/Dockerfile` sets `TASKELITH_WEB_APP_DIR=/opt/taskelith/apps/web/dist`, the SPA that its build stage's `npm run build` builds, so `make installation-build` and `make installation-start` stay the entry points.
- Records: the README's SPA status, the `web-dev` comment of the `Makefile`, and the listeners of the installation contract.

## Capabilities

### New Capabilities

### Modified Capabilities

- `control-plane-api`: adds "Web SPA served under /app/", "Web SPA cache headers", "Web SPA content security policy", "Web SPA path confinement", and "Web SPA build at start".
- `product-ui`: modifies "Web SPA development server" (the docs now state that the control plane serves the built SPA) and adds "Web SPA style nonce".

No requirement is removed.

## Impact

Private workspaces, the installation image, tests, and docs only; the published `taskelith` package, which ships only `dist/cli.js`, is unchanged. No dependency, OpenAPI operation, or change under `packages/contracts`: the SPA is served outside the API's paths, and no operation of `control-plane.openapi.json` lies under `/app`, which a test checks. The wire contracts gain the `/app` reservation, and the installation contract's listeners name `TASKELITH_WEB_APP_DIR`. Out of scope: every screen's content (items 29 to 34 and 40) and the regex-literal decoder of the bundle check.
