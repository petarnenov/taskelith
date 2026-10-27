# Verification

Date: 2026-10-28. The author's self-check and checks are recorded below. The review passes are pending.

## Scope and source

G3 sub-change 26a of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26), under owner decision D11 (b). The worker Maki assigned it, and it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/issue-installation-certificates` on branch `issue-installation-certificates`. Decisions 1, 2, 3, and 5 of `design.md` come from away run `20261027T221048Z-claude-63826` and are pending owner review.

- **Base revision:** `46e21ef1` (`origin/dev`, merge of pull request #373).
- **Revision verified:** `72cfabf4`, with this record and the ticked tasks uncommitted: the contract and spec deltas (`3edf9fbb`), the private key check (`823d1ce3`), the redaction (`2c0e4c90`), the issuer and its qualification (`d7778c8f`), the authority and the HTTPS listeners (`97f4e357`), the installation TLS (`2cb22f3a`), and the re-issue step of `make verify-installation` (`72cfabf4`).
- **Scope:** the installation CA at `init`; API and NATS server certificates and `issue-installation-certificates`; the `CertificateIssuer` port and the `@taskelith/certificates` adapter on `@peculiar/x509@2.2.0`; the worker API and browser endpoint over HTTPS from TLS 1.2; TLS on the installation's NATS with the CA as the default broker trust; redaction of PEM private keys; the refusal of tracked private keys.
- **Out of scope:** worker CA pinning and fingerprint enrollment (26b), rotation delivery (26c), the private-network bind and its acceptance (26d), CA rollover (G6), and TLS for PostgreSQL.

## Environment

macOS 26.6.2 arm64, Node.js 24.22.1 from `.nvmrc`, Docker Engine 29.6.1; the integration services of `make services-up` for the integration tests.

## Author self-check

- **Contract first.** `3edf9fbb` holds the proposal, design, the five spec deltas, the installation contract sections 1, 2, 3, 7, 8, and 9, and the G3 plan's deferral row, before any code commit.
- **Spec deltas.** `installation-enrollment`: "TLS plumbing" renamed to and modified as "Installation certificate authority"; "Secret scrubbing" modified; "Installation server certificates" added. `control-plane-api`: "TLS listeners" added. `nats-transport`: "Installation broker TLS" added. `local-installation`: "TLS of the local installation" added. `execution-observability`: "Logs without secrets" modified.
- **Architecture.** The port and the validity rules are in `@taskelith/fleet`; the domain file imports no port. The library is used only in the private `@taskelith/certificates` package. The published `taskelith` package gains only the `verify:private-keys` script.
- **Secrets.** No key or certificate is tracked: `npm run verify:private-keys` passes. Every test generates its keys and certificates at run time in temporary directories. A refusal names the setting or path and never quotes PEM text; tests assert this. The logs of `make verify-installation` and `make installation-smoke` hold no `PRIVATE KEY` line.
- **Comments.** New and changed comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- **Commit types.** `docs`, `build`, and `chore`; only private packages, tooling, infrastructure, and documents change.

## Checks and results

- `npm run openspec -- validate issue-installation-certificates --strict`: valid.
- `make verify` on the working tree before the commits (the content of `2cb22f3a`): exit 0; 2367 tests, 2364 pass, 0 fail, 3 skipped; coverage lines 99.34%, branches 92.29%, functions 99.04%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed; the dependency inventory, the packed file allowlist, and the installed CLI checks passed. `72cfabf4` changed only the `verify` step of `scripts/installation.sh`; `test/installation-script.test.ts` and `test/installation-scenarios.test.ts` pass on it, 60 tests.
- New files' coverage: `x509-certificate-issuer` 100% lines and branches; `installation-authority` 100% lines, 79.07% branches; `server-tls` 94.29% lines (the catch of `createSecureContext`); `server-hosts`, `broker-tls`, `installation-certificates`, and `redaction-rules` 100%.
- `make verify-installation` (Docker) at `72cfabf4`: exit 0, "built, bootstrapped, started, enrolled, certificates re-issued, restarted, removed".
- `make installation-smoke` (Docker) at `72cfabf4`: exit 0, the run ended with exit code 0 over HTTPS and TLS NATS, "submitted, assigned, executed, stored the result, removed".
- `npm audit --omit=dev`: 0 vulnerabilities. `npm run verify:dependencies`: 766 package paths verified.

## Fails before the change

The new tests ran against the sources of `46e21ef1`, restored over the committed tree and rebuilt, then the tree was restored to `HEAD`:

- Redaction, scrubbing, the namespace, the private key check, and the composition: `logger.test.ts`, `secrets.test.ts`, `control-plane-store.test.ts`, `test/check-private-keys.test.ts`, `test/installation-composition.test.ts`, 52 tests, 6 fail: "PEM private keys of every type are redacted, whole or cut, and certificates stay", "a child environment drops TLS key files and PEM keys, and keeps the CA", "a text file is read back only while it is owner-only", "host ports are published on localhost only", "the broker requires TLS and the worker trusts the installation CA read-only", and the private key check file, whose script did not exist.
- Control plane: `installation-tls.test.ts` and `control-plane-settings.test.ts` fail to load, as the base exports neither the listener settings nor the host rules. `administration.integration.test.ts` and `control-plane-api.integration.test.ts`: 8 tests, 4 fail, among them "server certificates are issued again by the kept authority, which fails closed when lost" and "an unreadable broker CA fails and names its setting"; the API file fails to load.
- The `@taskelith/fleet` and `@taskelith/certificates` tests test new modules that did not exist at the base.

## Review passes

Pending. Each pass adds its section here and a line in `passes.jsonl`.

## Limitations

- The design's Risks and limitations apply: installations initialized before this change fail closed without an authority; `NODE_EXTRA_CA_CERTS` adds the CA to the system roots until 26b pins it; the composition's browser endpoint serves the installation certificate; `issue-installation-certificates` writes no audit row.
- The checks ran on macOS arm64 only; the Linux suites of `make verify-linux-cgroup` and the G2 failure scenarios on the composition were not run.

## Remaining gates

- Independent review passes under the [review process](/docs/governance.md#independent-review-process), and their fixes.
- Owner review of decisions 1, 2, 3, and 5 of the away run.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
