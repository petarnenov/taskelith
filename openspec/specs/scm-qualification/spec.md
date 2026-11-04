# scm-qualification Specification

## Purpose
Qualify each SCM plugin with reproducible evidence that its per-run credentials, merge blocking, and webhooks meet the trust model, and that the qualification cleans up after itself, before admission.

## Requirements

### Requirement: SCM credential scoping
An SCM qualification SHALL show that the plugin's per-run credential can mutate, and read non-public data of, only the project's repositories and only with the requested permissions, by recording a refused write to another repository and an operation that a narrowed credential is refused while the broad credential succeeds; reads of public repositories are expected to succeed.

#### Scenario: Write to another repository
- **WHEN** the qualification attempts a write to a repository outside the project with a per-run credential
- **THEN** the service refuses it, and the record shows the refusal status

### Requirement: Merge blocking with the plugin's own identity
An SCM qualification SHALL show that a required verification status blocks merging even for the plugin's own credential, and SHALL record any protection setting needed to prevent a bypass.

#### Scenario: Pending required status
- **WHEN** a pull request's required status is pending and the plugin attempts the merge
- **THEN** the merge is refused, and after the status succeeds the merge is allowed

### Requirement: Verified webhook deliveries and cleanup
An SCM qualification SHALL verify, with the shared secret, the signature of every webhook delivery it attributes to its run within a recorded inspection window, state which later deliveries fall outside that window, record redelivery behaviour, delete every branch and protection rule it created, close every pull request it opened, and disclose the records that remain, such as closed pull requests, reviews, and statuses.

#### Scenario: Qualification ends
- **WHEN** the qualification run finishes, with or without an error
- **THEN** its temporary branches and protection rules no longer exist, its pull requests are closed or merged, and the record lists each cleanup step's status

### Requirement: SCM terms review
Before an SCM plugin is admitted, its qualification record SHALL review the service's current terms that govern how Taskelith uses it, including automated agents acting through the plugin's application identity and a separate reviewer identity, quoting each relevant clause briefly with its URL, effective date, and access date, stating where the text is ambiguous for Taskelith's use, and leaving the acceptance of any remaining risk to the owner.

#### Scenario: Terms reviewed
- **WHEN** an SCM qualification records its service's terms
- **THEN** each finding quotes the clause, names its source and access date, and separates what the text says from where it is ambiguous

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
