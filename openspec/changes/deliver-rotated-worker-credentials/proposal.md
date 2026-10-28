## Why

G3 item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26) includes the delivery of a rotated credential generation to an enrolled worker, which adopts it atomically under `worker/credentials/` and keeps the previous generation until the control plane confirms the new one. Until now `rotate-worker` minted the next generation on the control plane, printed its secrets, NKey seed included, to the operator, and kept the previous generation only for the 10-minute grace window; nothing delivered the new generation, so every enrolled worker lost access when that window ended ([installation contract](/docs/contracts/installation-and-enrollment.md) section 6). Sub-changes 26a and 26b are done; this is sub-change 26c. 26d (the private-network bind and the acceptance worker) follows.

## What Changes

- **Request only.** `rotate-worker WORKER_ID --actor WHO --reason WHY` records a rotation request for the next generation with a deadline of max(grace window, 7 days) from the request, writes an audit event, and appends the notice `worker.credentials.rotation-requested {credentialGeneration, deadline}` to the worker's command subject in the same transaction. It prints `{workerId, credentialGeneration, deadline}` and no secret. A repeat while the rotation is open answers the same request and sends the notice again.
- **Contracts first.** The execution OpenAPI document goes from 0.6.0, the version of sub-change 9c on `dev`, to 0.7.0 with `renewWorkerCredentials` (`POST /workers/credentials/renewals`) and `confirmWorkerCredentials` (`POST /workers/credentials/confirmations`), both under the worker credential; the execution AsyncAPI document goes from 0.7.0 to 0.8.0 with the notice on the command channel, whose three breaking changes `packages/contracts/breaking-changes.json` declares.
- **Renewal.** The worker generates the NKey and the `tkwk_` bearer secret of the new generation with the generator the control plane uses, stores them durably, and sends only the NKey public key and the secret's SHA-256 with the bearer of its current generation. The control plane signs the broker user JWT for that key and answers `{credentialGeneration, brokerUserJwt, deadline}`; a repeat with the same key and hash answers the same JWT. No rotation open for the caller's next generation is 409 `rotation-not-requested`; another key or hash for a renewed generation is 409 `renewal-mismatch`.
- **Adoption and confirmation.** The worker writes the new generation's files once, replaces `worker/identity` atomically with the new generation as current and the previous one kept, reconnects to the broker with the new user, and only after that connection succeeds confirms with the new bearer. The confirmation drops the previous generation at once: its bearer hash goes and its broker user is recorded for revocation and published.
- **Hard cap.** The periodic sweep (`expire-grace-windows`) enforces the deadline: a renewed but unconfirmed rotation drops the previous generation and keeps the new one; a rotation that was never renewed revokes the worker with reason `rotation-expired`, which then must re-enroll.
- **Restart.** Every worker start resumes the rotation from its files: a stored but unrenewed generation is renewed, an adopted but unconfirmed one is confirmed after the broker connection.
- **Bounded broker authentication failures.** NATS authorization and authentication-expired errors are classified `credentials-rejected`. A worker tries every local generation; after 3 consecutive rounds in which all were rejected it stops with reason `credentials-expired` and names re-enrollment. Other broker failures keep the endless retry.
- **Audit.** `audit_events` gets `subject` (`operator` or the worker identifier) and four kinds: `worker-credential.rotation-requested`, `.renewed`, `.confirmed`, and `.rotation-expired`. Failed renewals go to logs only.
- **Docs.** The installation contract's confirm-or-cap wording (sections 1, 4, 6, 9, and 10), the worker journal contract's credential files and replace rule, the execution wire contracts' document table and notice, the trust model, the operational targets, and a follow-up line under row 26 of the G3 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installation-enrollment`: "Worker credentials" and "Worker bearer authentication" modified; "Rotation request", "Credential renewal", "Credential confirmation", and "Credential audit events" added.
- `control-plane-api`: "Background loops and observability" and "Worker credential scheme" modified; "Credential renewal and confirmation operations" added.
- `execution-wire-contracts`: "Worker channels" modified; "Credential rotation notice" added, which also defines `renewWorkerCredentials` and `confirmWorkerCredentials`.
- `nats-transport`: "Rejected broker credentials" added.
- `worker-journal-adapter`: "Credential adoption files" added.
- `worker-runtime`: "Credential rotation on the worker", "Rotation resumed at every start", and "Expired broker credentials" added.

## Impact

- `packages/contracts` (both execution documents, the breaking-change declaration, generated types).
- `packages/modules/access` (the audit event's subject and kinds), `packages/modules/fleet` (the rotation domain, service, registry port, conformance, broker signing and renewal client ports), `packages/adapters/postgres` (the audit write helper, the rotation columns in the existing migrations, the registry), `packages/adapters/nats` (user JWT signing for a given key, worker NKey generation, the rejected-credential classification, the notice's schema), `packages/adapters/worker-journal` (identity format 2, the pending and adoption files), `packages/adapters/worker-control-plane-client` (the renewal client and a bearer read per request).
- `apps/control-plane` (routes, handlers, `rotate-worker`, the notice in the request's transaction, the sweep's revocations) and `apps/worker` (the rotation driver, the broker re-dial, the bounded authentication failures, the notice's dispatch).
- Out of scope: 26d (the private-network bind and the second-host acceptance), mutual TLS, a worker-generated NKey at enrollment (a follow-up line under row 26), an HTTP status endpoint for rotations, and unrelated refactors.
