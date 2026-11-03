## ADDED Requirements

### Requirement: Web SPA served under /app/
The browser endpoint SHALL answer GET and HEAD under `/app/` that no operation matches with the built SPA: the file at the path with its content type, or `index.html` for a path without a file extension. A missing file with an extension SHALL be a 404 `not-found`, never the page. Every operation SHALL be matched first; the worker endpoint SHALL serve no SPA. The request log SHALL name the operation `web-app` and no path.

#### Scenario: Screen address
- **WHEN** a browser opens `/app/sessions` or another path under `/app/` without a file extension
- **THEN** the answer is 200 with the build's `index.html` as `text/html; charset=utf-8`

#### Scenario: Missing asset
- **WHEN** a browser requests `/app/assets/index-missing.js`, a file with an extension that the build does not hold
- **THEN** the answer is 404 `not-found` as JSON, not the page

#### Scenario: Operation path
- **WHEN** a request matches an operation, or a path outside `/app/` matches none
- **THEN** the operation answers it, or the answer is the API's 404 `not-found`, and never the SPA

### Requirement: Web SPA cache headers
A file of the build under `assets/`, whose name Vite gives a content hash, SHALL be answered with `Cache-Control: public, max-age=31536000, immutable`; `index.html` and every other file SHALL be answered with `Cache-Control: no-cache`.

#### Scenario: Hashed asset
- **WHEN** a browser requests `/app/assets/index-AbC123.js`
- **THEN** the answer is `text/javascript; charset=utf-8` with `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Page
- **WHEN** a browser requests any address that answers `index.html`
- **THEN** the answer carries `Cache-Control: no-cache`

### Requirement: Web SPA content security policy
Every SPA answer SHALL carry a `Content-Security-Policy` with `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, and `frame-ancestors 'none'`, without `unsafe-inline` or `unsafe-eval`; the page's `style-src` SHALL add a nonce of 128 random bits, fresh per answer, in place of the build's placeholder. Each SHALL also carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and same-origin opener and resource policies.

#### Scenario: Page nonce
- **WHEN** a browser requests the page twice
- **THEN** each answer's `style-src` names a different nonce, which the page's `csp-nonce` meta tag carries in place of the placeholder

#### Scenario: Inline script
- **WHEN** the control plane answers the page
- **THEN** its `script-src` is `'self'` alone, without a nonce or `unsafe-inline`, so a browser runs no inline script

### Requirement: Web SPA path confinement
The control plane SHALL answer only regular files that it read at start from the build directory, never following a symbolic link. A path whose decoded segments hold `.`, `..`, an empty segment before the last, a slash, a backslash, or NUL SHALL be refused with 404 `not-found` without a lookup, and a path that is not valid percent-encoding SHALL be a 400 `invalid`.

#### Scenario: Traversal
- **WHEN** a request names `/app/..%2Fsecret.txt`, `/app/assets/..%2F..%2Fsecret`, or a symbolic link of the build that points outside it
- **THEN** the answer is 404 and holds neither the file outside the build nor the page

### Requirement: Web SPA build at start
The control plane SHALL read the build from the directory that `TASKELITH_WEB_APP_DIR` names once at start; a directory that cannot be read or has no `index.html` SHALL fail the start with `precondition-failed` and name the variable. Without the variable the browser endpoint SHALL serve no SPA, so `/app/` answers 404 `not-found`. The control-plane image SHALL set the variable to the SPA that its build stage builds.

#### Scenario: Build missing
- **WHEN** `TASKELITH_WEB_APP_DIR` names a directory without `index.html`
- **THEN** the start fails with `precondition-failed` and names `TASKELITH_WEB_APP_DIR`

#### Scenario: No build configured
- **WHEN** the control plane starts without `TASKELITH_WEB_APP_DIR`
- **THEN** `/app/` answers 404 `not-found`, and every operation answers as before
