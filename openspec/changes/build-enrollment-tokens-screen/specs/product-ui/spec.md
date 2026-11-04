## ADDED Requirements

### Requirement: Web SPA enrollment tokens
The workers screen SHALL show the pending enrollment tokens of every page `listEnrollmentTokens` answers, each with its identifier, issue and expiry times, and constraints, with a Refresh that keeps the shown list until the answer, say when none is pending or the page limit cut the list short, and read the list again after every command whose answer changed it; it SHALL issue a token with the three optional host constraints, and revoke or rotate a listed one after a confirmation.

#### Scenario: Tokens listed
- **WHEN** `listEnrollmentTokens` answers two tokens over two pages
- **THEN** the section shows both in the wire's order, each with its identifier, times, constraints or that any host is accepted, and a Rotate and a Revoke button

#### Scenario: List cut short
- **WHEN** the control plane names a new cursor on every page up to the SPA's page limit
- **THEN** the section shows the tokens read and says that the list is cut short

#### Scenario: Token issued
- **WHEN** the operator issues a token from the form, with or without constraints
- **THEN** the SPA posts `issueEnrollmentToken` with only the chosen constraints and the session's CSRF token, shows the token once with its secret, and reads the list again

#### Scenario: Revoke confirmed
- **WHEN** the operator confirms a revoke
- **THEN** the SPA sends `revokeEnrollmentToken`, says that the token was revoked, and reads the list again; Cancel sends nothing and returns the focus to the row's button

#### Scenario: One command at a time
- **WHEN** a command is in flight
- **THEN** every issue, revoke, rotate, and retry button says so and ignores a click, and a status line names the command

### Requirement: Web SPA enrollment token secret
The SPA SHALL hold the secret of a 201 of issuing or rotating in the tokens section's component state alone, show it once in a dialog with a copy to the clipboard, text naming `TASKELITH_ENROLLMENT_TOKEN`, and no command line, ask before a close without a copy, and drop it on every close, on a rotation, on leaving the screen, and on a sign-out, so that it never reaches a context, a store, a storage, a URL, a log, or a later request.

#### Scenario: Copied
- **WHEN** the operator copies the shown secret
- **THEN** the clipboard receives the secret and nothing else, and "Copied" is announced

#### Scenario: Clipboard refused
- **WHEN** the clipboard write fails or the browser has none
- **THEN** the dialog says to select the text, which stays selectable

#### Scenario: Closed without a copy
- **WHEN** the operator closes the dialog before a copy succeeded
- **THEN** the dialog asks once, Keep open keeps the secret, and Close anyway drops it; Escape does not close it

#### Scenario: Secret gone after the close
- **WHEN** the dialog closed, a rotation replaced the secret, the operator left the screen, the session ended, or the operator signed out
- **THEN** the page's HTML holds no secret shape, both storages are empty, no console output holds one, and no later request carries it

### Requirement: Web SPA enrollment token answers
The tokens section SHALL show each command's answer honestly in one status region: the token redeemed, replaced with its replacement named and linked when listed, or not pending, not found, refused as invalid, the role a 403 names, and after no usable answer that an issue or rotation may have taken effect without its secret, with a Refresh, while only a revoke offers a Retry; after a 403 for the CSRF token it SHALL read the session once and resend only under the same sign-in.

#### Scenario: Token redeemed or replaced
- **WHEN** `revokeEnrollmentToken` answers 422 `token-used` or `token-rotated`
- **THEN** the status says so, names the replacement and links to its row when the refreshed list holds it, and names no CLI command

#### Scenario: No answer
- **WHEN** an issue or a rotation gets no usable answer
- **THEN** the status says that it may have taken effect without its secret being shown, offers a Refresh and no Retry, and a revoke without an answer offers a Retry that sends it again

#### Scenario: Stale CSRF token
- **WHEN** a command answers 403 with the reason `csrf-token-invalid`
- **THEN** the SPA reads the session again and sends the command once more only when the same operator is still signed in, and shows a second refusal, a session read without an answer, or a changed sign-in as final with nothing sent again

## MODIFIED Requirements

### Requirement: Web SPA workers screen
The workers screen SHALL show the workers as `listWorkers` answers them, in the wire's order, each with its hostname, identifier, host, enrolment, admission state in words, last report or that none came, and every self-check in words, the failed ones first with their problems as text and a skipped one with its reason; it SHALL show the view's `asOf` with a Refresh that reads again and keeps the shown list until the answer, say when no worker is enrolled, and show no data it did not read.

#### Scenario: Workers listed
- **WHEN** `listWorkers` answers two workers in identifier order
- **THEN** the screen shows them in that order, each as a card with its hostname heading, host, enrolment, admission state, and last report, and the view's `asOf`

#### Scenario: Self-check failed
- **WHEN** a worker's admission is `self-check-failed` with a failed check among passed and not-applicable ones
- **THEN** the card says that it is not admitted, lists the failed check first with each of its problems as text, then the others with "passed" or "not applicable" and its reason, and draws no badge

#### Scenario: No report yet
- **WHEN** a worker awaits its self-check without `reportedAt`
- **THEN** the card says that no report came yet and lists no check

#### Scenario: Refresh
- **WHEN** the operator refreshes while a list is shown
- **THEN** the shown list stays until the new view replaces it, a failed refresh replaces it with the failure and a retry, and no stale list is shown as current

#### Scenario: No worker
- **WHEN** `listWorkers` answers no worker
- **THEN** the screen says that no worker is enrolled and links the enrollment token to the enrollment tokens section of the same page
