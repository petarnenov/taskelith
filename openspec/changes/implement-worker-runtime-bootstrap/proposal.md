## Why

G2 work item 20 ([docs/g2-plan.md](../../../docs/g2-plan.md)) builds the worker application, which serves the exit evidence "Real worker protocol on one host" and R05 to R07 and R32. Before this change `apps/worker` was a placeholder without behavior. The coordinator split item 20 into five changes, 20a to 20e, each merged before the next; this is 20a.

Item 13 left the worker's storage of its credentials under `worker/`, with the identity's credential generation, and the use of `connectWorkerTransport` with them, to item 20. Nothing on the worker called `enrollWorker`.

## What Changes

- **Fleet.** The `EnrollmentClient` port: the worker's side of `enrollWorker`.
- **Worker control-plane client.**
  - `HttpEnrollmentClient` on the built-in `fetch`.
  - The JSON POST and the status mapping move into a shared module that `HttpLaunchAuthorityClient` also uses. 409 and 422 map to `conflict` and `precondition-failed`, and a server's `reason` detail is kept.
- **Worker journal.**
  - `worker/identity` records the credential generation and references to the credential files.
  - Enrollment writes the journal, then the credential files under `worker/credentials/`, then the identity.
  - `readWorkerCredentials` reads them only through safe control-record paths.
  - An open root exposes its identity.
- **Worker application.**
  - Settings from the environment.
  - `startWorker`: open the enrolled root, or enroll once with the configured token; check the journal fault; connect to the broker with the stored credential, outbound only.
  - `workerMain` and `serveUntilStopped`.
- **Documents.** Section 10 of the installation and enrollment contract, and the `worker/credentials/` row of the worker journal contract.

## Capabilities

### New Capabilities

- `worker-runtime`: the worker application, starting with its settings, enrollment on first start, and start sequence.

### Modified Capabilities

- `worker-journal-adapter`: the credential storage of an enrolled root.

## Impact

Private workspace packages only, so the commits use `chore` and `test`. No published CLI command, OpenAPI or AsyncAPI document, or third-party dependency changes.
