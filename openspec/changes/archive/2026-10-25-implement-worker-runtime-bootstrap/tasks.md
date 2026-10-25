## 1. Ports and adapters

- [x] 1.1 Add the `EnrollmentClient` port to Fleet.
- [x] 1.2 Add `HttpEnrollmentClient`, and share the JSON POST and the status mapping with `HttpLaunchAuthorityClient`.
- [x] 1.3 Store the credentials under `worker/credentials/` with references and the generation in `worker/identity`, and add `readWorkerCredentials`.

## 2. Worker application

- [x] 2.1 Read the worker's settings from its environment.
- [x] 2.2 Add `startWorker` with enrollment on the first start, the start checks, and the broker connection.
- [x] 2.3 Add `workerMain` and `serveUntilStopped`.

## 3. Documents

- [x] 3.1 Add section 10 to the installation and enrollment contract, and the credentials row to the worker journal contract.

## 4. Verification and review

- [x] 4.1 Run `make verify`.
- [ ] 4.2 Run the independent review and record it in `verification.md`.
