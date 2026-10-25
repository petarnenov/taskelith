# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 13, assigned by the coordinating session (Niki) to the worker session Pepi, with Codex `gpt-6.1-sol` (medium) as the reviewer by rotation. Base revision: `5878679` on `dev`, with items 8, 11, and 12 merged and archived. Scope: the row of item 13. Out of scope: the HTTP API (item 16) and launch authority (item 17).

Decisions:
- **The owner's own decisions**, relayed by the coordinator on 2026-10-25: O1 (b), O2 (a), O3 (c), and O4.
- **The coordinator's decisions** of the same day: C5 to C10.

The design records each one.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker. The services are nats 2.15.1 (operator mode, TLS from a test CA), PostgreSQL 18.6, and Toxiproxy 2.13.0 of `infra/services/compose.yaml`.
- Evidence check: the change adds only repository-relative links, apart from the upstream source link of the new dependency register row.
- Dependencies: `@nats-io/nkeys@2.0.3` and its dependency `tweetnacl@1.0.3` were already in the lockfile through nats.js 3.4.0. No package enters the lockfile. The test CA uses the openssl of the already pinned PostgreSQL image; no image is added.
- A probe before the build: a server in operator mode accepted the encoder's JWTs, enforced a user's permissions, and disconnected and refused a user revoked through `$SYS.REQ.CLAIMS.UPDATE` without a reload. The integration tests now cover the same.

## Author self-check

Recorded before pass 1.

- **The plan row, topic by topic:**
  - explicit initialization with the record outside the database and the bootstrap credential;
  - the audited reset by direct invocation;
  - single-use tokens, `workerId`, generations, rotation, and revocation;
  - per-worker broker credentials and permissions;
  - TLS plumbing (O3 (c));
  - the `control-plane/` namespace rules;
  - secret scrubbing.

  Restore quarantine stays in G6.
- **Against the trust model:**
  - section 2: initialization is explicit only, and a mismatch fails closed;
  - section 3: only the installation-owner credential exists;
  - section 4: tokens are short-lived, single-use, and constrained; workers get no database credential; one worker cannot read another's commands or publish under its identity; a generation has a grace window; revocation is immediate;
  - section 5: failures and child environments are scrubbed.
- **Against the item 8 contract:**
  - the `enrollWorker` failures map to 401, 409, and 422 by their reasons;
  - the response carries both credentials with the generation, the epoch, and the window;
  - the window check runs at enrollment.
- **Against item 12's obligations:**
  - the connection setting `installationId` now comes from the initialized installation;
  - the spike's static users and `no_auth_user` are replaced by JWT users with the same permissions;
  - TLS options exist.
- **Against ADR 0004:**
  - hexagonal: pure modules with ports; adapters for crypto, PostgreSQL, NATS, and the filesystem;
  - Docker: integration tests against the Compose services in `make verify`;
  - coverage: see the checks;
  - the encoder is the owner-approved exception O1 (b).
- **Obligations for later items:**
  - item 16: the HTTP operations; the `InstallationGuard` in the outbox publisher, which stops command publication under restore quarantine (my decision as the worker, which the brief left to me; coordinator decision C9 confirms it); the periodic `expire-grace-windows`;
  - item 20: the worker's storage of its credentials under `worker/`;
  - item 21: a revoked worker's attempts;
  - item 23: the `make` targets and the deployment of `nats-authority.conf`;
  - G3 item 26: the installation CA;
  - G6: restore quarantine and the verification of the provisional values.
- **Open points:** see the design's risks:
  - the seeds in one file;
  - revocations serialized per process only;
  - growing revocations;
  - the credentials' storage on the worker;
  - mixed TLS on the test server.

## Checks

`make verify` ran in the worktree before pass 1:

- At `c513957`, before pass 1, with every file tracked: 819 tests passed, 0 failed; coverage 99.18% lines, 92.33% branches, 99.07% functions. The comment, boundary, coverage-scope, dependency-inventory, OpenSpec (50 of 50), and package checks pass.
- `npm run openspec -- validate implement-installation-bootstrap-and-enrollment --strict` passed.

## Independent review

(to be recorded)

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
