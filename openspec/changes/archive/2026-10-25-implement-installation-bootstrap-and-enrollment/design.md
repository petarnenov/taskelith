## Context

Trust model sections 2 to 5, the storage contract, the worker journal's identity rules, and the execution wire contracts' `enrollWorker` with its three bearer schemes bind this item. The owner decided D9 (a) and D10 (a) earlier, and O1 to O4 on 2026-10-25 for this item. The coordinator decided C5 to C10 on the same day.

## Goals / Non-Goals

**Goals:**
- explicit, crash-safe initialization;
- an audited operator reset;
- single-use enrollment with the contract's failure reasons;
- generations, rotation, and revocation of both credentials;
- per-worker broker permissions with revocation without a server reload;
- the namespace rules;
- TLS plumbing;
- scrubbing.

**Non-Goals:**
- the HTTP API (item 16);
- launch authority (item 17);
- the worker runtime's storage of its credentials (item 20);
- reconciliation of a revoked worker's attempts (item 21);
- logs (item 22);
- `make` targets and deployment (item 23);
- the installation CA (G3 item 26);
- restore quarantine (G6).

## Decisions

- **Owner decisions.**
  - O1 (b): `@nats-io/nkeys@2.0.3` directly, with an encoder of this repository for the three JWT kinds. It is an owner-approved exception to ADR 0004's established-OSS principle. Integration tests against nats-server 2.15.1 prove that the server accepts the JWTs and that revocation works.
  - O2 (a): operator mode with the `full` resolver and a system account, and revocation through `$SYS.REQ.CLAIMS.UPDATE`.
  - O3 (c): TLS plumbing and a test CA.
  - O4: token TTL `15 min`, grace window `10 min`, provisional.
- **Coordinator decisions.**
  - C5: the record in `dataRoot/control-plane/installation`, a copy in the table, and a fail-closed start on a mismatch.
  - C6: the neutral `@taskelith/data-root`.
  - C7: the `fleet` and `access` modules, with administrative entries only in `apps/control-plane`.
  - C8: tokens and secrets as below.
  - C9: revocation as below, and the quarantine wiring in item 16.
  - C10: the operator-mode Compose NATS with creds from `services.sh`.
- **Ports and purity.** The modules import no Node API. Random secrets, hashing, and identifiers are behind the `Secrets` and `IdentifierSource` ports, which `@taskelith/secrets` implements with `node:crypto`. The broker is behind `BrokerCredentials`.
- **Initialization order.** The record outside the database comes first, then the table copy, then the operator credential. A rerun completes the same identity. A table copy without a record means that the record was lost or the database came from elsewhere, so it fails closed. The administrative `init` creates the broker authority before the identity and keeps an existing one, which also lets a test preset the authority that the running test server trusts.
- **Secrets.** A secret is 256 random bits, prefixed by kind (`tkop_`, `tken_`, `tkwk_`) so that it can be recognized and scrubbed. Only its SHA-256 is stored, and comparison is in constant time. A slow hash would protect only low-entropy secrets, which none of these is. A token is looked up by its hash.
- **Enrollment.**
  - Its checks run in the contract's order.
  - The broker user is issued before the registry write. A user issued for an enrollment that then fails is never handed out, and its seed is discarded, so it grants nothing.
  - One transaction uses the token and adds the worker.
  - The worker row starts unreachable, so placement waits for its first contact.
- **Generations.** One number covers the control-plane secret and the broker user.
  - Rotation keeps one predecessor until the end of the grace window.
  - `expireGraceWindows` revokes and drops the expired predecessors, and a second rotation drops the older one at once.
  - An expired predecessor's control-plane secret is refused even before that sweep, because authentication checks the window itself.
