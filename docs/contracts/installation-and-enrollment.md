# Installation and enrollment contract

Status: G2 item 13 (`implement-installation-bootstrap-and-enrollment`), 2026-10-25; the installation certificate authority and TLS of section 7 are G3 item 26a (`issue-installation-certificates`), 2026-10-28; the enrollment bundle's fingerprint and the worker's pinning of the authority are G3 item 26b (`enroll-remote-worker-over-tls`), 2026-10-28. This page states the rules of trust model sections 2 to 5 that item 13 implements, and the content of the credentials that the [execution wire contracts](execution-wire-contracts.md) leave to it. The modules are `@taskelith/access` and `@taskelith/fleet`. The adapters are `@taskelith/postgres`, `@taskelith/nats`, `@taskelith/control-plane-store`, and `@taskelith/secrets`. The administrative entry is `apps/control-plane/src/admin/admin-main.ts`.

## 1. Decisions

| Decision | Outcome | By |
| --- | --- | --- |
| D9 (a) | NATS decentralized authentication: an operator, a system account, and one account per installation; per-worker user JWTs with NKeys issued at enrollment; revocation through the account | Owner, 2026-10-25 |
| D10 (a) | Only the installation-owner bootstrap credential, as a hashed opaque token | Owner, 2026-10-25 |
| O1 (b) | `@nats-io/nkeys@2.0.3` as a direct dependency, with a claims encoder of this repository for operator, account, and user JWTs: an owner-approved exception to the "established OSS" principle of ADR 0004 | Owner, 2026-10-25 |
| O2 (a) | Operator mode with the `full` resolver and a system account; revocations are pushed through `$SYS.REQ.CLAIMS.UPDATE`, without a server reload | Owner, 2026-10-25 |
| O3 (c) | TLS plumbing only in G2: the client trusts the CA configured on it; tests use a test CA. G3 item 26a adds the installation CA, its issuance at `init`, and TLS for the API and the installation broker (section 7) | Owner, 2026-10-25 |
| 26b decisions 3, 4 | Workers keep bearer and broker credentials over server-only TLS, without mutual TLS; the enrollment bundle carries the authority's fingerprint, with no trust on first use | Owner's away delegate, away run `20261027T221048Z-claude-63826`, 2026-10-27, as the coordinator's brief carries them |
| 26a decisions 1, 2, 3, 5, 8 | The authority key as an owner-only file of `control-plane/`; authority 10 years and server certificate 397 days, provisional; workers keep bearer and broker credentials over server-only TLS, no client certificates; `@peculiar/x509` behind a port; two listeners | Owner's away delegate, away run `20261027T221048Z-claude-63826`, 2026-10-27; decisions 1, 2, 3, and 5 pending the owner's review |
| O4 | Provisional enrollment token TTL `15 min` and rotation grace window `10 min` (operational targets), verified in G6 | Owner, 2026-10-25 |
| C5 to C10 | The record outside the database, the neutral data-root package, the module placement, tokens and secrets, revocation and quarantine wiring, and the operator-mode test services, as below | Coordinator, 2026-10-25 |

## 2. Installation initialization

- **Explicit only.** Only the administrative command `init` initializes an installation. It needs a direct invocation on the control-plane host, with an actor and a reason. No start of a worker, CLI, or service initializes anything.
- **Order.** `init` applies the migrations, then creates or keeps the broker authority, then creates or keeps the installation certificate authority and issues the server certificates (section 7), then does the following:
  1. It writes `control-plane/installation` (`{format: 1, installationId, recoveryEpoch: 1}`) outside the database.
  2. It writes the copy in the `installation` table, not quarantined.
  3. It issues the bootstrap credential. The credential is printed once and only its hash is stored.

  A rerun after a crash completes the same identity. A rerun after success fails with `conflict` and keeps the broker trust and its server fragment. A table copy without its record, or a record without its broker authority or its installation certificate authority, fails with `precondition-failed`, because a new authority would not match the running broker or the workers' trust.
- **Start check.** A command or service that needs the installation reads both records. They must exist and be equal. A mismatch, as after a database restore, fails closed with `precondition-failed` until G6's restore procedure. Item 13 never changes `recoveryEpoch`.
- **Identifiers.** `installationId` is 32 hexadecimal characters and `workerId` is `w` followed by 32 hexadecimal characters, both from 128 random bits. Every identifier of this contract is 1-64 letters, digits, `_`, or `-`, because it becomes a NATS subject token and stream name.

