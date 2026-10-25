# Installation and enrollment contract

Status: G2 item 13 (`implement-installation-bootstrap-and-enrollment`), 2026-10-25. This page states the rules of trust model sections 2 to 5 that item 13 implements, and the content of the credentials that the [execution wire contracts](execution-wire-contracts.md) leave to it. The modules are `@taskelith/access` and `@taskelith/fleet`. The adapters are `@taskelith/postgres`, `@taskelith/nats`, `@taskelith/control-plane-store`, and `@taskelith/secrets`. The administrative entry is `apps/control-plane/src/admin/admin-main.ts`.

## 1. Decisions

| Decision | Outcome | By |
| --- | --- | --- |
| D9 (a) | NATS decentralized authentication: an operator, a system account, and one account per installation; per-worker user JWTs with NKeys issued at enrollment; revocation through the account | Owner, 2026-10-25 |
| D10 (a) | Only the installation-owner bootstrap credential, as a hashed opaque token | Owner, 2026-10-25 |
| O1 (b) | `@nats-io/nkeys@2.0.3` as a direct dependency, with a claims encoder of this repository for operator, account, and user JWTs: an owner-approved exception to the "established OSS" principle of ADR 0004 | Owner, 2026-10-25 |
| O2 (a) | Operator mode with the `full` resolver and a system account; revocations are pushed through `$SYS.REQ.CLAIMS.UPDATE`, without a server reload | Owner, 2026-10-25 |
| O3 (c) | TLS plumbing only: the client trusts the CA configured on it; tests use a test CA; the installation CA and its issuance at bootstrap are G3 item 26 | Owner, 2026-10-25 |
| O4 | Provisional enrollment token TTL `15 min` and rotation grace window `10 min` (operational targets), verified in G6 | Owner, 2026-10-25 |
| C5 to C10 | The record outside the database, the neutral data-root package, the module placement, tokens and secrets, revocation and quarantine wiring, and the operator-mode test services, as below | Coordinator, 2026-10-25 |

## 2. Installation initialization

- **Explicit only.** Only the administrative command `init` initializes an installation. It needs a direct invocation on the control-plane host, with an actor and a reason. No start of a worker, CLI, or service initializes anything.
- **Order.** `init` applies the migrations, then creates or keeps the broker authority, then does the following:
  1. It writes `control-plane/installation` (`{format: 1, installationId, recoveryEpoch: 1}`) outside the database.
  2. It writes the copy in the `installation` table, not quarantined.
  3. It issues the bootstrap credential. The credential is printed once and only its hash is stored.

  A rerun after a crash completes the same identity. A rerun after success fails with `conflict`. A table copy without its record fails with `precondition-failed`.
- **Start check.** A command or service that needs the installation reads both records. They must exist and be equal. A mismatch, as after a database restore, fails closed with `precondition-failed` until G6's restore procedure. Item 13 never changes `recoveryEpoch`.
- **Identifiers.** `installationId` is 32 hexadecimal characters and `workerId` is `w` followed by 32 hexadecimal characters, both from 128 random bits. Every identifier of this contract is 1-64 letters, digits, `_`, or `-`, because it becomes a NATS subject token and stream name.

## 3. The `control-plane/` namespace

- `dataRoot` resolves as in the [storage contract](../storage.md): explicit configuration, then `TASKELITH_DATA_DIR`, then the OS default.
- `dataRoot` and `dataRoot/control-plane` are directories of mode `0700` owned by the running account. No component from `dataRoot` down may be a symbolic link, owned by another account, or writable by group or others. A data root inside a Git working tree is refused. A colocated worker keeps its own `worker/` subtree.
- Every file is mode `0600` and written by the durable file rule of the [worker journal](worker-journal.md) section 4. A document carries `format: 1`, and another format is refused.

| File | Content | Written |
| --- | --- | --- |
| `installation` | `installationId`, `recoveryEpoch` | Once, at `init` |
| `broker-authority` | The operator, system account, and installation account seeds (`BrokerAuthorityKeys`) | Once, at `init` |
| `nats-authority.conf` | The nats-server trust fragment: `operator`, `system_account`, the `full` resolver, and its preload of both accounts | At `init`, for the operator to include in the server configuration (item 23) |

## 4. The operator credential

- The bootstrap credential and every reset are `tkop_` followed by 256 random bits in base64url. Only the SHA-256 hash is stored, and comparison is in constant time. Its high entropy makes a slow hash unnecessary.
- `reset-operator-credential` replaces the credential with the next generation. It needs a direct invocation on the host with an actor and a reason, and writes an immutable row of `audit_events`; a trigger refuses updates and deletions. It never lifts a quarantine.
- `issue-enrollment-token`, `rotate-worker`, `revoke-worker`, and `expire-grace-windows` read the operator credential from `TASKELITH_OPERATOR_TOKEN`, never from the command line.