- **Broker trust.** One operator, a system account, and one account per installation, which holds the streams and every user.
  - The control plane's users have no subject limits.
  - A worker's user has the subjects of execution wire contracts section 2 and no other JetStream API. So a worker connects through `connectWorkerTransport`, without the JetStream manager.
  - The system account's user may only update and look up claims.
  - Revocations are durable records of the registry, written in the transaction that stops a user's validity: a revocation, a rotation that drops a predecessor, or the end of a grace window. A publication sends the complete list, so it never depends on reading and merging the server's JWT.
  - Publishers take turns under a PostgreSQL advisory lock held across the push, so concurrent commands, in one process or several, cannot lose an update. An entry is marked published only after the broker accepted a list that contained it, so a failed push is retried by the next publication.
  - The publication runs in its own READ COMMITTED transaction, which `PostgresDatabase.transaction` now offers beside SERIALIZABLE. A SERIALIZABLE snapshot is taken by the first statement, before the lock is granted, so a publisher that waited would read a stale list (pass-3 finding 1). Under READ COMMITTED the read after the lock sees every committed entry, and the update marks only the entries it read.
  - A revocation's time is at least its user JWT's `iat`, which the generation records (`brokerIssuedAt`), because NATS voids only JWTs issued up to that time. A revocation timed before a racing rotation's JWT would otherwise leave that user valid.
  - A rotation's publication failure does not undo the committed rotation. The new secrets come back with `revocationsPublished: false`, and the entry stays recorded for the next publication.
- **The JWT encoder.** Header `{"typ":"JWT","alg":"ed25519-nkey"}`, claims with `jti`, `iat`, `iss`, `name`, `sub`, and `nats` (version 2), signed by the issuer's NKey over base64url, as nats-server verifies. `jti` is base32 of the SHA-512/256 of the claims, as the Go library derives it.
- **Namespace.** It mirrors the worker root: no symbolic links, owner checks, no Git checkout, durable create-once documents with `format: 1`, and refusal of another format. Because the subtree holds signing seeds, `control-plane/` and its files must give group and others no access, not only no write access.
- **Initialization and the broker trust.** `init` reads the installation record before it touches the broker trust. A new installation gets a new authority, or keeps one already present. An existing installation keeps its authority and server fragment, and one that lost its authority fails closed.
- **TLS.** An optional CA (and client certificate) on every connection. Without one, the connection is explicitly plain, because nats.js otherwise upgrades to TLS where the server offers it. The test server allows plain clients for the Toxiproxy route.
- **Test services.** `services.sh` writes the test trust before compose up and keeps it while the project runs, because the server loaded it at start. `down` removes it. The trust lives outside the checkout in `$TMPDIR/taskelith-services/<project>`. `scripts/integration-broker.ts` imports only the encoder file, which needs no build.
- **Quarantine (C9).** Item 16 wires `InstallationGuard` into the outbox publisher at its composition root, so that restore quarantine stops command publication. Item 13 writes the installation row, not quarantined, at initialization.

## Risks / Trade-offs

- **Seeds on disk.** The operator, system account, and installation account seeds are in one `0600` file of the control-plane namespace. Whoever reads it can issue users. Separating the operator key, and signing keys, are G3/G6 hardening.
- **Revocations grow.** The account JWT and `broker_revocations` keep every revoked user key. Pruning the revocations of users whose JWTs can no longer be used is left to G6.
- **A rebuilt broker.** A broker whose resolver directory is lost starts from the preloaded account JWT without revocations. Republishing the list then needs a new unpublished entry or a forced publication, which G6's restore procedure adds.
- **Expiry at the moment of use.** The token's expiry is compared with `clock_timestamp()` after the row lock, since `now()` is the transaction's start and a use may wait for the lock.
- **Test isolation of accounts.** A published revocation list replaces the account's, so each test file that publishes one creates an account of its own with the test operator, and registers it by publishing an empty list.
- **A lock across a network call.** The advisory lock is held while the publication waits for the broker, at most its 5-second timeout. Administrative commands are rare, so this does not contend.
- **Credentials on the worker.** This item defines the content of both credentials. Their storage under `worker/` is item 20's.
- **Mixed TLS.** `allow_non_tls` on the test server is test infrastructure only. A production server configuration that requires TLS is item 23's and G3's.
