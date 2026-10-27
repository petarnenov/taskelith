## ADDED Requirements

### Requirement: TLS of the local installation
The composition's NATS SHALL refuse plain clients, the control plane SHALL publish the worker API and the browser endpoint over HTTPS on localhost, both on the installation's API certificate, and the Linux worker SHALL trust the installation CA from a read-only volume. `make installation-certificates` SHALL issue the server certificates again, install the broker's files, and restart the running broker and control plane. PostgreSQL SHALL stay plain on localhost.

#### Scenario: Plain broker client
- **WHEN** a client connects to the composition's NATS without TLS
- **THEN** the server refuses the connection

#### Scenario: Re-issued certificates
- **WHEN** `make installation-certificates` runs on a started installation
- **THEN** the broker and the control plane serve the new certificates, and the worker reconnects with the same CA

#### Scenario: Browser certificate in the composition
- **WHEN** `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY` are set on the host of the composition
- **THEN** the browser endpoint still serves the installation's API certificate
