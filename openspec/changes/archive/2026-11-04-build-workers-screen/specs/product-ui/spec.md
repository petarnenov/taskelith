## ADDED Requirements

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
- **THEN** the screen says that no worker is enrolled, names the enrollment token, and links nowhere

### Requirement: Web SPA workers screen access
The navigation SHALL list the workers screen for every operator; without `installation-owner` among the session's installation roles the page SHALL show its heading and a notice naming that role, and call no `listWorkers`; with it, a failed read SHALL show why, the role a 403 names, and a retry, with a 503, a 404, a 5xx, an undocumented status, a body without the view, or no answer read as unavailable, and a 401 `unauthenticated` SHALL show the sign-in page.

#### Scenario: Operator without the role
- **WHEN** an operator whose session names no `installation-owner` role opens the workers screen
- **THEN** the page shows the heading and "Needs installation-owner", sends no `listWorkers` request, and the navigation still lists the screen

#### Scenario: Role refused by the control plane
- **WHEN** `listWorkers` answers 403 with the reason `role-required` and a role
- **THEN** the screen says that it cannot read the workers, names the role, and offers a retry

#### Scenario: View unavailable
- **WHEN** `listWorkers` answers 503, a 5xx, a 404, an undocumented status, a body without the view, or nothing
- **THEN** the screen says that the workers cannot be loaded, shows no worker, and offers a retry

#### Scenario: Read after the session ended
- **WHEN** `listWorkers` answers 401 `unauthenticated`
- **THEN** the SPA shows the sign-in page saying that the session expired, and reads the session again

### Requirement: Web SPA workers screen redaction
The workers screen SHALL show hostnames and self-check problems as text, never parsed or linked, keep only the documented fields of the view and only in component state, write nothing to `localStorage` or `sessionStorage`, and log nothing, so no secret shape that the control plane did not already send as text can reach the page, a storage, or the console.

#### Scenario: Redacted texts shown as received
- **WHEN** the view carries a hostname and a problem the control plane redacted
- **THEN** the screen shows those texts as received

#### Scenario: Secret shape outside the contract
- **WHEN** an answer carries a field outside the contract holding an enrollment-token shape
- **THEN** the field never reaches the view, the page's HTML, a storage, or the console, and both storages stay empty

#### Scenario: Loading under reduced motion
- **WHEN** the system asks for reduced motion while the workers load or refresh
- **THEN** the status line names what loads, and no loader spins
