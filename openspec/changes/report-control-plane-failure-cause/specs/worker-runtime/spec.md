## ADDED Requirements

### Requirement: Control-plane failure cause
A control-plane request without an answer SHALL fail with `unavailable` and the details `cause`, the thrown error's cause chain of at most four links and 512 characters, each its name, code, and message, and `causeCode`, the innermost code. A message SHALL keep no URL, bearer value, key-value secret, or long token-like value. The worker SHALL log each failed launch authorization request with its code and details.

#### Scenario: Reset connection
- **WHEN** `fetch` fails with a cause whose code is `ECONNRESET`
- **THEN** the failure is `unavailable`, `cause` names `fetch failed` and `ECONNRESET`, and `causeCode` is `ECONNRESET`

#### Scenario: Secrets in a cause message
- **WHEN** a cause message holds a URL with user information, a bearer value, a `password=` pair, or a token
- **THEN** `cause` holds none of them

#### Scenario: Long cause chain
- **WHEN** the cause chain is longer than four links, cyclic, or holds a message of thousands of characters
- **THEN** `cause` has at most four links and 512 characters

#### Scenario: No cause
- **WHEN** the thrown error has no cause and no code
- **THEN** `cause` names only that error, and there is no `causeCode`

#### Scenario: Logged authorization failure
- **WHEN** a launch authorization request fails
- **THEN** the worker logs `worker.launch.authorization-failed` with the execution, the operation, the failure's code, message, and details, and repeats the operation
