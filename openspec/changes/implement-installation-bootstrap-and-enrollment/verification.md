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

`make verify` ran in the worktree before pass 1 and after each round of fixes:

- At `c513957`, before pass 1, with every file tracked: 819 tests passed, 0 failed; coverage 99.18% lines, 92.33% branches, 99.07% functions. The comment, boundary, coverage-scope, dependency-inventory, OpenSpec (50 of 50), and package checks pass.
- At `c46cb1a`, after the pass-1 fixes: 831 tests passed, 0 failed; coverage 99.18% lines, 92.58% branches, 99.09% functions; every other check passes.
- At `40f2aea`, after the pass-2 fixes: 835 tests passed, 0 failed; coverage 99.18% lines, 92.54% branches, 99.09% functions; every other check passes.
- `npm run openspec -- validate implement-installation-bootstrap-and-enrollment --strict` passed at each of these revisions.

## Independent review

Assigned reviewer: Codex CLI, with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree.
- The prompt named AGENTS.md, ADR 0004, the governance review process, plan row 13 with D9 and D10, the trust model, the storage contract, the execution wire contracts with `enrollWorker`, the worker journal, the launch authorization contract, the JetStream spike, and the owner's and coordinator's decisions.
- The prompt and log are kept outside the worktree.

- **Pass 1 — session `01a172f0-affe-7070-9ea1-b73891f2fedb`,** reviewed `git diff 5878679 19ab8bd`. The header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `02056eb7…e816`, equal. The reviewer ran the unit tests, the comment check, and `git diff --check`, and judged the integration tests by reading; it confirmed several races with controlled fakes. Findings: 0 Critical, 4 High, 6 Medium, 0 Low, all resolved at `c46cb1a`:
  1. High: `revoke` read the keys before its transaction, and `replaceCredentials` did not refuse a revoked worker, so a rotation racing a revocation could leave a valid broker user. The registry's `rotate` now refuses a revoked worker inside its transaction, and `revoke` collects the keys under the row lock. A test rotates a revoked worker and expects `worker-not-authorized`.
  2. High: a failed or interrupted broker revocation lost the key, because the registry had already dropped it. Every broker user to revoke is now recorded in `broker_revocations` in the same transaction, and kept until a publication succeeds. A unit test and the conformance suite fail a push and see the next one publish it.
  3. High: revocations were serialized per object only, so two instances could lose one. Publication now sends the complete recorded list under a PostgreSQL advisory lock, and no longer reads and merges the server's JWT. The conformance suite checks that publishers never overlap and that each push is the complete list.
  4. High: the namespace accepted a readable `control-plane/` and a `0644` seed file. `control-plane/` and its files must now give group and others no access, and a test refuses `0755` and `0644`.
  5. Medium: token expiry was checked before the atomic use. The use now checks expiry at its own moment (the database's `now()`) and returns `token-expired`, which maps to `token-invalid`; the conformance suite covers it.
  6. Medium: usage errors printed a mistyped secret. They are now redacted, and a test passes a real-format secret.
  7. Medium: exceptions escaped the administrative boundary. Every exception now becomes a redacted `internal` failure with status 1; a test uses a missing CA file.
  8. Medium: a failed rerun of `init` could replace the broker trust. `init` now reads the installation record first, keeps the authority and server fragment of an existing installation, and fails closed when an existing installation lost its authority; the end-to-end test covers it.
  9. Medium: an invalid Compose project name could steer `rm -rf` outside the secrets directory. `services.sh` now accepts only lowercase letters, digits, `_`, and `-`, starting with a letter or digit.
  10. Medium: the test certificates expired after two days. They are now valid for ten years, as test infrastructure only.

- **Pass 2 — session `01a172ff-7358-7b12-bdd0-ca2516f1c641`,** reviewed `git diff 19ab8bd 432ff89` for the resolutions, then `git diff 5878679 432ff89` as a whole. The header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `7efff574…6edb`, equal. The reviewer confirmed pass-1 findings 2, 3, and 4, and 6 to 10, fully resolved, and findings 1 and 5 in part; the gaps are findings 1 and 3 below. Findings: 0 Critical, 2 High, 3 Medium, 0 Low, all resolved at `40f2aea`:
  1. High: a revocation timed before a racing rotation's JWT left the new user valid, since NATS voids only JWTs issued up to the revocation time. A generation now records its JWT's issue time (`brokerIssuedAt`), and a revocation is never earlier than it. A conformance case revokes a generation issued after the revocation time.
  2. High: a rotation reported success after a failed publication of its dropped predecessor. It now returns its committed secrets with `revocationsPublished: false`. The administrative entry prints them with a retry hint and exits with status 1, and the entry stays recorded; a unit test covers it.
  3. Medium: PostgreSQL's `now()` is the transaction's start, so a use waiting for the token's row lock could pass an expired token. The use now compares with `clock_timestamp()` after the lock. A PostgreSQL test holds the row past the expiry.
  4. Medium: two test files published revocation lists for the same account, and a list replaces the account's, so one could undo the other. Each such file now creates and registers an account of its own with the test operator.
  5. Medium: a default data root on a fresh account lacked its parents. The namespace now creates each missing parent owner-only; a test opens `home/.local/share/taskelith` under an empty directory.

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
