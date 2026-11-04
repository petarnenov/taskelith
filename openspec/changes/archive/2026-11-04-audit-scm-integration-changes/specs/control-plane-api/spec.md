## MODIFIED Requirements

### Requirement: Request logs without secrets
The request log SHALL hold only the method, the operation, its path and query parameters, the status, and the failure, redacted with `@taskelith/secrets`. No log line, failure, or audit record SHALL contain a password, a session identifier, a CSRF token, an SCM integration's secret value, or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Secrets absent from output
- **WHEN** a login fails, a CSRF check fails, and a body fails validation with a known password, session identifier, and CSRF token
- **THEN** none of those values appears in the request log, the failure bodies, or the audit trail

#### Scenario: SCM secret absent from the audit trail
- **WHEN** an integration is created, updated, and has a secret replaced, each with a known secret value
- **THEN** that value appears in neither the request log nor the SCM integration audit trail

## ADDED Requirements

### Requirement: Audited SCM integration commands
`createScmIntegration` and `updateScmIntegration` SHALL audit each change they commit with the caller's principal as the actor and `control-plane API <operationId>` as the reason; no system actor exists. A refused or failed command, 400, 403, 404, or 409, SHALL write no audit row.

#### Scenario: Refused update
- **WHEN** an update is refused with 400, 403, 404, or 409
- **THEN** the audit trail holds no row for it
