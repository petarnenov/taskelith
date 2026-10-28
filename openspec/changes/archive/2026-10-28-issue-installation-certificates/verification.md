# Verification

Date: 2026-10-28. The author's self-check and checks are recorded below, with review passes 1, 2, and 3, their fixes, and the unreviewed fixes after pass 3.

## Scope and source

G3 sub-change 26a of item 26 `secure-remote-connectivity` ([G3 plan](/docs/g3-plan.md#work-items), row 26), under owner decision D11 (b). The worker Maki assigned it, and it was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/issue-installation-certificates` on branch `issue-installation-certificates`. Decisions 1, 2, 3, and 5 of `design.md` come from away run `20261027T221048Z-claude-63826` and are pending owner review.

- **Base revision:** first `46e21ef1` (`origin/dev`, merge of pull request #373). Before review pass 1 the coordinator merged `origin/dev` `9b82cd9d` into the branch (merge `c12a7425`, clean), so the merge base is now `3f23516a` (merge of pull request #376). The merge brought in documents only: the Claude Code reviewer invocation of pull request #375 (`docs/agent-task-protocol.md`, `docs/qualification/claude-code.md`) and the owner decisions of 2026-10-27 of pull request #376 (account pool and Git workspace contracts, ADRs 0005 and 0008, `docs/g3-plan.md`, two living specs, and their archived changes). `make verify` passed on `c12a7425` (coordinator), and the checks after pass 1 below ran on top of it.
- **Revision verified:** `72cfabf4`, with this record and the ticked tasks uncommitted: the contract and spec deltas (`3edf9fbb`), the private key check (`823d1ce3`), the redaction (`2c0e4c90`), the issuer and its qualification (`d7778c8f`), the authority and the HTTPS listeners (`97f4e357`), the installation TLS (`2cb22f3a`), and the re-issue step of `make verify-installation` (`72cfabf4`).
- **Scope:** the installation CA at `init`; API and NATS server certificates and `issue-installation-certificates`; the `CertificateIssuer` port and the `@taskelith/certificates` adapter on `@peculiar/x509@2.2.0`; the worker API and browser endpoint over HTTPS from TLS 1.2; TLS on the installation's NATS with the CA as the default broker trust; redaction of PEM private keys; the refusal of tracked private keys.
- **Out of scope:** worker CA pinning and fingerprint enrollment (26b), rotation delivery (26c), the private-network bind and its acceptance (26d), CA rollover (G6), and TLS for PostgreSQL.

## Environment

macOS 26.6.2 arm64 (Apple M3, `uname -m` `arm64`), Node.js 24.22.1 from `.nvmrc`, Docker Engine 29.6.1; the integration services of `make services-up` for the integration tests.

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
- After review pass 2, on the working tree of `6770d360`: `make verify`: exit 0, twice (the second a mistyped Linux suites run that make took as the default target); 2384 tests, 2381 pass, 0 fail, 3 skipped; coverage lines 99.34%, branches 92.32%, functions 99.04%; `validate --all --strict` 70 passed; every active OpenSpec change archives into strictly valid specs. `make verify-installation`: exit 0, "built, bootstrapped, started, enrolled, restarted, certificates re-issued and served, removed".
- M3 attempts, on the same tree: `make linux-test-suites SUITES="test/g2-*.test.ts"`: exit 2, 14 of 21 fail because that target runs without network or services (`TASKELITH_POSTGRES_URL is not set`); the same three suites in the Linux test image on the host network against `scripts/services.sh run`: 14 fail with `ECONNREFUSED`, because Docker Desktop's host network does not reach the services' published ports on this macOS host. `make scenario-native-worker-lifecycle`: exit 2; the native Darwin arm64 worker enrolled over HTTPS (201), reached NATS over TLS (`worker.contact.online`), and the operator polled over HTTPS, but the task never ran: the worker reported admission pressure `disk-floor`, with 2.6 GiB free on the host disk.
- After review pass 3, on the working tree of `ea509c5b` with the pass 3 records: `make findings ARGS="validate"`: 53 findings files and 33 pass summary files valid; `make verify`: exit 0; 2386 tests, 2383 pass, 0 fail, 3 skipped; coverage lines 99.34%, branches 92.30%, functions 99.04%; `validate --all --strict` 70 passed; every active OpenSpec change archives into strictly valid specs. `make verify-installation`: exit 0, "built, bootstrapped, started, enrolled, restarted, certificates re-issued and served, removed", so the pinned NATS passed the tightened plain client probe; its log holds no `PRIVATE KEY` line.
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

- **Reviewer:** B, Claude Code `claude-opus-5-5`, effort `high`, plan mode.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, run by the coordinator from the worktree.
- **Confirmation:** the last `result` line names session `cd2c3d8e-002c-4f2c-8658-89b5fc195dcc`, and its `modelUsage` holds `claude-opus-5-5` only.
- **Revision reviewed:** `d9d44ebf`.
- **Snapshot:** `9baf0a6f88d4f7f7799f9be3f970da1f0e6b701f9a657b335b07428593140360` before and after, unchanged.
- **Pass 1 fixes:** all 11 confirmed; the notes on findings 3, 4, 8, and 9 lead to M2, L5, L6, L7, and L8 below.
- **Result:** Critical 0, High 0, Medium 3, Low 10, written in Bulgarian and recorded in English. M2 is a regression of the pass 1 fix of finding 8, so it names no missed pass; every other finding was present at pass 1 and names pass 1 (A) in `missedBy`.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| M1 | Medium | Three contracts still called the API and NATS plain | Execution wire, account pool, and source control contracts state the TLS of 26a and what 26b and 26d add; a grep for other plain claims found only the G3 plan's "G2 as built" list, which is historical | `6770d360` |
| M2 | Medium | The served certificate probe ran once, right after `compose restart` | Retried until `CONTACT_SECONDS` (90 s); with the restart removed, `make verify-installation` still failed: both servers presented the old certificates until "not served within 90s" | `61ab5f15` |
| M3 | Medium | The changed G2 scenario code was not run | Deferred, then run on Liki's native Ubuntu x86_64 host (Linux verification below); `fixed-unreviewed` in `findings.jsonl`, as no review pass checked it | none |
| L1 | Low | The qualification named a macOS x86_64 host | It names macOS 26.6.2 arm64 (Apple M3) | `6770d360` |
| L2 | Low | The issuer signed with an expired authority or one ending before the server certificate | Refused with `precondition-failed`, naming rollover as G6; conformance case, delta scenario "Authority near its end", contract section 7 | `3af3e8e5`, `6770d360` |
| L3 | Low | A bad browser key was reported under `TASKELITH_BROWSER_TLS_CERT` | The failure names the file at fault, `TASKELITH_BROWSER_TLS_KEY` for the key | `c0afe2cc` |
| L4 | Low | An API key mismatch named neither `api-key.pem` nor the remedy | It names `api-key.pem`, `api-certificate.pem`, and `make installation-certificates`; an integration test swaps the key | `c0afe2cc` |
| L5 | Low | "Before initialization" read as contradicting "Lost installation CA" | Its WHEN names neither an installation record nor an installation CA | `6770d360` |
| L6 | Low | The authority requirement did not name the failing commands and kept "stay plain without one" | It names `init` and `issue-installation-certificates` and refers client CA behavior to "Installation broker TLS" | `6770d360` |
| L7 | Low | Two local installation scenarios had no test | A composition test shows that no browser setting or host file reaches the control plane; the probe of `make verify-installation` checks that NATS refuses a plain client, with a unit test of both outcomes | `61ab5f15` |
| L8 | Low | The private key check missed double-escaped and single-line keys and read the working copy | Both forms refused; tracked files read from the index with `git cat-file --batch`; tests cover each and a key staged and then removed from the working copy | `fe2d4ae1` |
| L9 | Low | "running worker host" in the guide | "running installation" | `6770d360` |
| L10 | Low | "plain on localhost" for PostgreSQL | "plain on the Compose network, unpublished" in the delta, proposal, guide, and contract; the G3 plan's deferral row is unchanged | `6770d360` |

Fails before the fixes, each run before its fix was written: L2, the new conformance case failed with success for both authorities; L3 and L4, the new unit assertions failed on the old messages and details; L8, the nested, one-line, and staged-key tests failed; L7's plain client probe and composition test are new checks of behavior that already held. M2 was shown as above.

### Review pass 3

- **Reviewer:** A, Codex CLI `gpt-6.1-sol`, reasoning effort `medium`, read-only, confirming the pass 2 fixes only.
- **Invocation:** as pass 1, run by the coordinator, Maki, from the worktree.
- **Confirmation:** session `01a17fb9-fa50-78f3-8402-692bad6f5849`.
- **Revision reviewed:** `9c97bf65`, the range `d9d44ebf..9c97bf65`.
- **Snapshot:** `86d2b94912373f7c009a586653be0024e80ae025d9d09747380e19fb889b9149` before and after, unchanged.
- **Pass 2 fixes:** M2, L1 to L6, L8, L9, and L10 confirmed; M1 and L7 in part, which the new findings below complete; M3 still deferred, its deferral recorded honestly. The reviewer's `listen EPERM` in its sandbox kept it from running a TCP stand-in, so the Medium comes from reading the code.
- **Result:** Critical 0, High 0, Medium 1, Low 2, written in Bulgarian and recorded in English. Each is a defect of a pass 2 fix, so none names a missed pass. M1 and L7 are now `fixed-unreviewed` in `findings.jsonl`, as their completion was not reviewed.

| # | Severity | Finding | Resolution | Commit |
| --- | --- | --- | --- | --- |
| P3-M1 | Medium | The plain NATS client probe sent no credentials and took any `-ERR` as proof that TLS is required, so a broker with `allow_non_tls` that refuses the login would pass | Unreviewed fix: passes only when the INFO line advertises `tls_required` and the server then closes or sends `-ERR 'Secure Connection - TLS Required'`; an `Authorization Violation`, any other `-ERR`, `+OK`, `PONG`, a timeout, or a failed connection fails it; the probe still has no credentials | `af0e67d1` |
| P3-L1 | Low | "The installation has neither" in the source control contract contradicted its HTTPS | Unreviewed fix: "has no externally reachable ingress" | `ea509c5b` |
| P3-L2 | Low | Remaining gates left out `make verify-linux-cgroup` | Unreviewed fix: named below with the other Linux checks | this record |

**Decision on the Medium.** Under the three pass cap ([review process](/docs/governance.md#independent-review-process)), a Medium left after pass 3 needs the owner. The owner's away delegate chose to fix it without review and to run no pass 4 (away run `20261027T233939Z-claude-6580`, 2026-10-28). The two Lows are fixed without review, as the Low rule requires after pass 3.

**The refusal of the pinned broker.** Checked against `nats:2.15.1-alpine` at the pinned digest `sha256:7ae34c25…77fde`, with a certificate made at run time and user and password authorization: with TLS required, a plain client gets the INFO line with `"tls_required":true`, then the server logs "TLS handshake error: tls: first record does not look like a TLS handshake" and closes, with no `-ERR`. The binary holds the text `Secure Connection - TLS Required`, so that error also counts as the refusal. With `allow_non_tls` the INFO line has `"tls_available":true` without `tls_required`, and the plain client gets `-ERR 'Authorization Violation'`, which the old probe took as a refusal for TLS.

**Deviation from the decision, accepted.** The away decision asked the probe to pass only on the refusal text and to fail on a close without it. The pinned broker sends no refusal text: it advertises `tls_required` and closes. So the probe also passes on that close after a `tls_required` INFO; a login refusal still fails it. The coordinator, Niki, accepted this deviation on 2026-10-28.

**Fails before and passes after.** The new test "a broker that refuses a plain client only for its login fails the probe" uses a stand-in with `allow_non_tls` and authorization that refuses the plain login with `Authorization Violation`. On `9c97bf65` it failed: `reissueProblems` returned no problem instead of "NATS does not refuse a plain client as requiring TLS". On `af0e67d1` it passes, with the positive cases: the TLS stand-in that closes on the failed handshake and one that sends the TLS required error pass the probe; `PONG`, `+OK`, `Authorization Violation` after a `tls_required` INFO, a missing or false `tls_required`, a malformed INFO, a close before INFO, and a refused connection fail it.

## Linux verification (Liki, native Ubuntu x86_64)

Run by Liki and reported through the coordinator, on revision `6a0d8687fcce3de96e272a0ec2e9faa1890e7199` in a detached worktree whose `origin` matched it. The later `9a030d5b` changed only this record. Host: Linux `GEO-PetarPetrov` 7.0.0-38-generic #38-Ubuntu SMP PREEMPT_DYNAMIC, x86_64. Counts are tests, pass, fail, skipped, cancelled, todo.

- `make setup`: exit 0.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`, full: exit 0; 2404, 2357, 0, 47, 0, 0; 45 suites. The skips: 29 composed worker crash window tests (run by `make verify-linux-crash-windows` below), 15 macOS-only tests, 1 process reaper `ps` test (Linux scans `/proc`), 1 case-insensitive volume test, and race g (not applicable on Linux).
- G2 suites with PostgreSQL, NATS over TLS, and Toxiproxy reachable on the host network: `TMPDIR=… NODE_PIN=$(cat .nvmrc) bash scripts/with-pinned-node.sh use bash scripts/services.sh run taskelith-maki-g2-verify node --experimental-strip-types --test --test-reporter=spec test/g2-*.test.ts`: exit 0; 24, 23, 0, 1, 0, 0, the skip race g. The changed `test/g2-scenarios/scenario-installation.ts`, `test/g2-scenarios/crashing-worker.ts`, and `test/g2-cancellation-races.test.ts` ran and passed.
- `make verify-linux-crash-windows`: exit 0; 29, 29, 0, 0, 0, 0.
- `make verify-linux-cgroup`: exit 0; 17, 17, 0, 0, 0, 0.
- `make scenario-native-worker-lifecycle`: exit 2, "TASKELITH_CONTAINMENT_PARENT must be an absolute path". `start_native_worker` of `scripts/installation-scenarios.sh` sets neither `TASKELITH_CONTAINMENT_PARENT` nor `TASKELITH_EXECUTION_UID` and `TASKELITH_EXECUTION_GID`, which a Linux worker needs. It fails before any TLS or enrollment step, and `native-acceptance.sh` runs the scenario on macOS only, so the failure predates 26a and tests nothing of it. By the coordinator's ruling it is a limitation and a follow-up below, not a gate of 26a.

This run closes M3.

## First archive

The first archive commit `84cde2af` was checked on its own tree, the working tree after `npm run openspec -- archive issue-installation-certificates --yes`, on macOS arm64:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line, `change/2026-10-28-issue-installation-certificates`, passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only this change's edits, in `control-plane-api` (TLS listeners added), `execution-observability` (Logs without secrets modified), `installation-enrollment` (TLS plumbing renamed to Installation certificate authority and modified, Secret scrubbing modified, Installation server certificates added), `local-installation` (TLS of the local installation added), and `nats-transport` (Installation broker TLS added).
- The moved change has `findings.jsonl` and `passes.jsonl`; `make findings ARGS="validate"`: 53 findings files and 33 pass summary files valid.
- `make verify`: exit 0; 2386 tests, 2383 pass, 0 fail, 3 skipped; coverage lines 99.34%, branches 92.30%, functions 99.04%.

## Merge reconciliation (return from integration)

- **Return reason.** The coordinator returned the branch under [worker step 10](/docs/agent-task-protocol.md#worker-steps). Merging `origin/dev` `a520c067` (#378, item 27 `implement-worker-self-check-admission`) conflicted in `packages/modules/fleet/src/index.ts`, `openspec/specs/installation-enrollment/spec.md`, and `docs/contracts/execution-wire-contracts.md`.
- **Commits.** The revert `27e2d473` restored the active change and the living specs from before `84cde2af`. The merge `354158b2` merged `origin/dev` `a520c067`. Base: `git merge-base 84cde2af origin/dev` = `3f23516a2e4ef8724f38e5c9c67267225f40ff16`. This record keeps the Linux verification and the M3 outcome of `84cde2af`, which the revert had undone.
- **Resolutions.**
  - `openspec/specs/installation-enrollment/spec.md` did not conflict after the revert. The merge took dev's four new requirements unchanged, and `git diff origin/dev 354158b2 -- openspec/specs` is empty.
  - `packages/modules/fleet/src/index.ts` keeps both export sets. First come this change's `installation-certificates` and `certificate-issuer` exports, then item 27's `worker-admission` domain exports and its three port modules.
  - `docs/contracts/execution-wire-contracts.md`: the `execution.asyncapi.json` row is dev's, at version 0.7.0 (item 27). The `execution.openapi.json` row is this change's HTTPS text; dev had not changed it since the base.
- **Reconciled deltas.** `git diff 3f23516a origin/dev -- openspec/specs` shows that, of this change's five capabilities, dev changed only `installation-enrollment`. It only adds four requirements: "Worker admission on the self-check", "Report results checked by the control plane", "Running executions survive a failed self-check", and "New grants only for admitted workers". Dev changed none of the requirements this change renames or modifies ("TLS plumbing", "Secret scrubbing", "Logs without secrets"), so no delta was rewritten. The ADDED names of this change do not collide with item 27's.
- **Semantic check.** Item 27's self-check and admission reach the broker through the existing `settings.natsTls` in `apps/worker/src/worker-start.ts`. Its tests use `https://` control plane URLs or fakes, and its control plane integration tests run on this change's HTTPS fixtures. Nothing uses plain HTTP or plain NATS against the installation, and no fix was needed.
- **Checks on the merge `354158b2`** (macOS arm64):
  - `npm run openspec -- validate issue-installation-certificates --strict`: valid.
  - `make verify`: exit 0; 2452 tests, 2449 pass, 0 fail; the coverage gate passed; the dependency inventory is current; every active change archives into strictly valid specs; contract compatibility is clean.
  - `make verify-installation`: exit 0, "built, bootstrapped, started, enrolled, restarted, certificates re-issued and served, removed".
- **Linux.** Liki's run at `6a0d8687` (above) predates this merge. It stays valid for the TLS parts, which the merge left unchanged.
- **Review.** Reviewer A reviewed the resolved diff and this reconciliation as artifact `merge-reconciliation`, pass 1, in `passes.jsonl`, so the pass does not count against the change's three passes.
  - Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run by Maki from the worktree.
  - Confirmation: model `gpt-6.1-sol`, sandbox `read-only`, reasoning effort `medium`, session `01a17fdf-0c15-7332-93b0-486f16537c04`.
  - Revision reviewed: `354158b2`.
  - Snapshot: `2e0ce9ff4cc0ec81b65deae5aa0d18140e537690fb654f7cd26533b9f1833f9a` before and after, unchanged.
  - Result: Critical 0, High 0, Medium 0, Low 0; no findings.
  - The reviewer confirmed that both export sets are kept without duplicates, with AsyncAPI 0.7.0 from dev and this change's HTTPS text. It confirmed that the living specs equal `a520c067`, that dev changed no MODIFIED or RENAMED requirement, and that the ADDED names do not collide. It found no semantic conflict. It also ran the strict validation and `verify:comments`.

## Archive

Checked on the tree of this archive commit, the working tree after `npm run openspec -- archive issue-installation-certificates --yes` on top of the merge `354158b2`, on macOS arm64:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line, `change/2026-10-28-issue-installation-certificates`, passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only this change's edits, the same as at `84cde2af`. They are in `control-plane-api` (TLS listeners added), `execution-observability` (Logs without secrets modified), `installation-enrollment` (TLS plumbing renamed to Installation certificate authority and modified, Secret scrubbing modified, Installation server certificates added), `local-installation` (TLS of the local installation added), and `nats-transport` (Installation broker TLS added). Item 27's four admission requirements in `installation-enrollment` are intact.
- The moved change has `findings.jsonl` and `passes.jsonl`; `make findings ARGS="validate"`: 55 findings files and 35 pass summary files valid.
- `make verify`: exit 0; 2452 tests, 2449 pass, 0 fail, 3 skipped; coverage lines 99.36%, branches 92.32%, functions 99.04%.

## Limitations

- The design's Risks and limitations apply: installations initialized before this change fail closed without an authority; `NODE_EXTRA_CA_CERTS` adds the CA to the system roots until 26b pins it; the composition's browser endpoint serves the installation certificate; `issue-installation-certificates` writes no audit row.
- The composition still serves the browser endpoint on the API certificate (finding 9), as decided for 26d.
- The changed G2 scenario code, the Linux suites, and the full `make verify` ran on Liki's native Ubuntu x86_64 host (above). The native worker scenario was not run past the disk floor on macOS: with `trust_installation_ca` and `TASKELITH_NATS_CA`, the native worker enrolled over HTTPS and reached NATS over TLS, then stopped at the worker's disk floor, with 2.6 GiB free on this host; no disk was freed for it. On Linux the scenario stops earlier, as above.

## Remaining gates

- Owner review of the away delegate's decision on the pass 3 Medium (fixed without review, no pass 4).
- Owner review of decisions 1, 2, 3, and 5 of the away run.
- Follow-up, not a gate of 26a: the native Linux worker scenario lacks the containment and execution environment (`TASKELITH_CONTAINMENT_PARENT`, `TASKELITH_EXECUTION_UID`, `TASKELITH_EXECUTION_GID`).
- Integration into dev by the coordinator (single pull request).