## 5. Enrollment

- **Token.** `tken_` followed by 256 random bits, stored as its SHA-256. It is single-use, valid for the enrollment token TTL, and optionally bound to `platform`, `architecture`, and `hostname`.
- **Checks, in order:**
  1. An unknown, used, or expired token is `forbidden` with reason `token-invalid` (401 of `enrollWorker`).
  2. A host that the constraints do not allow is `precondition-failed` with reason `host-mismatch` (422).
  3. A worker whose protocol window shares no version with the server's is `precondition-failed` with reason `protocol-not-supported` (422).
  4. A journal that is already enrolled is `conflict` with reason `journal-enrolled` (409).
- **Atomicity.** One transaction uses the token and adds the worker, so concurrent redemptions have one winner.
- **Placement.** The new `workers` row is enrolled, not revoked, not draining, and not reachable until its first contact (item 21), with the declared capacity.
- **Response.** `credentialGeneration` 1, the installation's `recoveryEpoch`, the server's protocol window, and the two credentials of section 6.

## 6. Credentials

- **`credentials.controlPlane`:** `tkwk_` followed by 256 random bits, the bearer secret of the `workerCredential` scheme. Only its hash is stored, per generation.
- **`credentials.broker`:** the text of a NATS `.creds` file. It holds a user JWT signed by the installation account, and the user's NKey seed. The user may:
  - publish `$JS.API.CONSUMER.INFO.<commands stream>.<workerId>`, `$JS.API.CONSUMER.MSG.NEXT.<commands stream>.<workerId>`, `$JS.ACK.<commands stream>.<workerId>.>`, and its own observation subject;
  - subscribe to `_INBOX.<installationId>.<workerId>.>`.

  It has no other JetStream API, so a worker connects with `connectWorkerTransport`, and only the control plane manages streams. The broker URL and CA are configured on the worker.
- **Generations.** Both credentials share one generation number.
  - `rotate-worker` issues the next generation. The previous one stays valid for the grace window.
  - `expire-grace-windows`, which the control plane runs periodically, revokes the previous broker user and drops the previous generation after the window. A further rotation drops an older predecessor at once.
  - Authentication returns the generation a secret belongs to. An unknown, revoked, or expired one is `forbidden` with reason `worker-not-authorized`.
- **Revocation.** `revoke-worker` marks the worker revoked in the same row placement reads, and revokes every broker user of the worker. The server disconnects such a user at once and refuses it afterwards.
  - Each revocation reads the account JWT the server holds and adds to its revocations, one at a time per process.
  - The active attempts of a revoked worker become uncertain through reconciliation (item 21), never dead.
- **Workers get no database credential.** The control plane connects to NATS as a user of the installation account without subject limits.

## 7. TLS

`connectTransport`, `connectWorkerTransport`, and `connectSystemAccount` take an optional `tls` with the CA in PEM and an optional client certificate. Without one, the connection stays plain even where the server offers TLS. The administrative entry reads the CA from `TASKELITH_NATS_CA`. The test services give NATS a certificate from a test CA, made by the openssl of the pinned PostgreSQL image, and allow plain clients for the Toxiproxy route. The installation authority, certificate issuance, and TLS for the HTTP API and PostgreSQL are G3 item 26.

## 8. Secret scrubbing

`@taskelith/secrets` redacts this installation's bearer secrets (by their `tkop_`, `tken_`, `tkwk_` prefixes), NKey seeds, NATS JWTs, and whole `.creds` blocks.
- The administrative entry redacts every failure before printing it.
- `scrubEnvironment` drops every variable named like a secret, or holding one, from a child process's environment.
- Failures name settings and identifiers, never secret values.
- Logs are item 22's, which uses the same helpers.

## 9. Left to other items

- **Item 16:** the HTTP operations (`enrollWorker` and the operator and worker credential checks); the wiring of `InstallationGuard` into the outbox publisher, which stops command publication under restore quarantine; the periodic `expire-grace-windows`.
- **Item 20:** the worker's storage of its credentials under `worker/` with the identity's credential generation, and the use of `connectWorkerTransport` with them.
- **Item 21:** the uncertain ownership of a revoked worker's attempts.
- **Item 23:** the `make` targets that run the administrative entry and deploy `nats-authority.conf`.
- **G3 item 26:** the installation CA and TLS for every endpoint.
- **G6:** restore quarantine and the epoch increment, and the verification of the provisional values.
