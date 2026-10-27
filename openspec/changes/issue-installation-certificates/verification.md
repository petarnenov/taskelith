# Verification

Date: 2026-10-28. The author's self-check and checks are recorded below, with review pass 1 and its fixes. Review pass 2 is pending.

## Scope and source

G3 sub-change 26a of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26), under owner decision D11 (b). The worker Maki assigned it, and it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/issue-installation-certificates` on branch `issue-installation-certificates`. Decisions 1, 2, 3, and 5 of `design.md` come from away run `20261027T221048Z-claude-63826` and are pending owner review.

- **Base revision:** first `46e21ef1` (`origin/dev`, merge of pull request #373). Before review pass 1 the coordinator merged `origin/dev` `9b82cd9d` into the branch (merge `c12a7425`, clean), so the merge base is now `3f23516a` (merge of pull request #376). The merge brought in documents only: the Claude Code reviewer invocation of pull request #375 (`docs/agent-task-protocol.md`, `docs/qualification/claude-code.md`) and the owner decisions of 2026-10-27 of pull request #376 (account pool and Git workspace contracts, ADRs 0005 and 0008, `docs/g3-plan.md`, two living specs, and their archived changes). `make verify` passed on `c12a7425` (coordinator), and the checks after pass 1 below ran on top of it.
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
- After review pass 1, on the working tree of `74456be6` with the design, findings, and pass records of the records commit: `npm run openspec -- validate issue-installation-certificates --strict`: valid; `make findings ARGS="validate"`: 53 findings files and 33 pass summary files valid; `make verify`: exit 0; 2380 tests, 2377 pass, 0 fail, 3 skipped; coverage lines 99.34%, branches 92.31%, functions 99.04%; every active OpenSpec change archives into strictly valid specs; `validate --all --strict` 70 passed. `make verify-installation` at `706b6b6a` content (the restart in place): exit 0, "built, bootstrapped, started, enrolled, restarted, certificates re-issued and served, removed"; its log holds no `PRIVATE KEY` line.

## Fails before the change

The new tests ran against the sources of `46e21ef1`, restored over the committed tree and rebuilt, then the tree was restored to `HEAD`:

- Redaction, scrubbing, the namespace, the private key check, and the composition: `logger.test.ts`, `secrets.test.ts`, `control-plane-store.test.ts`, `test/check-private-keys.test.ts`, `test/installation-composition.test.ts`, 52 tests, 6 fail: "PEM private keys of every type are redacted, whole or cut, and certificates stay", "a child environment drops TLS key files and PEM keys, and keeps the CA", "a text file is read back only while it is owner-only", "host ports are published on localhost only", "the broker requires TLS and the worker trusts the installation CA read-only", and the private key check file, whose script did not exist.
- Control plane: `installation-tls.test.ts` and `control-plane-settings.test.ts` fail to load, as the base exports neither the listener settings nor the host rules. `administration.integration.test.ts` and `control-plane-api.integration.test.ts`: 8 tests, 4 fail, among them "server certificates are issued again by the kept authority, which fails closed when lost" and "an unreadable broker CA fails and names its setting"; the API file fails to load.
- The `@taskelith/fleet` and `@taskelith/certificates` tests test new modules that did not exist at the base.

## Review passes

The coordinator assigned reviewer A, Codex CLI `gpt-6.1-sol` with reasoning effort `medium`, for passes 1 and 3. Each pass adds its section here and a line in `passes.jsonl`.

### Review pass 1

- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run by the coordinator, Maki, from the worktree.
- **Confirmation:** the output header names model `gpt-6.1-sol`, provider `openai`, sandbox `read-only`, reasoning effort `medium`, and session `01a17f91-f1b2-7712-83bd-fa2b090dcdfd`.
- **Revision reviewed:** `c12a7425`, against the merge base `3f23516a`.
- **Snapshot:** `0b1a0db08ec73173c7d35117203ba7a22dcc9b7808742e4efe10af27ce03d34e` before and after the pass, unchanged.
- **Result:** Critical 0, High 3, Medium 6, Low 2. The reviewer wrote in Bulgarian; `findings.jsonl` records each finding in English.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | High | Log text ran the marked secret rules before PEM redaction, so `password=` before a key left its body visible | PEM keys are redacted first; a logger test covers fields and correlation | `042077cb` |
| 2 | High | `redactSecrets` replaced revealed spans before the PEM scan, so a revealed word in a marker exposed the key body | PEM spans of the original text merge with the revealed spans; tests cover `redactSecrets` and `redactFailure` | `042077cb` |
| 3 | High | A missing `installation-ca.pem` let an initialized installation connect to NATS in plain text | A missing CA is allowed only without an installation record; else the settings and broker commands fail with the path before connecting; re-issue still runs | `8b625747` |
| 4 | Medium | The private key check missed indented YAML keys and JSON-escaped keys | Both forms are refused; tests generate keys at run time; bare markers in code stay allowed | `3c700c74` |
| 5 | Medium | The issuer accepted an authority certificate with another authority's key | The adapter refuses an authority that is no CA or does not match its key, and all certificates are issued before any file is written; a test shows the files unchanged | `1d5c3d8f` |
| 6 | Medium | The default broker CA was read with `readFileSync`, outside the namespace's checks | Read through `ControlPlaneNamespace`; tests refuse a symbolic link, a file readable by others, and another owner | `8b625747` |
| 7 | Medium | No shared conformance suite for the `CertificateIssuer` port | `CERTIFICATE_ISSUER_CONFORMANCE` in `@taskelith/fleet`, with an injected certificate inspector; the x509 adapter runs it with `NODE_CERTIFICATE_INSPECTOR` of `@taskelith/testing` | `1d5c3d8f` |
| 8 | Medium | `make verify-installation` stopped and started after the re-issue, hiding the command's own restart | Right after the command, `scripts/installation-tls-probe.ts` compares the presented API and NATS certificates with the new files, and a worker heartbeat must arrive after it; a unit test checks the restart call | `706b6b6a` |
| 9 | Medium | The guide implied that the browser certificate variables work in Compose | The guide, contract section 7, and the local installation delta state that the composition serves the API certificate until 26d; the guide separates the direct start | `706b6b6a`, `74456be6` |
| 10 | Low | This record named the stale base `46e21ef1` | Base revision above names the merge, what it brought in, and the checks repeated after it | records commit |
| 11 | Low | A server certificate ended 397 days after issuance, one hour past 397 days from its start | The end is computed from `notBefore`; the test asserts the difference of the two ends | `85e462b7` |

Fails before the fixes, each run before its fix was written: findings 1 and 2, the two new tests failed with the key body visible; findings 3 and 6, the three new settings and administration tests failed (the plain fallback returned no CA, the link and modes were accepted, and the broker command failed with `unavailable` after trying to connect); finding 4, the new test failed (`undefined` instead of a refusal); findings 5 and 7, the conformance case for a mismatched or non-CA authority and the unchanged-files test failed; finding 11, the test reported 397 days and one hour. Finding 8: with the restart line of `certificates` removed, the new unit test failed and `make verify-installation` failed with "API presents another certificate than api-certificate.pem" and the same for NATS; with it restored both pass.

### Review pass 2

Pending: reviewer B of another harness, briefed with pass 1's session.

## Limitations

- The design's Risks and limitations apply: installations initialized before this change fail closed without an authority; `NODE_EXTRA_CA_CERTS` adds the CA to the system roots until 26b pins it; the composition's browser endpoint serves the installation certificate; `issue-installation-certificates` writes no audit row.
- The composition still serves the browser endpoint on the API certificate (finding 9), as decided for 26d.
- The checks ran on macOS arm64 only; the Linux suites of `make verify-linux-cgroup` and the G2 failure scenarios on the composition were not run.

## Remaining gates

- Independent review passes under the [review process](/docs/governance.md#independent-review-process), and their fixes.
- Owner review of decisions 1, 2, 3, and 5 of the away run.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
