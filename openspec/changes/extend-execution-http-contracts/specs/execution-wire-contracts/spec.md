## MODIFIED Requirements

### Requirement: Execution HTTP operations
The OpenAPI document SHALL define `enrollWorker`, `authorizeLaunch`, `requestDelegation`, `readTaskResult`, `publishEvidence`, `readEvidence`, `downloadEvidence`, `readInstallationCa`, and the operations of "G3 execution operations", each with its credential: an enrollment token, the worker credential, the operator credential, or the browser session; only `readInstallationCa`, which answers the public installation CA certificate, SHALL declare none. Errors SHALL use the kernel failure shape.

#### Scenario: Parent in a delegation request
- **WHEN** a delegation request names `parentTaskId`
- **THEN** the request body is invalid

#### Scenario: Worker in a launch request
- **WHEN** a launch authorization request names `workerId`
- **THEN** the request body is invalid

#### Scenario: Key material in the installation CA answer
- **WHEN** an `InstallationCa` answer holds a PEM private-key block
- **THEN** the answer is invalid

## ADDED Requirements

### Requirement: G3 execution operations
The OpenAPI document, at version 0.6.0, SHALL define `retireEvidence`, `readDelegationResult`, `listUnknownExecutions`, `listUnrecordedProcesses`, `readmitTask`, `fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential`. It SHALL reuse the `browserSession` and `csrfToken` schemes and the access failure schemas of the control-plane document unchanged, and every operation with a path parameter SHALL answer 400 to an invalid one.

#### Scenario: Session scheme redefined
- **WHEN** the execution document defines `browserSession` differently from the control-plane document
- **THEN** contract generation fails and names the scheme

#### Scenario: Retirement with a session and no CSRF token
- **WHEN** a principal calls `retireEvidence` with the session cookie and without the `X-CSRF-Token` header
- **THEN** the answer is 403 with reason `csrf-token-invalid` and the record is unchanged

### Requirement: Per-project evidence reads
`readEvidence` and `downloadEvidence` SHALL accept the browser session or the operator bearer and SHALL serve a record only to a `project-viewer` or above on its project or to an `installation-owner`. Any other principal SHALL get the 404 of an unknown record. The document SHALL declare this narrowing with a new minor version.

#### Scenario: Viewer of another project
- **WHEN** a `project-viewer` of one project reads an evidence record of another project
- **THEN** the answer is 404, as for an unknown record

#### Scenario: Viewer of the record's project
- **WHEN** a `project-viewer` of the record's project downloads its content
- **THEN** the content whose digest is the record's `contentDigest` is served

#### Scenario: Reader without a role
- **WHEN** a principal with no role on any project and no installation role reads an evidence record
- **THEN** the answer is 404, as for an unknown record, and nothing of the record is disclosed

### Requirement: Evidence retirement
`retireEvidence` SHALL let a `project-maintainer` of the record's project remove a record once 365 days have passed since its publication (`publishedAt`), and its content once no record refers to the digest. Before then it SHALL answer 422 with reason `retention-not-elapsed` and the end of the retention as the `Instant` `details.retainedUntil`, and change nothing; a retired or unknown record SHALL answer 404.

#### Scenario: Retirement within the retention
- **WHEN** a maintainer retires a record published 30 days ago
- **THEN** the answer is 422 with reason `retention-not-elapsed` and `details.retainedUntil`, and the record stays

#### Scenario: Old capture published recently
- **WHEN** a maintainer retires a record captured 400 days ago and published 30 days ago
- **THEN** the answer is 422 with reason `retention-not-elapsed` and `details.retainedUntil` 365 days after its publication, and the record stays

#### Scenario: Refusal without a retention end
- **WHEN** a retention refusal lacks `details.retainedUntil` or holds one that is not an instant
- **THEN** validation fails

#### Scenario: Second retirement
- **WHEN** two retirements of the same record run after its retention
- **THEN** one answers 204 and the other 404

### Requirement: Delegation result read
`readDelegationResult` SHALL answer `pending` until the delegation ends, then `ended` with its outcome, `completed`, `rejected`, `failed`, or `cancelled`, its summary of at most 65,536 characters, and its end time. Only the worker that holds the active attempt of the parent task at the task's current ownership generation SHALL read it; any other worker SHALL get 404.

#### Scenario: Pending result with an outcome
- **WHEN** a pending delegation result carries an outcome
- **THEN** validation fails

#### Scenario: Another worker reads the result
- **WHEN** a worker that holds no attempt of the parent task reads the delegation result
- **THEN** the answer is 404, as for an unknown delegation

### Requirement: Reconciliation queue reads
`listUnknownExecutions` SHALL list a project's unknown executions, each with all its evidence, to a `project-viewer` or above on it or an `installation-owner`, and `listUnrecordedProcesses` the unrecorded processes to an `installation-owner` only. Each SHALL return at most 100 items with a `next` position while more remain, by task then execution identifier, or by worker then observation identifier.

#### Scenario: Page over the bound
- **WHEN** a page holds 101 unknown executions
- **THEN** validation fails

#### Scenario: Page boundary between equal execution identifiers
- **WHEN** a page ends with execution `e1` of task `t1` and task `t2` also has an unknown execution `e1`
- **THEN** `next` names task `t1` and execution `e1`, and the next page starts with execution `e1` of task `t2`

#### Scenario: Only a cancellation that was not applied
- **WHEN** an unknown execution's evidence holds only `cancellation-not-applied` entries
- **THEN** validation fails

