## Why

G3 item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26) brings TLS under owner decision D11 (b): an installation certificate authority for the API, the broker, and enrollment, and an operator-supplied certificate for the browser endpoint that falls back to the installation authority. G2 left every connection plain on localhost ports ([ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, "TLS and the installation certificate authority"), and the installation contract's O3 (c) gave G2 only the TLS plumbing of the NATS clients. The JetStream spike's TLS note and the [trust model](/docs/trust-model.md) section 4 put enrollment over TLS. Sub-change 26a issues the certificates and turns TLS on; 26b (worker pinning of the authority at enrollment), 26c (delivery of a rotated credential generation), and 26d (the private-network bind and the acceptance worker) follow.

## What Changes

- **Installation authority.** `init` creates an installation certificate authority once, next to the broker authority, and keeps it in the owner-only document `control-plane/installation-authority` (a mode `0600` file under the `0700` namespace, written by the durable file rule). It also writes the public `control-plane/installation-ca.pem`. A rerun keeps the authority; an installed installation without one fails closed.
- **Server certificates.** The authority issues ECDSA P-256 server certificates for the worker API and NATS, with subject alternative names from `TASKELITH_API_HOSTS` and `TASKELITH_NATS_HOSTS`. `init` issues them, and the new administrative command `issue-installation-certificates`, run by the new `make installation-certificates`, issues them again. Validity: authority 10 years, server certificate 397 days, both provisional; authority rollover is deferred to G6.
- **Issuer port.** A `CertificateIssuer` port in `@taskelith/fleet`, with the adapter `X509CertificateIssuer` in the new private adapter package `@taskelith/certificates`, on `@peculiar/x509@2.2.0` and Node's WebCrypto, with its qualification record.
- **Two HTTPS listeners.** The control plane serves the worker API over `node:https` on the installation server certificate, and a browser endpoint (`TASKELITH_BROWSER_HOST`, `TASKELITH_BROWSER_PORT`, default `127.0.0.1:8443`) on the operator's `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY`, or on the installation server certificate when none is configured. Minimum TLS 1.2; no plain listener; a missing, mismatched, or expired certificate fails the start.
- **Broker TLS.** The installation's NATS requires TLS on its installation certificate, without `allow_non_tls`. The control plane and the administrative entry trust the installation CA by default when `TASKELITH_NATS_CA` is not set. The local Linux worker gets the CA through a read-only trust volume, as `TASKELITH_NATS_CA` and `NODE_EXTRA_CA_CERTS`; it pins nothing (26b).
- **Redaction and repository hygiene.** PEM private-key blocks join the secret shapes; `scrubEnvironment` drops TLS key variables; `make verify` refuses tracked private-key files and PEM private-key blocks, and `.gitignore` ignores `*.pem` and `*.key`.
- **Docs.** Installation contract sections 1 (O3), 3, 7, and 9, the local installation guide, the G3 plan's deferrals, and the dependency register.

No OpenAPI or AsyncAPI document lists servers, so neither changes. PostgreSQL stays plain on localhost (G3 plan deferrals).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installation-enrollment`: "TLS plumbing" renamed and rewritten as "Installation certificate authority"; new "Installation server certificates"; "Secret scrubbing" adds PEM private keys.
- `control-plane-api`: new "TLS listeners".
- `nats-transport`: new "Installation broker TLS".
- `local-installation`: new "TLS of the local installation".
- `execution-observability`: "Logs without secrets" adds PEM private keys.

## Impact

- New package `packages/adapters/certificates` (`@taskelith/certificates`, private); new dependencies `@peculiar/x509@2.2.0` and `reflect-metadata@0.2.2`, which it needs.
- `packages/modules/fleet` (port and domain values), `packages/adapters/control-plane-store` (text reads), `packages/adapters/secrets`, `packages/modules/observability`.
- `apps/control-plane` (administration, admin entry, settings, API server, composition).
- `infra/installation/` (compose, NATS configuration, Dockerfile), `scripts/installation.sh`, `scripts/installation-scenarios.sh`, `Makefile`, a new `scripts/check-private-keys.ts`.
- Out of scope: worker pinning and the fingerprint in the enrollment response (26b), rotation delivery (26c), the private-network bind and the acceptance worker (26d), PostgreSQL TLS (G6, G7), authority rollover (G6).
