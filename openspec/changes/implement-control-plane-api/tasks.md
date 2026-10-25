## 1. Contracts and modules

- [x] 1.1 Declare `operatorToken` and the createRun 422 in `sdlc.openapi.json` 0.3.0, the quarantine operations in `execution.openapi.json` 0.2.0, and the SDLC events address in `sdlc.asyncapi.json` 0.3.0.
- [x] 1.2 Build the wire commands in Scheduling with the admission, the recovery epoch, and the protocol version.
- [x] 1.3 Record the shared protocol version at enrollment.
- [x] 1.4 Add the `RunCatalog` port, its in-memory and PostgreSQL adapters, and the migration.
- [x] 1.5 Map the SDLC events subject and add its stream.

## 2. Control plane

- [x] 2.1 Add the run and task use cases behind `ControlPlaneStore`.
- [x] 2.2 Add the HTTP adapter and the operation handlers.
- [x] 2.3 Add the quarantine-guarded outbox, the composition root, the settings, and the service entry.
- [x] 2.4 Record the provisional loop intervals and the plain-HTTP note.

## 3. Verification and review

- [x] 3.1 Add unit, conformance, and end-to-end tests.
- [ ] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
