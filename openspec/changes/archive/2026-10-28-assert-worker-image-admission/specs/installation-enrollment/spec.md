## ADDED Requirements

### Requirement: Workers view in the administrative entry
The administrative command `worker-admission` SHALL print the workers view as JSON only after it verifies the operator credential from `TASKELITH_OPERATOR_TOKEN`, and SHALL redact every stored check detail again before it prints it. A wrong credential SHALL fail with `forbidden` and print no view.

#### Scenario: Operator reads the view
- **WHEN** the operator runs `worker-admission` with the operator credential after a worker enrolled
- **THEN** it prints that worker as `awaiting-self-check` with no results and exits with 0

#### Scenario: Wrong credential
- **WHEN** `worker-admission` runs with another credential
- **THEN** it exits with 1 and prints only a `forbidden` error

#### Scenario: Secret in a detail
- **WHEN** a stored check detail holds a value shaped like a secret
- **THEN** the printed view holds the redaction marker in its place
