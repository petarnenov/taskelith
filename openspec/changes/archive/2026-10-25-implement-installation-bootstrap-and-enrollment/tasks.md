## 1. Packages and modules

- [x] 1.1 Move the data-root helpers into `@taskelith/data-root`.
- [x] 1.2 Add the `access` and `fleet` modules with in-memory adapters and conformance suites.
- [x] 1.3 Add `@taskelith/secrets` with secrets, identifiers, redaction, and environment scrubbing.
- [x] 1.4 Add `@taskelith/control-plane-store` with the namespace and the installation record.
- [x] 1.5 Add the PostgreSQL migration and repositories.
- [x] 1.6 Add the JWT encoder, broker authority, broker credentials, `.creds` authentication, and TLS to `@taskelith/nats`.
- [x] 1.7 Add the administrative entry to `apps/control-plane`.

## 2. Test services and documents

- [x] 2.1 Run the test NATS in operator mode with TLS from a test CA, and move the tests to credentials.
- [x] 2.2 Add the contract page, the operational target row, the dependency register row, and the storage pointer.

## 3. Verification and review

- [x] 3.1 Add unit, conformance, and integration tests, end to end through the administrative entry.
- [x] 3.2 Run `make verify` and record the results.
- [x] 3.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
