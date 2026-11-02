## ADDED Requirements

### Requirement: Web SPA session shell
The SPA SHALL read the caller's session through `readSession` before it shows any page, show only a sign-in page while the session is anonymous, log in through `logIn` with the anonymous session's CSRF token, and log out through `logOut`; the navigation, the account menu, and the pages SHALL show only in an authenticated session. A session read without a valid answer SHALL show no page but a retry; a login or logout without one SHALL keep the current page and say so.

#### Scenario: Anonymous visit
- **WHEN** a browser without a logged-in session opens any address under `/app/`
- **THEN** the SPA shows the sign-in page and no navigation, and after a login it shows the page of that address

#### Scenario: Login refused
- **WHEN** `logIn` answers that the login name and password do not match, that the request is invalid, or that the anonymous session or its CSRF token is gone
- **THEN** the sign-in page says why, clears the password, and stays; for a gone session or token it reads a fresh anonymous session first

#### Scenario: Logout
- **WHEN** the operator signs out and `logOut` ends the session or answers that it had already ended
- **THEN** the SPA shows the sign-in page as soon as `logOut` answers, which says that only this browser session ended; when `logOut` fails, the SPA stays signed in and says so

#### Scenario: Control plane without a valid answer
- **WHEN** `readSession`, `logIn`, or `logOut` gets no answer, an undocumented status, or a body without the fields the SPA uses
- **THEN** a session read shows only a retry, a login keeps the sign-in page saying that the control plane cannot be reached, and a logout keeps the operator signed in saying that the session did not end

#### Scenario: Late answer
- **WHEN** the answer to a session request arrives after a login or logout that was sent later has ended
- **THEN** the late answer changes neither the page nor the CSRF token that the next request carries

### Requirement: Web SPA session expiry
When the time that the session's `expiresAt` names has passed, the SPA SHALL read the session again; an authenticated answer SHALL keep the operator signed in until its new `expiresAt`, and an anonymous one SHALL show the sign-in page with a notice that the session expired.

#### Scenario: Session ended
- **WHEN** the session's `expiresAt` has passed and the control plane answers with an anonymous session
- **THEN** the SPA shows the sign-in page and says that the session expired

#### Scenario: Session renewed elsewhere
- **WHEN** the session's `expiresAt` has passed and the control plane answers with the authenticated session and a later `expiresAt`
- **THEN** the page stays, and the SPA waits for the new `expiresAt`

### Requirement: Web SPA screen routes
Under `/app/` the SPA SHALL route the board, agent sessions, reviews, workers and account pools, SCM integrations, plugins, the "Needs you" inbox, and new task, and SHALL list the first six in its navigation; until its G3 item builds a screen, the screen's page SHALL be empty, name that item, and show no data. No navigation entry SHALL name a screen of a later gate.

#### Scenario: Screen not built yet
- **WHEN** an operator opens a routed screen that its G3 item has not built
- **THEN** the page names the screen and the item that builds it, and shows no data

#### Scenario: Unknown address
- **WHEN** an operator opens an address under `/app/` that no route matches
- **THEN** the SPA shows a page saying that no screen lives there, with a link to the board

#### Scenario: Interactive control
- **WHEN** the shell shows a button, link, or menu item
- **THEN** it is focusable and has an accessible name, and no badge is interactive

### Requirement: Web SPA color schemes
The SPA SHALL start in the dark color scheme, switch between dark and light, and keep the choice in the browser for the next visit. Its colors SHALL come from Mantine theme settings, with the system font stacks and no style override, and a test SHALL compute the WCAG contrast of every text and primary color pair the shell draws, at least 4.5:1 in both schemes.

#### Scenario: Chosen scheme kept
- **WHEN** an operator switches to the light scheme and opens the SPA again in the same browser
- **THEN** it shows the light scheme

#### Scenario: Contrast below the minimum
- **WHEN** a theme change brings a text or primary color pair of the shell below 4.5:1 in either scheme
- **THEN** the web tests in `make verify` fail and name the pair

## MODIFIED Requirements

### Requirement: Web SPA bundle boundary
`make verify` SHALL fail when SPA source under `apps/web/src/` imports a Node built-in, a server SDK, any `@taskelith/` workspace package, or a file outside `apps/web/src/`, or reads `import.meta.env` other than `MODE`, and when the production bundle, which the build makes whatever `NODE_ENV` says, holds a secret shape, an environment value, or a URL of an external origin other than a fixed list of library texts that are never requested in its scripts.

#### Scenario: External font
- **WHEN** the built bundle references a font or stylesheet on an external origin
- **THEN** `make verify` fails and names the file and the URL

#### Scenario: Escaped external URL
- **WHEN** the built bundle references an external origin through a percent-encoded or Unicode host, or through an HTML, script, or style sheet escape
- **THEN** `make verify` fails and names the file and the URL as the browser decodes it

#### Scenario: Secret in the bundle
- **WHEN** the built bundle holds a PEM block, an issued Taskelith secret, an NKey seed, a JSON Web Token, or another listed secret shape
- **THEN** `make verify` fails and names the file and the shape

#### Scenario: Environment read
- **WHEN** SPA source reads `import.meta.env` other than `import.meta.env.MODE`
- **THEN** the boundary check fails and names the file and the read

#### Scenario: Development NODE_ENV in the shell
- **WHEN** the SPA is built in a shell that exports `NODE_ENV=development`
- **THEN** the build makes the production bundle, which passes the bundle check
