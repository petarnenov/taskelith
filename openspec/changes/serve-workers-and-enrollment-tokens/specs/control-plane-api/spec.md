## ADDED Requirements

### Requirement: Workers and enrollment token operations served
The control plane SHALL serve `listWorkers`, `listEnrollmentTokens`, `issueEnrollmentToken`, `revokeEnrollmentToken`, and `rotateEnrollmentToken` as `control-plane.openapi.json` declares them, for an `installation-owner` checked before the body. `listWorkers` SHALL return the admission view with every self-check detail redacted again, and 503 without partial data when a source cannot be read. The token's secret SHALL appear only in the 201 of issue and rotate, with `Cache-Control: no-store`.

#### Scenario: Secret revealed once
- **WHEN** an `installation-owner` issues or rotates a token
- **THEN** the 201 carries the token's record and its secret with `Cache-Control: no-store`, and no list, failure, or log record carries the secret

#### Scenario: Secret-shaped host name
- **WHEN** a worker's host name or a token constraint's host name has a known secret shape
- **THEN** every answer carries it redacted, the stored constraint still matches the host, and only the `secret` of a 201 is kept

#### Scenario: Principal without the owner role
- **WHEN** a principal that is no `installation-owner` calls any of the five operations
- **THEN** the answer is 403 `role-required` naming `installation-owner`, and nothing is recorded

#### Scenario: Unreadable view source
- **WHEN** a worker's record cannot be read while the view is built
- **THEN** `listWorkers` answers 503 with no worker

### Requirement: Enrollment token command refusals
`revokeEnrollmentToken` SHALL answer 204 for a pending, revoked, or expired token, 404 for an unknown one, 422 `token-used` for a used one, and 422 `token-rotated` with `details.replacementTokenId` for a rotated one, checked before expiry. `rotateEnrollmentToken` SHALL replace a pending token by one with its constraints and a new TTL in one transaction and SHALL answer 404 for an unknown token and 422 `token-not-pending` for a used, revoked, or expired one. Both SHALL decide under the row lock.

#### Scenario: Revoke a rotated token
- **WHEN** an owner revokes a token that a rotation replaced, after the old token expired
- **THEN** the answer is 422 `token-rotated` naming the replacement, which stays listed while pending

#### Scenario: Rotate twice
- **WHEN** an owner rotates a token and then rotates the same token again
- **THEN** the first answer is 201 with a new identifier and the same constraints, the old token is no longer listed, and the second answer is 422 `token-not-pending`