## 3. The `control-plane/` namespace

- `dataRoot` resolves as in the [storage contract](../storage.md): explicit configuration, then `TASKELITH_DATA_DIR`, then the OS default.
- `dataRoot` and `dataRoot/control-plane` are directories owned by the running account and created with mode `0700`, as is every missing parent of `dataRoot`, such as `~/.local/share` on a fresh account. A worker whose executions run under a separate account later opens its own `dataRoot` to that account's group for traversal only (`0710`, [worker journal](worker-journal.md) section 2). No component from `dataRoot` down may be a symbolic link, owned by another account, or writable by group or others. `control-plane/` and every file in it must give group and others no access at all, since the subtree holds signing seeds. A data root inside a Git working tree is refused. A colocated worker keeps its own `worker/` subtree.
- Every file is a regular file of mode `0600`, written by the durable file rule of the [worker journal](worker-journal.md) section 4. A document carries `format: 1`, and another format is refused. Evidence content is raw bytes, not a document.

| File | Content | Written |
| --- | --- | --- |
| `installation` | `installationId`, `recoveryEpoch` | Once, at `init` |
| `broker-authority` | The operator, system account, and installation account seeds (`BrokerAuthorityKeys`) | Once, at `init` |
| `nats-authority.conf` | The nats-server trust fragment: `operator`, `system_account`, the `full` resolver, and its preload of both accounts | At `init`, for the operator to include in the server configuration (item 23) |
| `installation-authority` | The installation certificate authority: its certificate and its PKCS#8 private key, in PEM | Once, at `init` |
| `installation-ca.pem` | The authority's public certificate, which clients trust | At `init` and at each `issue-installation-certificates` |
| `api-certificate.pem`, `api-key.pem` | The worker API's server certificate and private key | At `init` and replaced at each `issue-installation-certificates` |
| `nats-certificate.pem`, `nats-key.pem` | The broker's server certificate and private key, which the operator installs for nats-server | At `init` and replaced at each `issue-installation-certificates` |
| `evidence/sha256/<first two hex digits>/<hex digest>` | Evidence content named by its SHA-256 digest (G2 item 19); its record is in PostgreSQL | Once per digest, at its first publication; a republication of the same content replaces a corrupt copy |

## 4. The operator credential

- The bootstrap credential and every reset are `tkop_` followed by 256 random bits in base64url. Only the SHA-256 hash is stored, and comparison is in constant time. Its high entropy makes a slow hash unnecessary.
- `reset-operator-credential` replaces the credential with the next generation. It needs a direct invocation on the host with an actor and a reason, and writes an immutable row of `audit_events`; a trigger refuses updates and deletions. It never lifts a quarantine.
- `issue-enrollment-token`, `rotate-worker`, `revoke-worker`, and `expire-grace-windows` read the operator credential from `TASKELITH_OPERATOR_TOKEN`, never from the command line.

## 5. Enrollment

- **Token.** `tken_` followed by 256 random bits, stored as its SHA-256. It is single-use, valid for the enrollment token TTL, and optionally bound to `platform`, `architecture`, and `hostname`.
- **Bundle.** `issue-enrollment-token` prints the token with `installationCaSha256`, the SHA-256 of the DER of the installation CA certificate in 64 lowercase hexadecimal digits. It reads `installation-ca.pem` under the checks of section 3 before it issues the token, so a file that is missing or is not exactly one CA certificate fails with `precondition-failed`, names the file, and issues no token. The operator hands the worker both values (section 10).
- **Checks, in order:**
  1. An unknown, used, or expired token is `forbidden` with reason `token-invalid` (401 of `enrollWorker`).
  2. A host that the constraints do not allow is `precondition-failed` with reason `host-mismatch` (422).
  3. A worker whose protocol window shares no version with the server's is `precondition-failed` with reason `protocol-not-supported` (422).
  4. A journal that is already enrolled is `conflict` with reason `journal-enrolled` (409).