#### Scenario: Long evidence history
- **WHEN** an unknown execution holds 65 evidence entries
- **THEN** the answer lists all 65

#### Scenario: Maintainer reads unrecorded processes
- **WHEN** a `project-maintainer` without an installation role lists the unrecorded processes
- **THEN** the answer is 403 with reason `role-required`

### Requirement: Task re-admission
`readmitTask` SHALL let a `project-operator` or above re-admit a task at its next ownership generation by compare-and-set on the generation the caller read, answering 409 when it moved. It SHALL refuse with 422 and reason `attempt-active`, `admission-not-dispatched`, or `admission-refused`, in that order, and change nothing.

#### Scenario: Attempt with an unknown execution
- **WHEN** an operator re-admits a task whose attempt has an unknown execution
- **THEN** the answer is 422 with reason `attempt-active`

#### Scenario: Concurrent re-admissions
- **WHEN** two operators re-admit the same task, naming the same generation
- **THEN** exactly one answers 201 and the other 409

### Requirement: Slot credential delivery
`fetchSlotCredential` SHALL deliver the credential of a slot that the reservation of the execution's attempt names, at its first fetch after the launch authorization and at every later one, to the worker that owns the execution, only after the checks of account pool contract section 7.3, refusing with 422 and the reason of the first failing check. Every delivery SHALL carry the version that the slot record names, and `LaunchGrant` SHALL carry no credential.

#### Scenario: First fetch after the launch authorization
- **WHEN** the owning worker fetches the slot credential of an execution for the first time after its launch authorization
- **THEN** the answer carries the slot's current credential version, and the launch grant carried none

#### Scenario: Later fetch re-delivers the version
- **WHEN** the owning worker fetches the slot credential of the same execution again after it adopted the execution
- **THEN** the answer carries the same credential version as the first fetch

#### Scenario: Slot outside the reservation
- **WHEN** the owning worker fetches the credential of a slot that the reservation of the execution's attempt does not name
- **THEN** the answer is 422 with reason `capacity-not-reserved` and nothing is revealed

#### Scenario: Revoked slot
- **WHEN** an adopted `started` execution fetches the credential of its slot after an operator revoked the slot, which cancelled its attempt
- **THEN** the answer is 422 with reason `attempt-not-launchable`, the earlier check of account pool contract section 7.3, and nothing is revealed

### Requirement: Per-run SCM credential delivery
`issueRunScmCredential` SHALL return the run's current SCM credential version, issuing the first when the run has none and refusing with `credential-ended` when a revocation ended it, and `fetchRunScmCredential` the version that a refresh notice names, which never changes once written. Both SHALL serve only a worker that holds an attempt of a task of the run, refusing otherwise with 422 and the reason of launch authorization contract section 9.

#### Scenario: Repeated issue
- **WHEN** the worker of an attempt calls `issueRunScmCredential` twice for the same run, with no refresh between
- **THEN** both answers carry the same credential version

#### Scenario: Refresh between two issues
- **WHEN** the run's credential is refreshed between two calls of `issueRunScmCredential`
- **THEN** the second answer carries the refreshed version

#### Scenario: Issue after revocation
- **WHEN** the worker calls `issueRunScmCredential` again after the run's credential was revoked
- **THEN** the answer is 422 with reason `credential-ended` and nothing is issued or revealed

#### Scenario: Ended version
- **WHEN** a worker fetches a version whose secret a refresh ended
- **THEN** the answer is 422 with reason `credential-ended` and nothing is revealed

### Requirement: Remote re-check at SCM credential delivery
Each SCM credential issue and fetch SHALL first re-check the project's binding against the SCM integration's current allowed origin and SHALL refuse with 422 and the first failing reason of `repository-unbound`, `remote-not-https`, `remote-userinfo`, `remote-query`, `remote-fragment`, and `remote-origin-mismatch`, then `credential-ended`, issuing and revealing nothing and recording the reason without a secret.

#### Scenario: Origin narrowed after binding
- **WHEN** an installation owner changes the integration's allowed origin so that the bound remote URL lies outside it, and a worker then fetches the run's credential
- **THEN** the answer is 422 with reason `remote-origin-mismatch`, nothing is revealed, and the reason is recorded

#### Scenario: Project without a binding
- **WHEN** a worker asks for the SCM credential of a run whose project has no repository binding
- **THEN** the answer is 422 with reason `repository-unbound`

#### Scenario: Bound remote not HTTPS
- **WHEN** the stored remote URL of the binding is not HTTPS
- **THEN** the answer is 422 with reason `remote-not-https`

#### Scenario: Bound remote with user information
- **WHEN** the stored remote URL of the binding holds user information
- **THEN** the answer is 422 with reason `remote-userinfo`

#### Scenario: Bound remote with a query
- **WHEN** the stored remote URL of the binding holds a query
- **THEN** the answer is 422 with reason `remote-query`

#### Scenario: Bound remote with a fragment
- **WHEN** the stored remote URL of the binding holds a fragment
- **THEN** the answer is 422 with reason `remote-fragment`

### Requirement: Credential deliveries never kept
`fetchSlotCredential`, `issueRunScmCredential`, and `fetchRunScmCredential` SHALL be the only operations of the document whose responses carry a secret. Each SHALL answer with `Cache-Control: no-store`, and no request log SHALL hold their response bodies.

#### Scenario: Cacheable delivery
- **WHEN** a credential delivery response lacks `Cache-Control: no-store`
- **THEN** the package tests fail
