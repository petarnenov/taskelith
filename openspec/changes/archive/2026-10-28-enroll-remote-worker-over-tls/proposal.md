## Why

G3 item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26) enrolls a remote worker over TLS under decision D11 (b), which says that workers pin the installation authority at enrollment ([G3 plan](/docs/g3-plan.md#owner-decisions)). Sub-change 26a (`issue-installation-certificates`) issued the installation CA and turned TLS on, but a worker still trusts the CA only through its configuration: `TASKELITH_NATS_CA` for the broker and Node's `NODE_EXTRA_CA_CERTS` for the API, which adds the CA to the system roots ([installation contract](/docs/contracts/installation-and-enrollment.md) section 7). A remote worker so configured would also trust any certificate that a system root issued, and would send its one-time token to such a server. This is sub-change 26b; 26c (rotation delivery) and 26d (the private-network bind and the acceptance worker) follow.

## What Changes

- **Enrollment bundle.** `issue-enrollment-token` prints, beside the token, `installationCaSha256`: the SHA-256 of the installation CA certificate (its DER), as 64 lowercase hexadecimal digits, read from `installation-ca.pem` under the namespace's checks after the operator is authorized and before the token is issued.
- **Public CA operation, contract first.** The execution OpenAPI document (0.4.0 to 0.5.0) gains `readInstallationCa`, `GET /installation/ca`, without a credential. It answers `InstallationCa`, the CA certificate in PEM and nothing else. The control plane reads the file at start and fails the start when it is missing or holds anything but one CA certificate.
- **Check before the token.** An enrolling worker needs `TASKELITH_INSTALLATION_CA_SHA256`. After it claims its root, it reads the CA through `readInstallationCa` over TLS that does not yet verify the server, and sends the token only when the answer is one CA certificate with that fingerprint. A mismatch fails the start with `precondition-failed` and reason `installation-ca-mismatch`, sends no token, and leaves no `worker/` subtree. There is no trust on first use.
- **Pinning.** The worker keeps the checked CA as `worker/installation-ca.pem`, written before its identity, and trusts only it: every HTTPS call to the control plane goes through an `undici` `Agent` whose only CA is the pinned one, and the broker connection's TLS has the pinned CA as its only CA. A certificate that the system or `NODE_EXTRA_CA_CERTS` trusts but the installation CA did not issue is refused. The worker no longer reads `TASKELITH_NATS_CA`, and its control-plane URL must be `https:`.
- **Outbound only.** The worker still opens no listening socket; a test now covers enrollment over TLS.
- **Unchanged authentication.** Workers keep the bearer secret and the NATS user JWT over TLS that authenticates the server only; no client certificates (26a decision 3).
- **Local installation.** The Linux worker container gets the fingerprint from the token's bundle in `TASKELITH_INSTALLATION_CA_SHA256`; the read-only trust volume and the worker's `TASKELITH_NATS_CA` and `NODE_EXTRA_CA_CERTS` are removed.
- **Docs.** Installation contract sections 5, 7, 9, and 10; the execution wire contracts' document table; the local installation guide; the dependency register.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installation-enrollment`: new "Installation CA fingerprint in the enrollment bundle".
- `control-plane-api`: new "Public installation CA".
- `execution-wire-contracts`: "Execution HTTP operations" adds `readInstallationCa`, which declares no credential.
- `worker-runtime`: "Enrollment on first start", "Worker settings", and "Outbound connections only" modified; new "Installation CA checked before the token" and "Pinned installation CA".
- `local-installation`: "TLS of the local installation" modified: the Linux worker pins the CA it checked at enrollment.

## Impact

- `packages/contracts` (the OpenAPI document and its generated types).
- `apps/control-plane` (the route, its handler, the CA read at start, and the bundle of `issue-enrollment-token`).
- `packages/modules/fleet` (the `InstallationCaSource` port).
- `packages/adapters/worker-control-plane-client` (the pinned `Agent`, the CA read, and the new runtime dependency `undici@7.30.1`, the version that Node.js 24.22.1 bundles).
- `packages/adapters/worker-journal` (`worker/installation-ca.pem`).
- `apps/worker` (settings, the check before the token, and the pinned broker trust).
- `infra/installation/compose.yaml`, `scripts/installation.sh`, `scripts/installation-scenarios.sh`, and the test harnesses that start workers.
- Out of scope: mutual TLS, delivery of a rotated credential generation (26c), CA rollover (G6), the private-network bind and the acceptance worker (26d).
