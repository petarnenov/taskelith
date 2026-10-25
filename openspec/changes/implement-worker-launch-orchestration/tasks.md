## 1. Execution and journal

- [x] 1.1 Give the execution facts their wire fields, with `recordStart` taking the process and `recordExit` the exit.
- [x] 1.2 Fill the assignment reference and recovery epoch from the journal's launch intent.
- [x] 1.3 Add `launchRetryDelay` and the `EvidencePublisher` port.

## 2. Control-plane client

- [x] 2.1 Add `HttpEvidencePublisher` with a multipart POST.

## 3. Worker application

- [x] 3.1 Add the supervision port and its file adapter over `@taskelith/worker-supervisor`.
- [x] 3.2 Add `LaunchOrchestrator`: W2, the retry loop, W3, the deadline, abandonment, the launch sequence, and cancellation forwarding.
- [x] 3.3 Map the execution facts to their observations.
- [x] 3.4 Read the launch settings and wire the orchestrator in `startWorker` only with a launch command.
- [x] 3.5 Document the launch settings in `docs/local-installation.md`.

## 4. Verification and review

- [x] 4.1 Run `make verify`.
- [ ] 4.2 Run the independent review and record it in `verification.md`.
