# product-ui Specification

## Purpose
Define the web product's information architecture and interaction rules decided by the owner on 2026-10-24 (ADR 0008), and later owner decisions recorded in their changes, such as the harness activity indicator of 2026-10-25, for implementation from G3 onwards.

## Requirements

### Requirement: Project board as landing page
The SPA's landing page SHALL be a per-project board whose columns are governance's lifecycle stages under short labels, Propose (Propose and inspect), Specify (Specify and design), Implement, Verify, Review, and Archived (Close), with Accept and integrate shown as the merge gate between Review and Archived.

#### Scenario: Native and platform-managed steps
- **WHEN** a card is shown in a column
- **THEN** it names its framework's native step for that stage, or "platform-managed" where the framework mapping records a gap

#### Scenario: Merge
- **WHEN** a change merges
- **THEN** its card moves to Archived, the change is closed, and its agent session is stopped

### Requirement: Task detail
The task detail SHALL show each lifecycle stage with its gate state (pending, passed, failed, stale, or blocked), the reason a blocked or waiting task does not move, requirement traceability with evidence freshness, the run binding, and the admission.

#### Scenario: Stale evidence
- **WHEN** a new head or artifact revision invalidates earlier evidence
- **THEN** the affected gates are shown as stale until they pass again

### Requirement: Board states
The board SHALL define first run, empty, loading, load error, live updates lost, no workers online, and read-only states.

#### Scenario: Load error
- **WHEN** the control plane cannot be reached
- **THEN** the board shows no task data rather than data that may be wrong, and offers a retry

#### Scenario: Live updates lost
- **WHEN** the event stream is interrupted
- **THEN** the board shows the time of its last known state, and the server rechecks every action before applying it

#### Scenario: First run
- **WHEN** no project exists yet
- **THEN** the board guides the user through setup instead of showing an empty board

### Requirement: Needs you inbox
Every item that waits on a person SHALL appear in one "Needs you" inbox, and resolving it SHALL update every screen.

#### Scenario: Native approval resolved
- **WHEN** a maintainer answers a native approval request in the inbox
- **THEN** the request disappears from the inbox and from the board's counts on every screen

### Requirement: Task intake with defaults and write-back
A task SHALL be creatable from a description or imported from a Jira issue, a GitHub issue, a Confluence page, a text file, or another link, with its type, framework, implementer, reviewer, and spec approver prefilled with changeable defaults; progress and the pull request link SHALL be written back to the source, the source SHALL be resolved on merge, and feedback at the source SHALL become lesson feedback.

#### Scenario: Import with defaults
- **WHEN** a user imports a task without changing the defaults
- **THEN** the task is created with the project's default framework (OpenSpec unless another is selected) and the default implementer and reviewer

### Requirement: Product screens
Besides the board, the SPA SHALL provide an agent session screen whose composer stays visible, and screens for reviews, workers and account pools, new tasks, knowledge, the "Needs you" inbox, SCM integrations, and plugins.

#### Scenario: Long session output
- **WHEN** an agent session's output is longer than the screen
- **THEN** the composer and its send action stay visible

### Requirement: Delegated spec approval
Spec approval SHALL be delegable to an independent reviewer by maintainer policy, and a task SHALL be able to require a maintainer's approval instead.

#### Scenario: Task requires a maintainer
- **WHEN** a task is created with spec approval set to a maintainer
- **THEN** its spec gate waits for a project-maintainer even though the project delegates spec approval to reviewers

### Requirement: Design rules
The SPA SHALL use the dark theme by default and support a light theme, be responsive down to phone width, give interactive targets at least 44 px, and keep text contrast at least 4.5:1 in both themes.

#### Scenario: Phone width
- **WHEN** the SPA is shown at phone width
- **THEN** no page scrolls horizontally except deliberate board columns, and navigation stays reachable

### Requirement: New capabilities as plugins
Intake sources and write-back, notifications, the inbox's sources, and worker admission checks SHALL be delivered behind microkernel ports as plugins or adapters, with their port contracts defined in the gate that first implements them.

#### Scenario: New intake source
- **WHEN** a new intake source is added
- **THEN** it is a plugin implementing the intake port, without kernel changes

### Requirement: Automatic worker admission
A worker enrolled with a one-time token SHALL be admitted automatically once its self-check passes.

#### Scenario: Self-check fails
- **WHEN** a newly enrolled worker's self-check fails
- **THEN** it is not admitted and the failed checks are shown on the workers screen

