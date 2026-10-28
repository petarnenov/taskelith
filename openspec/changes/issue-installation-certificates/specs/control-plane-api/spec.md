## ADDED Requirements

### Requirement: TLS listeners
The control plane SHALL serve the worker API over HTTPS on the installation's API certificate, and the browser endpoint over HTTPS on the operator's `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY`, or on the API certificate when neither is set. Both SHALL refuse TLS below 1.2, and the service SHALL have no plain listener. A missing, unreadable, mismatched, or expired certificate SHALL fail the start and name its setting or file.

#### Scenario: Worker API over HTTPS
- **WHEN** a client that trusts the installation authority calls the worker API
- **THEN** the call succeeds over TLS, and a plain HTTP request on that port gets no API answer

#### Scenario: Operator certificate
- **WHEN** the browser endpoint is configured with an operator's certificate and key
- **THEN** it presents that certificate, and the worker API still presents the installation's

#### Scenario: Old protocol
- **WHEN** a client offers at most TLS 1.1
- **THEN** the handshake fails

#### Scenario: Expired certificate
- **WHEN** the API certificate has expired at start
- **THEN** the start fails with `precondition-failed` and names the certificate file

#### Scenario: Only one browser file
- **WHEN** `TASKELITH_BROWSER_TLS_CERT` is set without `TASKELITH_BROWSER_TLS_KEY`
- **THEN** the settings fail with `invalid` and name `TASKELITH_BROWSER_TLS_KEY`