- **Atomicity.** One transaction uses the token and adds the worker, so concurrent redemptions have one winner. Expiry is checked at the moment of use, after the token's row lock (`clock_timestamp()`), so a use that waited past the expiry fails with `token-invalid`.
- **Placement.** The new `workers` row is enrolled, not revoked, not draining, not reachable until its first contact (item 21), and awaits its self-check until its first report ([worker admission](worker-admission.md)), with the declared capacity.
- **Response.** `credentialGeneration` 1, the installation's `recoveryEpoch`, the server's protocol window, and the two credentials of section 6.

## 6. Credentials

- **`credentials.controlPlane`:** `tkwk_` followed by 256 random bits, the bearer secret of the `workerCredential` scheme. Only its hash is stored, per generation.
- **`credentials.broker`:** the text of a NATS `.creds` file. It holds a user JWT signed by the installation account, and the user's NKey seed. The user may:
  - publish `$JS.API.CONSUMER.INFO.<commands stream>.<workerId>`, `$JS.API.CONSUMER.MSG.NEXT.<commands stream>.<workerId>`, `$JS.ACK.<commands stream>.<workerId>.>`, its own observation subject, and its own heartbeat subject `taskelith.<installationId>.workers.<workerId>.heartbeats`;
  - subscribe to `_INBOX.<installationId>.<workerId>.>`.

  It has no other JetStream API, so a worker connects with `connectWorkerTransport`, and only the control plane manages streams. The broker URL and CA are configured on the worker.
- **Generations.** Both credentials share one generation number.
  - `rotate-worker` issues the next generation. The previous one stays valid for the grace window.
  - In G2 nothing delivers a rotated generation to the worker, and the worker cannot adopt one: a worker keeps the generation it enrolled with, and loses access when that generation's grace window ends. Section 10 refuses a new enrollment on an existing root, so the only recovery is a new worker: a new token, a new root and a new `workers` row. The old identity is revoked, and its unfinished attempts are reconciled before its journal is removed. Delivery and adoption belong to [G3 item 26](../g3-plan.md#work-items) (decided on 2026-10-25).
  - `expire-grace-windows`, which the control plane runs periodically, drops the previous generation after the window and records its broker user for revocation. A further rotation drops an older predecessor at once in the same way.
  - A revoked worker gets no new generation: the rotation fails inside the transaction that would store it.
  - Authentication takes the bearer alone and returns the worker and the generation it belongs to, found by the hash of the secret (change `add-worker-bearer-authentication`). An unknown, revoked, or expired one is `forbidden` with reason `worker-not-authorized`. The check is point in time: an operation that writes re-reads the worker in its own transaction.
- **Revocation.** `revoke-worker` marks the worker revoked in the same row placement reads. In the same transaction it records every broker user of the worker in `broker_revocations`. The server disconnects such a user at once and refuses it afterwards.
  - **Durable list.** Every broker user to revoke is recorded in the transaction that stops its validity: a revocation, a rotation that drops a predecessor, or the end of a grace window. It stays recorded after its publication.
  - **Time.** Each user is void for JWTs issued up to its revocation time, and that time is never earlier than its own JWT's issue time, which its generation records. So a revocation that raced a rotation still voids the new user.
  - **Publication.** A publication sends the broker the complete list in the account JWT. It runs in its own READ COMMITTED transaction: it takes a PostgreSQL advisory lock first, so publishers take turns across processes, and then reads every committed entry. An entry counts as published only after the broker accepted a list that contained it.
  - **Retry.** A publication that fails leaves the entries unpublished. `revoke-worker` then reports `unavailable`. A rotation is already committed, so it returns its new secrets with `revocationsPublished: false`, also when the publication throws, and the administrative entry prints them with a retry hint and exits with status 1. The rerun, or the next `expire-grace-windows`, publishes the entries.
  - The active attempts of a revoked worker become uncertain through reconciliation (item 21), never dead.
- **Workers get no database credential.** The control plane connects to NATS as a user of the installation account without subject limits.

## 7. TLS

