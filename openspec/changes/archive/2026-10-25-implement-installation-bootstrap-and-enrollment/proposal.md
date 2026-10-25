## Why

G2 work item 13 ([docs/g2-plan.md](../../../docs/g2-plan.md)) serves "enrollment and authorization boundaries", trust contract sections 2 to 4, and R09. Trust model sections 2 to 5 require:
- explicit installation initialization, with `installationId` and `recoveryEpoch = 1` in a record outside the database, and a one-time operator bootstrap credential;
- an audited operator credential reset by direct administrative invocation;
- single-use enrollment tokens that mint a `workerId` and per-worker credentials with generations, rotation, and revocation;
- broker permissions limited to the worker's own subjects;
- TLS;
- secret scrubbing.

The execution wire contracts (item 8) leave the credential content to this item. Item 12 leaves it the replacement of the spike's broker users and `no_auth_user`, the `installationId` source, and TLS. Before this change no product code initialized an installation or authenticated anyone.

## What Changes

- **`@taskelith/data-root`** (new): the data-root, control-path, and durable-file helpers move here from the worker-only `@taskelith/worker-journal`, which re-exports them unchanged (coordinator decision C6).
- **`@taskelith/access`** (new module): the operator credential with its append-only audit trail; the bootstrap, reset, and authentication service; the `Secrets` port.
- **`@taskelith/fleet`** (new module):
  - the installation identity, its record and table ports, and `InstallationService`, which initializes explicitly and fails closed on a mismatch at start;
  - enrollment tokens with host constraints;
  - `EnrollmentService`: enrollment with the 401, 409, and 422 reasons of `enrollWorker`, rotation with a grace window, revocation, and worker authentication;
  - the `BrokerCredentials` and `IdentifierSource` ports;
  - in-memory adapters and shared conformance suites.
- **`@taskelith/secrets`** (new): 256-bit prefixed bearer secrets stored as SHA-256 and compared in constant time; random identifiers; redaction of secrets in text and failures, and scrubbing of a child environment.
- **`@taskelith/control-plane-store`** (new): the `control-plane/` namespace (`0700`/`0600`, no links, outside a checkout, versioned documents) and the installation record.
- **`@taskelith/postgres`:** a migration adds:
  - the identity copy;
  - `operator_credentials`, and `audit_events` with an immutability trigger;
  - `enrollment_tokens`;
  - the enrollment columns of `workers`.

  It also adds the repositories with their committing facades.
- **`@taskelith/nats`:**
  - the claims encoder for operator, account, and user JWTs (owner exception O1 (b));
  - `BrokerAuthority`;
  - `NatsBrokerCredentials`, with per-worker permissions and revocation through `$SYS.REQ.CLAIMS.UPDATE` (O2 (a));
  - `.creds` authentication and optional TLS in the connections;
  - a worker connection without the JetStream manager, and a system account connection.
- **`apps/control-plane`:** the administrative entry (`init`, `reset-operator-credential`, `issue-enrollment-token`, `rotate-worker`, `revoke-worker`, `expire-grace-windows`) with redacted failures, and no public CLI command.
- **Test services:** NATS runs in operator mode with TLS from a test CA (O3 (c), C10).
  - `scripts/services.sh` writes the test authority and users through `scripts/integration-broker.ts`, and makes the CA with the openssl of the pinned PostgreSQL image.
  - The spike users keep their permissions as JWT users.
  - `@taskelith/testing` gains `integrationSecret`.
- **Documents:**
  - [installation and enrollment contract](../../../docs/contracts/installation-and-enrollment.md);
  - a provisional row in the operational targets (O4);
  - the `@nats-io/nkeys` row in the dependency register;
  - a pointer in the storage contract.

## Capabilities

### New Capabilities
- `installation-enrollment`: installation initialization, the operator credential, enrollment, worker credentials and their broker permissions, the control-plane namespace, TLS plumbing, and secret scrubbing.

### Modified Capabilities

## Impact

The published `taskelith` package and CLI are unchanged.

- New private packages: `@taskelith/data-root`, `@taskelith/access`, `@taskelith/fleet`, `@taskelith/secrets`, and `@taskelith/control-plane-store`.
- `@nats-io/nkeys@2.0.3`, already in the tree, becomes a direct runtime dependency of `@taskelith/nats` (owner decision O1 (b)). No new package enters the lockfile. The dependency inventory is regenerated.
- `connectTransport` now requires credentials, and returns the JetStream manager only for the control plane.
- The shared NATS test service no longer has unauthenticated users.
