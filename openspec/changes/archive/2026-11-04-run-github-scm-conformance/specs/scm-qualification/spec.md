## ADDED Requirements

### Requirement: Live GitHub conformance run
A manual `make conformance-github` target, outside `make verify`, SHALL run the SCM conformance suite against GitHub.com with the plugin's own App, reading only file paths and IDs from the environment, failing with the name of each missing or invalid variable, and never printing a value.

#### Scenario: Missing variable
- **WHEN** the target runs without `TASKELITH_GITHUB_APP_ID`
- **THEN** it fails naming that variable and makes no request

### Requirement: Conformance repository allowlist
Every request of the live conformance run, the plugin's included, SHALL pass a guard that refuses, before the call, any repository other than the three disposable conformance repositories, and any installation token request that does not name only them, and SHALL follow no redirect.

#### Scenario: Request for another repository
- **WHEN** a request names `petarnenov/taskelith`
- **THEN** the guard refuses it without calling GitHub, and the run fails

#### Scenario: Redirect to another repository or host
- **WHEN** GitHub answers an allowed request with a redirect
- **THEN** the guard refuses the answer without following it, and the run fails

### Requirement: Conformance cleanup
After every live conformance run, also when it fails, the run SHALL remove the base branch's protection, close its open pull requests, and delete its branches in the repositories the App can see, then revoke every token the run minted, record each step's status, and fail when a step fails; the cleanup SHALL also run alone.

#### Scenario: Run stops early
- **WHEN** the suite stops with an error
- **THEN** the cleanup still runs and its steps are in the evidence

#### Scenario: Branch deletion refused
- **WHEN** GitHub answers a branch deletion with 422 and the branch still exists
- **THEN** the step is not done and the run fails

### Requirement: Long-run refresh case
An opt-in case of the live conformance run SHALL refresh and adopt a run credential until the run has outlived the original version's expiry, checking that each previous secret works until the adoption and is refused with `forbidden` within the propagation window after it, and that the latest version works past the original expiry.

#### Scenario: Run outlives the original expiry
- **WHEN** the long-run case passes the original version's expiry
- **THEN** the latest refreshed version still reads the project repository

### Requirement: Redacted conformance evidence
The live conformance run SHALL redact its evidence with the shared `SECRET_SHAPE_RULES`, then scan it for token shapes and the run's known secret values, and SHALL fail without saving when the scan finds any.

#### Scenario: Secret trace left after redaction
- **WHEN** the redacted evidence still holds the webhook secret
- **THEN** the run fails and saves no evidence
