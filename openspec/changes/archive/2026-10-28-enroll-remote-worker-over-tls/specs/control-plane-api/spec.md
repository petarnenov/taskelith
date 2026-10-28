## ADDED Requirements

### Requirement: Public installation CA
`readInstallationCa` SHALL answer without a credential with the installation CA certificate of `installation-ca.pem` in PEM, and SHALL never answer key material. The control plane SHALL read the file at start under the namespace's checks; a file that is missing or holds anything but one CA certificate SHALL fail the start with `precondition-failed` and name the file, without its content.

#### Scenario: Read without a credential
- **WHEN** a client without a bearer calls `GET /installation/ca`
- **THEN** the answer is 200 with the installation CA certificate, whose SHA-256 equals the enrollment bundle's `installationCaSha256`

#### Scenario: Key beside the certificate
- **WHEN** `installation-ca.pem` holds a PEM private-key block beside the certificate at start
- **THEN** the start fails with `precondition-failed`, names the file, and the failure holds no PEM text
