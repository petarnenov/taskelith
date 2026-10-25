# control-plane-api Specification

## Purpose
The control-plane service: its composition root, the HTTP operations of the SDLC and execution contracts, the submit-task use case, and its background loops.

## Requirements

### Requirement: Operator credential
Every SDLC operation, `readTaskResult`, and the quarantine operations SHALL require the installation-owner credential as a bearer token, and SHALL answer 401 without it or with another.

#### Scenario: Wrong bearer
- **WHEN** `createRun` is called with a bearer that is not the operator credential
- **THEN** the answer is 401 with a `Failure` of code `forbidden`

### Requirement: Runtime validation
Every request body SHALL be validated against its contract schema before any use case runs, and SHALL be answered 400 when it fails or exceeds 1 MiB.

#### Scenario: Invalid body
- **WHEN** `createRun` receives a body without its binding
- **THEN** the answer is 400 and no run is created

### Requirement: Atomic task submission
`submitTask` SHALL admit the task, use its admission, open the task, write its root lineage link and run binding, and append `sdlc.admission.used`, all in one transaction. A repeat of the same submission SHALL return the stored one, and a conflicting repeat SHALL be 409.

#### Scenario: Submitted task
- **WHEN** a planning task is submitted to a run's planning stage
- **THEN** the answer is 201 with a used admission at ownership generation 1, and the published `sdlc.admission.used` validates against its schema

#### Scenario: Implementation without gates
- **WHEN** an implementation task is submitted before its prerequisite gates passed
- **THEN** the answer is 422

### Requirement: Known workflows
`createRun` SHALL accept only a binding to a workflow of the configured registry with its digest, answering 422 otherwise, and SHALL return the stored run to a retry of the same request and 409 to another request for it.

#### Scenario: Unknown digest
- **WHEN** a run is created with a digest the registry does not hold
- **THEN** the answer is 422

### Requirement: Wire commands
Every scheduling outbox row SHALL be a wire command with `CommandMetadata`, its SDLC binding, and the payload at the protocol version the worker shares, and placement SHALL not choose a worker without a protocol version.

#### Scenario: Offer
- **WHEN** a placement commits
- **THEN** its outbox row validates against `AssignmentOfferCommand` and carries the recovery epoch

### Requirement: Publication under restore quarantine
The outbox publisher SHALL publish no row while the installation is quarantined or has no record.

#### Scenario: Quarantine lifted
- **WHEN** a task is submitted under quarantine and the quarantine is then lifted
- **THEN** its event stays unpublished until the lift and is published after it

### Requirement: Enrollment and redrive over HTTP
`enrollWorker` SHALL enroll with the single-use enrollment token as its bearer, and the redrive operation SHALL publish a quarantined message again only for the operator.

#### Scenario: Token reuse
- **WHEN** an enrollment token is used a second time
- **THEN** the answer is 401

### Requirement: Background loops and observability
The service SHALL run the outbox publisher, the quarantine keeper, the grace-window sweep, the observability sampler, and the lag monitor until it stops. It SHALL log every request with its correlation and without any secret.

#### Scenario: Request log
- **WHEN** a request carries `x-correlation-id`
- **THEN** the response echoes it, and its log line carries it with no bearer token