### Requirement: Reference proof of concept
The SPA SHALL start from the Mantine proof of concept in `docs/ui-poc/` (ADR 0011) and follow its matching screen for each screen it builds. The proof of concept is reference material: where it differs from this specification or an ADR, they win, and the change that builds the screen SHALL record the difference.

#### Scenario: Screen built from the proof of concept
- **WHEN** a UI item builds a screen that the proof of concept shows
- **THEN** the item's change names the proof of concept source file it follows

#### Scenario: Screen differs from the proof of concept
- **WHEN** a UI item builds a screen that departs from the proof of concept's matching screen
- **THEN** the item's change records the departure and the requirement or decision that requires it

### Requirement: Session activity indicator
Every card or row that shows a harness session, on the board, in the task detail, on the agent session screen, in the "Needs you" inbox, and in the review queue, SHALL show a small round indicator beside the session's label that spins while the harness works and stays still while it waits or has stopped, and the label SHALL name the state.

#### Scenario: Harness works
- **WHEN** the agent session is live, or is stopping and the worker has not yet confirmed that it ended
- **THEN** its indicator spins on every screen that shows the session

#### Scenario: Harness waits
- **WHEN** the agent session waits for a person or for its next stage admission
- **THEN** the indicator is still, and the label or the card says what it waits for

#### Scenario: Harness stopped or absent
- **WHEN** the agent session has stopped, or the card has no session
- **THEN** the indicator is still and muted, and the label says that the session stopped or that there is none

#### Scenario: Reduced motion
- **WHEN** the user's system asks for reduced motion
- **THEN** no indicator spins, and the labels still name each state

#### Scenario: Worker unreachable
- **WHEN** Taskelith has lost contact with the session's worker and the worker has reported no uncertainty about the process
- **THEN** the indicator is still, and the label says that the worker is unreachable and when it was last in contact, while the attempt keeps its owner and its ownership generation

#### Scenario: Process state uncertain
- **WHEN** the worker reports that it can prove neither that the session's process runs nor that it ended
- **THEN** the indicator is still and drawn in the danger color, the label says that the process state is uncertain, and the card offers an audited reconciliation to a role allowed to make it

### Requirement: Web SPA control-plane client
The SPA SHALL call the control plane through a typed fetch over the types that `openapi-typescript` generates from `control-plane.openapi.json` alone into a committed file, and the fetch SHALL send the session's CSRF token in `X-CSRF-Token` on every request other than GET while it knows the token, and never on GET; `make verify` SHALL fail when the committed types differ from a fresh generation.

#### Scenario: Request other than GET
- **WHEN** the SPA sends a POST, PUT, PATCH, or DELETE request while it knows the session's CSRF token
- **THEN** the request carries the token in `X-CSRF-Token`

#### Scenario: Request other than GET without a known token
- **WHEN** the SPA sends a POST, PUT, PATCH, or DELETE request before it knows the session's CSRF token
- **THEN** the request carries no `X-CSRF-Token`, and the control plane decides on it

#### Scenario: Stale generated types
- **WHEN** `control-plane.openapi.json` changes and the committed types are not generated again
- **THEN** `make verify` fails and names the stale file

### Requirement: Web SPA development server
The SPA SHALL be built under the base path `/app/`. `make web-dev` SHALL serve it over HTTPS on `localhost` only and proxy every path outside `/app/` to the browser endpoint of the local composition, which serves a certificate of the installation CA, trusting only that CA; the CA copy and the server's TLS key SHALL live outside the repository and the bundle. The docs SHALL state that the control plane serves the built SPA and that the development server is for development.

#### Scenario: Development server reach
- **WHEN** `make web-dev` starts
- **THEN** the server listens on `localhost` only, and a request outside `/app/` reaches the local composition's control plane over TLS verified against the installation CA

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

### Requirement: Web SPA style nonce
The built `index.html` SHALL carry the control plane's nonce placeholder in a `csp-nonce` meta tag and hold no inline script, inline style, or event handler attribute, and every script and style sheet it loads SHALL be a file of the build under `/app/assets/`. The SPA SHALL give Mantine the nonce of that tag, so that every style element Mantine adds carries it.

#### Scenario: Mantine style elements
- **WHEN** the SPA starts on a page whose `csp-nonce` meta tag carries a nonce
- **THEN** every style element that Mantine adds carries that nonce

#### Scenario: Built page
- **WHEN** `npm run build` builds the SPA
- **THEN** its `index.html` names the placeholder in the `csp-nonce` meta tag and loads only hashed files of the build, without inline script or style