G3 item 26a implements decision D11 (b) of the [G3 plan](../g3-plan.md#owner-decisions) for the API and the broker. Its decisions are those of section 1; G3 item 26b adds the remote enrollment over TLS with the authority pinned (the bundle of section 5, the workers and the public certificate below, and section 10).

- **Authority.** `init` creates one ECDSA P-256 certificate authority, valid for 10 years, and keeps it in `installation-authority` (section 3). A rerun keeps it. An initialized installation without it fails with `precondition-failed`, and no command creates a new one: rollover is deferred to G6.
- **Server certificates.** The authority issues ECDSA P-256 server certificates, valid for 397 days from one hour before their issuance, for the worker API and for NATS. Their subject alternative names are the DNS names and IP addresses of `TASKELITH_API_HOSTS` and `TASKELITH_NATS_HOSTS`, comma-separated, default `localhost,127.0.0.1,::1`; a wildcard or an invalid name fails with `invalid` and names the variable. `init` issues them, and `issue-installation-certificates` (`make installation-certificates`) issues them again. Both certificates are issued before any file is written, and an authority that is no CA, does not match its key, has expired, or ends before the new certificate would is refused with `precondition-failed` and changes no file; authority rollover is G6 work. A certificate and its key are two files, so a crash between their writes leaves a pair that fails the next start, naming the key file and `make installation-certificates`, until the command runs again.
- **Provisional periods.** The 10-year and 397-day periods are provisional; authority rollover is deferred to G6.
- **Listeners.** The control plane serves the worker API (`TASKELITH_API_HOST`, `TASKELITH_API_PORT`) over HTTPS on the API certificate, and the browser endpoint (`TASKELITH_BROWSER_HOST`, `TASKELITH_BROWSER_PORT`, default `127.0.0.1:8443`) over HTTPS on the operator's `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY`, or on the API certificate when neither is set. Both refuse TLS below 1.2, and the service has no plain listener. Workers use only the worker API and never trust an operator's authority. One browser file without the other, an unreadable file, a key that does not match its certificate, and an expired certificate fail the start and name the setting or file at fault: the key's for a key that does not parse or match. The local composition passes no browser files, so its browser endpoint serves the API certificate until 26d.
- **Broker.** The installation's nats-server requires TLS on the NATS certificate. `connectTransport`, `connectWorkerTransport`, and `connectSystemAccount` take an optional `tls` with the CA in PEM and an optional client certificate; without one the connection stays plain. The control plane and the administrative entry read the CA from `TASKELITH_NATS_CA`, or, when it is not set, from `installation-ca.pem` of their data root under the checks of section 3. Before `init` they connect without a CA; an initialized installation without its CA fails with the file's path before connecting, and `issue-installation-certificates`, which needs no broker, writes it again.
- **Workers.** Workers authenticate with their bearer secret and broker credentials over TLS that authenticates the server only; client certificates were rejected (section 1). Since 26b a worker pins the authority at enrollment (section 10) and trusts only it, for the API and for the broker; it reads neither `TASKELITH_NATS_CA` nor any other trust setting, and a certificate that the system or `NODE_EXTRA_CA_CERTS` trusts but the authority did not issue is refused.
- **Public authority certificate.** `readInstallationCa` (`GET /installation/ca`) answers the authority's certificate without a credential, and only the certificate. The control plane reads `installation-ca.pem` once at start under the checks of section 3; a file that is missing or is not exactly one CA certificate fails the start with `precondition-failed` and names the file, never its content.
- **Test services.** The integration services give NATS a certificate from a test CA, made by the openssl of the pinned PostgreSQL image, and allow plain clients for the Toxiproxy route.
- **PostgreSQL** stays plain while it is co-located with the control plane, in the local composition on the Compose network, unpublished; its TLS is deferred to G6 and G7 ([G3 plan deferrals](../g3-plan.md#g2-closure-deferrals)).

## 8. Secret scrubbing

`@taskelith/secrets` redacts this installation's bearer secrets (by their `tkop_`, `tken_`, `tkwk_` prefixes), NKey seeds, NATS JWTs, whole `.creds` blocks, PEM private-key blocks of any type, also cut ones, and the user information of URLs, such as a database password, percent-encoded or not. PEM certificates stay.
- `redactSecrets` and `redactFailure` also take the credentials revealed to a run and redact each by its exact text, with one `[redacted]` for each run of overlapping or touching occurrences, because a slot credential has no known shape; `redactFailure` redacts detail keys too ([account pool contract](account-pool.md) section 7.4).
- The administrative entry redacts every failure before printing it.
- `scrubEnvironment` drops every variable named like a secret, including the names of TLS key files (`TLS_KEY`, `SSL_KEY`), or holding one, from a child process's environment, a service URL with user information included.
- Failures name settings and identifiers, never secret values.
- Logs are item 22's, which uses the same helpers.

## 9. Left to other items

- **Item 16:** the HTTP operations (`enrollWorker` and the operator credential check); worker bearer authentication is the change `add-worker-bearer-authentication`, split from item 17; the wiring of `InstallationGuard` into the outbox publisher, which stops command publication under restore quarantine; the periodic `expire-grace-windows`.
- **Item 20:** the worker's storage of its credentials under `worker/` with the identity's credential generation, and the use of `connectWorkerTransport` with them. Change `implement-worker-runtime-bootstrap` implements both (section 10).
- **Item 21:** the uncertain ownership of a revoked worker's attempts.
- **Item 23:** the `make` targets that run the administrative entry and deploy `nats-authority.conf`.
- **G3 item 26:** 26a implements the installation CA, the server certificates, and TLS for the API and the broker (section 7); 26b pins the authority at enrollment (sections 5, 7, and 10); 26c delivers rotated generations, and 26d binds the private network for a remote worker.
- **G6:** restore quarantine and the epoch increment, and the verification of the provisional values.

## 10. Worker side

Change `implement-worker-runtime-bootstrap` (G2 item 20a) implements the worker's part in `apps/worker`, `@taskelith/worker-journal`, and `@taskelith/worker-control-plane-client`. The coordinator's decisions Q2, Q3, and Q5 of 2026-10-25 set it.

- **First start.** A worker whose root holds no identity enrolls only when its configuration names a token in `TASKELITH_ENROLLMENT_TOKEN`; otherwise it fails with reason `not-enrolled` and creates nothing. It also needs the bundle's fingerprint in `TASKELITH_INSTALLATION_CA_SHA256`, which may be written in lowercase or uppercase and with or without the colons that `openssl x509 -fingerprint -sha256` prints; without it the start fails with `invalid`, naming the variable, before any request. `TASKELITH_CONTROL_PLANE_URL` must be an `https:` URL. A later start never redeems the token. The published `taskelith` CLI has no enrollment command.
- **Order.** The worker first claims the root: every local check of the data root and its volume, the creation of an empty `worker/`, and the root lock. An existing `worker/` fails with `conflict`, so a token is never spent on a root that cannot be created. Then it reads the authority's certificate through `readInstallationCa`, over TLS that does not verify the server yet, and sends the token only when the answer is one CA certificate whose SHA-256 equals the fingerprint; otherwise it fails with `precondition-failed` and reason `installation-ca-mismatch`, and no request carries the token. Then it draws a new 128-bit `journalId` and calls `enrollWorker` over TLS pinned to the checked certificate. Only then does it create the journal, the credential files, `worker/installation-ca.pem`, and `worker/identity`. A refused or failed call, or a failure after it, removes `worker/`; a data root directory the claim created stays, empty.
- **Spent token.** An `unavailable` answer may come after the control plane used the token, and a crash or a local failure between the answer and `worker/identity` leaves the enrolled row without a root. A retry with the token then fails with `token-invalid`. The operator issues a new token and revokes the row, which never connects. A crash can also leave a `worker/` without an identity; every later start then fails with `conflict`, and the operator removes that `worker/` before enrolling again.
- **Files.** `worker/credentials/` has mode `0700`. It holds `control-plane.<generation>` and `broker.<generation>.creds`, each of mode `0600` and created once by the durable file rule of the [worker journal](worker-journal.md) section 4. `worker/identity` records `credentialGeneration` and the references `credentials.controlPlane` and `credentials.broker`, relative to `worker/`. A reference outside `worker/credentials/`, a missing or empty file, or an unsafe path fails startup.
- **Pin.** `worker/installation-ca.pem` holds the checked certificate, mode `0600`, created once by the durable file rule before `worker/identity`. Every later start reads it under the control-record path checks, and a missing or empty file fails with reason `corrupt` before any request or connection. Every HTTPS call of the worker to the control plane uses an `undici` `Agent` whose only CA is the pin.
- **Broker.** The worker connects with `connectWorkerTransport`, the stored `.creds` text, the configured broker URL, TLS whose only CA is the pin, and its own inbox prefix. It opens no listening socket.
- **Not yet.** Storing a rotated generation on the worker belongs to G3 item 26 (section 6). The use of the control-plane secret for launch authorization comes in item 20c.
