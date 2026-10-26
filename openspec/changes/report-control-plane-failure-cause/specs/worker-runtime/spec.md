## ADDED Requirements

### Requirement: Control-plane failure cause
A control-plane request without an answer SHALL fail with `unavailable` and the details `cause`, the first four links of the thrown error's cause chain, each its name, code, and message, in at most 512 characters, and `causeCode`, the innermost code of the first 16 links. A message, and a server's message and reason, SHALL be one line of at most 160 characters with no URL, bearer or key-value secret, JWT, or run of 32 or more of `[A-Za-z0-9_+=-]`.

#### Scenario: Reset connection
- **WHEN** `fetch` fails with a cause whose code is `ECONNRESET`
- **THEN** the failure is `unavailable`, `cause` names `fetch failed` and `ECONNRESET`, and `causeCode` is `ECONNRESET`

#### Scenario: Secrets in a cause message
- **WHEN** a cause message holds a URL with user information, a bearer or Basic credential, a quoted `password=` value, a JWT, or a token, wherever a length limit cuts it
- **THEN** `cause` holds no part of them

#### Scenario: Long cause chain
- **WHEN** the cause chain is longer than four links, cyclic, or holds a message of thousands of characters
- **THEN** `cause` has at most four links and 512 characters, and `causeCode` is still the code of the innermost of the first 16 links

#### Scenario: No cause
- **WHEN** the thrown error has no cause and no code
- **THEN** `cause` names only that error, and there is no `causeCode`

#### Scenario: Unbounded server reason
- **WHEN** the control plane answers with a message and a reason of hundreds of characters holding a secret
- **THEN** the failure's message and `reason` hold at most 160 characters of them and no secret

## MODIFIED Requirements

### Requirement: Journaled launch authorization
A worker SHALL commit W2 before the first request of an operation and W3 with each decision, and SHALL repeat a request that reached no decision with the same `operationId`, after a delay of 5 s doubling to 60 s with jitter, until its deadline. A retryable rejection SHALL be retried under a new `operationId`; a final one SHALL end the launch with its observation. A new or resumed execution SHALL report the intent's last sealed one. Each failed request SHALL be logged with its failure.

#### Scenario: No decision
- **WHEN** the launch authority does not answer twice and then grants
- **THEN** all three requests carry one `operationId`, and each delay is within 5 s and 60 s

#### Scenario: Final rejection
- **WHEN** the authority rejects with `gate-not-passed`
- **THEN** the worker journals the rejection with its `execution.launch.rejected` observation and never requests again for the intent

#### Scenario: Relaunch after a seal
- **WHEN** a grant arrives after the deadline and the worker seals its execution and reports it `not-started`
- **THEN** the request for the next execution reports the sealed execution with its granted operation

#### Scenario: Logged authorization failure
- **WHEN** a launch authorization request fails
- **THEN** the worker logs `worker.launch.authorization-failed` with the failure's details, then the execution, the operation, and the failure's code and message, which no detail replaces, and repeats the operation
