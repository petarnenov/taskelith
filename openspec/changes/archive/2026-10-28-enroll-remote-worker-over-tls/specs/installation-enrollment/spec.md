## ADDED Requirements

### Requirement: Installation CA fingerprint in the enrollment bundle
`issue-enrollment-token` SHALL print the token with `installationCaSha256`, the SHA-256 of the installation CA certificate's DER as 64 lowercase hexadecimal digits. After it authorizes the operator, it SHALL read `installation-ca.pem` under the namespace's checks before it issues the token; a file that is missing or holds anything but one CA certificate SHALL fail the command with `precondition-failed`, name the file, and issue no token.

#### Scenario: Bundle
- **WHEN** the operator issues an enrollment token
- **THEN** the output holds `enrollmentToken` and `installationCaSha256`, which equals the SHA-256 of the DER of `installation-ca.pem`

#### Scenario: Missing installation CA
- **WHEN** an initialized installation's `installation-ca.pem` is missing and the operator issues an enrollment token
- **THEN** the command fails with `precondition-failed`, names the file, and no token is stored

#### Scenario: Unauthorized operator without the CA
- **WHEN** `installation-ca.pem` is missing and a caller with a wrong operator secret issues an enrollment token
- **THEN** the command fails with `forbidden`, not `precondition-failed`
