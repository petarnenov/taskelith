## 1. Fleet and PostgreSQL

- [x] 1.1 Add `FleetRegistry.workerByCredentialHash`, its in-memory adapter, and a conformance case.
- [x] 1.2 Add `EnrollmentService.authenticateWorkerBearer` and `WorkerPrincipal`, replacing `authenticate(workerId, secret)`.
- [x] 1.3 Add the hash columns with their backfill, and keep them in step in every writer.

## 2. Control plane

- [x] 2.1 Add the `workerCredential` scheme, `ApiHandlers.authenticateWorker`, the principal on `ApiRequest`, and the replaceable route table.

## 3. Verification and review

- [x] 3.1 Add unit, conformance, migration, and server tests.
- [ ] 3.2 Run `make verify` and record the results.
- [ ] 3.3 Obtain independent review (OpenCode `deepseek-v4.1-flash`, high, read-only) and record the results.
