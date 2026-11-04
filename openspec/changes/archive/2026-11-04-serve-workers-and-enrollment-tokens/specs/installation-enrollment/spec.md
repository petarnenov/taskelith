## MODIFIED Requirements

### Requirement: Single-use enrollment
An enrollment token SHALL be stored only as its hash, used once, and valid for the provisional TTL. Enrollment SHALL refuse an unknown, used, expired, or revoked token (`token-invalid`), a host outside its constraints (`host-mismatch`), no common protocol version (`protocol-not-supported`), and an enrolled journal (`journal-enrolled`). A revocation or rotation SHALL serialize with a redemption of the same token, so that exactly one of them succeeds.

#### Scenario: Token reuse
- **WHEN** a used token is presented again
- **THEN** enrollment fails with `forbidden` and reason `token-invalid`

#### Scenario: Revoked token
- **WHEN** a token that the owner revoked or rotated is presented
- **THEN** enrollment fails with `forbidden` and reason `token-invalid`, and no worker is enrolled

#### Scenario: Revocation races a redemption
- **WHEN** a token is revoked while a worker redeems it
- **THEN** either the worker is enrolled and the revocation fails with `token-used`, or the token is revoked and the redemption fails with `token-invalid`
